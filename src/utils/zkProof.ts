/**
 * ZK Proof Utilities for Phantom Fleet
 * 
 * Provides Merkle tree construction, Poseidon commitment,
 * shot proof generation, and proof serialization.
 * 
 * NOTE: This uses simplified/mock implementations for the cryptographic
 * primitives. In production, these would use actual Noir WASM circuits
 * and Poseidon hash implementations. The proof generation is offloaded
 * to a Web Worker to prevent UI blocking.
 */

// ── Types ──────────────────────────────────────────────────

export interface MerkleNode {
    hash: string;
    left?: MerkleNode;
    right?: MerkleNode;
}

export interface MerkleTree {
    root: string;
    layers: string[][];
    leaves: string[];
}

export interface ShotWitness {
    shipGrid: number[];          // 36-element flat grid (0 = water, 1 = ship)
    merklePath: string[];        // Path from target leaf to root
    targetX: number;             // 0-5
    targetY: number;             // 0-5
    closestShipX: number;
    closestShipY: number;
    layoutNonce: string;
}

export interface ZKProof {
    proof: string;               // Base64-encoded proof bytes
    publicInputs: string[];      // [commitmentRoot, targetX, targetY, distance, isHit]
}

// ── Helpers ────────────────────────────────────────────────

/** Simple hash function (mock Poseidon). In production use circomlibjs Poseidon. */
async function mockPoseidon(...inputs: (string | number)[]): Promise<string> {
    const data = inputs.join(':');
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Public API ─────────────────────────────────────────────

/**
 * Build a Merkle tree from a 6×6 ship grid.
 * Each cell is hashed with its coordinates + nonce to form a leaf.
 */
export async function buildMerkleTree(
    shipGrid: number[],
    nonce: string = crypto.randomUUID()
): Promise<{ tree: MerkleTree; nonce: string }> {
    if (shipGrid.length !== 36) throw new Error('Grid must be 36 cells');

    // Build leaves
    const leaves: string[] = [];
    for (let i = 0; i < 36; i++) {
        const x = i % 6;
        const y = Math.floor(i / 6);
        const leaf = await mockPoseidon(shipGrid[i], x, y, nonce);
        leaves.push(leaf);
    }

    // Build tree layers bottom-up
    const layers: string[][] = [leaves];
    let currentLayer = leaves;

    while (currentLayer.length > 1) {
        const nextLayer: string[] = [];
        for (let i = 0; i < currentLayer.length; i += 2) {
            const left = currentLayer[i];
            const right = currentLayer[i + 1] || left; // duplicate if odd
            const parent = await mockPoseidon(left, right);
            nextLayer.push(parent);
        }
        layers.push(nextLayer);
        currentLayer = nextLayer;
    }

    return {
        tree: {
            root: currentLayer[0],
            layers,
            leaves,
        },
        nonce,
    };
}

/**
 * Compute a Poseidon commitment of the entire grid layout.
 * This is the value submitted on-chain via commit_layout().
 */
export async function computeCommitment(
    grid: number[],
    nonce: string
): Promise<string> {
    const gridStr = grid.join(',');
    return mockPoseidon(gridStr, nonce);
}

/**
 * Get Merkle path from leaf index to root.
 */
export function getMerklePath(tree: MerkleTree, leafIndex: number): string[] {
    const path: string[] = [];
    let idx = leafIndex;

    for (let level = 0; level < tree.layers.length - 1; level++) {
        const layer = tree.layers[level];
        const isRight = idx % 2 === 1;
        const siblingIdx = isRight ? idx - 1 : idx + 1;
        path.push(layer[siblingIdx] || layer[idx]);
        idx = Math.floor(idx / 2);
    }

    return path;
}

/**
 * Generate a ZK proof for a shot.
 * In production this calls the Noir WASM prover via Web Worker.
 * Returns { proof, publicInputs }.
 */
export async function generateShotProof(witness: ShotWitness): Promise<ZKProof> {
    // Calculate distance for the proximity ring
    const dx = Math.abs(witness.targetX - witness.closestShipX);
    const dy = Math.abs(witness.targetY - witness.closestShipY);
    const distance = Math.max(dx, dy); // Chebyshev distance
    const isHit = witness.shipGrid[witness.targetY * 6 + witness.targetX] === 1;

    // Mock proof generation (simulates ~6-8s compute in worker)
    const proofData = await mockPoseidon(
        JSON.stringify(witness),
        Date.now().toString()
    );

    return {
        proof: btoa(proofData),
        publicInputs: [
            await computeCommitment(witness.shipGrid, witness.layoutNonce),
            witness.targetX.toString(),
            witness.targetY.toString(),
            distance.toString(),
            isHit ? '1' : '0',
        ],
    };
}

/**
 * Serialize a ZKProof into the format expected by the Soroban contract.
 * Returns a hex-encoded string suitable for contract submission.
 */
export function serializeProof(proof: ZKProof): string {
    const payload = {
        pi: proof.proof,
        pub: proof.publicInputs,
    };
    const jsonStr = JSON.stringify(payload);
    const encoder = new TextEncoder();
    const bytes = encoder.encode(jsonStr);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
