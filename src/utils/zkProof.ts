/**
 * ZK Proof Utilities for Phantom Fleet
 *
 * Uses real Poseidon BN254 hash via circomlibjs (same as Noir circuit).
 * Proof generation uses @noir-lang/noir_js + Barretenberg backend.
 * No mocks. Production-ready.
 */

// @ts-expect-error - circomlibjs has no types
import { buildPoseidon } from 'circomlibjs';

// -- Types -----------------------------------------------------------

export interface MerkleTree {
    root: string;
    layers: string[][];
    leaves: string[];
}

export interface ShotWitness {
    shipGrid: number[];
    merklePath: string[];
    targetX: number;
    targetY: number;
    closestShipX: number;
    closestShipY: number;
    layoutNonce: string; // always a hex Field string like "0xabc..." or decimal bigint string
}

export interface ZKProof {
    proof: string;
    publicInputs: string[];
}

// -- Poseidon Hash (Real BN254) --------------------------------------

let poseidonInstance: any = null;

async function getPoseidon() {
    if (!poseidonInstance) {
        poseidonInstance = await buildPoseidon();
    }
    return poseidonInstance;
}

/**
 * Real Poseidon BN254 hash using circomlibjs.
 * Matches Noir's poseidon::bn254 hash function.
 * Inputs must be numeric: numbers, bigints, or hex strings starting with 0x.
 */
async function poseidonHash(...inputs: (string | number | bigint)[]): Promise<string> {
    const poseidon = await getPoseidon();
    const F = poseidon.F;
    const inputElements = inputs.map(x => {
        if (typeof x === 'bigint') return F.e(x);
        if (typeof x === 'number') return F.e(BigInt(x));
        // string: must be hex "0x..." or decimal
        if (typeof x === 'string' && x.startsWith('0x')) return F.e(BigInt(x));
        return F.e(BigInt(x));
    });
    const hash = poseidon(inputElements);
    return '0x' + F.toString(hash, 16).padStart(64, '0');
}

// -- Nonce Generation ------------------------------------------------

/**
 * Generate a cryptographically random nonce as a Field element (bigint < BN254 order).
 * Returns as a decimal string safe for BigInt() conversion.
 * NOTE: crypto.randomUUID() returns a UUID which cannot be converted to BigInt.
 * We must use a random 31-byte value within the BN254 scalar field.
 */
export function generateNonce(): string {
    // BN254 scalar field order (r):
    // 21888242871839275222246405745257275088548364400416034343698204186575808495617
    const BN254_R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
    const bytes = new Uint8Array(31); // 31 bytes = 248 bits, safely below BN254 field
    crypto.getRandomValues(bytes);
    let val = 0n;
    for (const b of bytes) {
        val = (val << 8n) | BigInt(b);
    }
    return (val % BN254_R).toString();
}

// -- Commitment Computation ------------------------------------------

/**
 * Compute Poseidon commitment matching Noir circuit hash_grid():
 *   chunk1 = poseidon(grid[0..15])
 *   chunk2 = poseidon(grid[15..30])
 *   chunk3 = poseidon(grid[30..36], 0)
 *   gridHash = poseidon(chunk1, chunk2, chunk3)
 *   commitment = poseidon(gridHash, nonce)
 *
 * nonce must be a decimal string that can be passed to BigInt().
 */
export async function computeCommitment(
    grid: number[],
    nonce: string
): Promise<string> {
    if (grid.length !== 36) throw new Error('Grid must be 36 cells');

    const chunk1 = await poseidonHash(...grid.slice(0, 15));
    const chunk2 = await poseidonHash(...grid.slice(15, 30));
    const chunk3 = await poseidonHash(...grid.slice(30, 36), 0);
    const gridHash = await poseidonHash(chunk1, chunk2, chunk3);

    return poseidonHash(gridHash, nonce);
}

// -- Merkle Tree (for shot witness) ----------------------------------

/**
 * Build a depth-6 Merkle tree over 36 leaves (padded to 64).
 * Leaf_i = poseidon(grid[i], x_i, y_i, nonce)
 *
 * nonce MUST be a numeric string (decimal or hex 0x...) — NOT a UUID.
 * Use generateNonce() to create a valid nonce.
 */
export async function buildMerkleTree(
    shipGrid: number[],
    nonce: string = generateNonce()
): Promise<{ tree: MerkleTree; nonce: string }> {
    if (shipGrid.length !== 36) throw new Error('Grid must be 36 cells');

    const leaves: string[] = [];
    for (let i = 0; i < 36; i++) {
        const x = i % 6;
        const y = Math.floor(i / 6);
        const leaf = await poseidonHash(shipGrid[i], x, y, nonce);
        leaves.push(leaf);
    }

    // Pad to 64 (nearest power of 2 >= 36)
    const targetSize = 64;
    while (leaves.length < targetSize) {
        leaves.push(await poseidonHash(0, leaves.length, 0, nonce));
    }

    const layers: string[][] = [leaves.slice()];
    let current = leaves.slice();

    while (current.length > 1) {
        const next: string[] = [];
        for (let i = 0; i < current.length; i += 2) {
            const left = current[i];
            const right = current[i + 1] || left;
            const parent = await poseidonHash(left, right);
            next.push(parent);
        }
        layers.push(next);
        current = next;
    }

    return {
        tree: { root: current[0], layers, leaves: layers[0] },
        nonce,
    };
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
 * Find closest ship cell using Chebyshev distance.
 */
export function findClosestShip(
    grid: number[],
    targetX: number,
    targetY: number
): { x: number; y: number; distance: number } {
    let closest = { x: 0, y: 0, distance: Infinity };

    for (let i = 0; i < 36; i++) {
        if (grid[i] !== 1) continue;
        const cellX = i % 6;
        const cellY = Math.floor(i / 6);
        const dist = Math.max(Math.abs(targetX - cellX), Math.abs(targetY - cellY));
        if (dist < closest.distance) {
            closest = { x: cellX, y: cellY, distance: dist };
        }
    }

    if (closest.distance === Infinity) throw new Error('No ship cells found');
    return closest;
}

/**
 * Generate a real ZK proof using Noir circuit + Barretenberg backend.
 * Public inputs order: [commitment, targetX, targetY, minDist, maxDist, isHit]
 */
export async function generateShotProof(witness: ShotWitness): Promise<ZKProof> {
    const targetIndex = witness.targetY * 6 + witness.targetX;
    const isHit = witness.shipGrid[targetIndex] === 1;

    let minDist = 0;
    let maxDist = 0;
    if (!isHit) {
        const closest = findClosestShip(witness.shipGrid, witness.targetX, witness.targetY);
        minDist = closest.distance;
        maxDist = closest.distance;
    }

    const commitment = await computeCommitment(witness.shipGrid, witness.layoutNonce);

    // Load Noir circuit and generate real proof
    const { Noir } = await import('@noir-lang/noir_js');
    const { BarretenbergBackend } = await import('@noir-lang/backend_barretenberg');

    // Load compiled circuit artifact from /public/circuits/
    const circuitResponse = await fetch('/circuits/phantom_fleet.json');
    if (!circuitResponse.ok) throw new Error('Circuit artifact not found at /circuits/phantom_fleet.json');
    const circuit = await circuitResponse.json();

    const backend = new BarretenbergBackend(circuit);
    const noir = new Noir(circuit);

    // Build Merkle path for closest ship cell
    const closestIdx = witness.closestShipY * 6 + witness.closestShipX;
    const { tree } = await buildMerkleTree(witness.shipGrid, witness.layoutNonce);
    const path = getMerklePath(tree, closestIdx);

    const merklePath: string[][] = path.map((sibling, level) => {
        const idx = closestIdx >> level;
        const isRight = idx % 2 === 1;
        return [sibling, isRight ? '1' : '0'];
    });

    // Pad merkle path to exactly 6 levels
    while (merklePath.length < 6) {
        merklePath.push(['0x0000000000000000000000000000000000000000000000000000000000000000', '0']);
    }
    // Truncate to exactly 6 levels
    merklePath.splice(6);

    // nonce as hex field string (Noir expects 0x-prefixed hex)
    const nonceHex = '0x' + BigInt(witness.layoutNonce).toString(16).padStart(64, '0');

    const circuitInputs = {
        ship_grid: witness.shipGrid.map(String),
        merkle_path: merklePath,
        closest_ship_x: String(witness.closestShipX),
        closest_ship_y: String(witness.closestShipY),
        layout_nonce: nonceHex,
        target_x: String(witness.targetX),
        target_y: String(witness.targetY),
        layout_commitment: commitment,
        min_dist: String(minDist),
        max_dist: String(maxDist),
        is_hit: isHit ? '1' : '0',
    };

    const { witness: noirWitness } = await noir.execute(circuitInputs as any);
    const proof = await backend.generateProof(noirWitness);
    const proofBytes = Buffer.from(proof.proof);
    if (proofBytes.length !== 256) {
        await backend.destroy();
        throw new Error(
            `Incompatible proof format: contract requires Groth16 256-byte proof, got ${proofBytes.length} bytes from current Noir/Barretenberg backend.`
        );
    }
    const proofHex = proofBytes.toString('base64');

    await backend.destroy();

    return {
        proof: proofHex,
        publicInputs: [
            commitment,
            witness.targetX.toString(),
            witness.targetY.toString(),
            minDist.toString(),
            maxDist.toString(),
            isHit ? '1' : '0',
        ],
    };
}

/**
 * Serialize proof for Soroban contract submission.
 */
export function serializeProof(proof: ZKProof): string {
    const payload = { pi: proof.proof, pub: proof.publicInputs };
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
