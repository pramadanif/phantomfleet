/**
 * ZK Proof Utilities for Phantom Fleet
 *
 * Uses real Poseidon BN254 hash via circomlibjs (same as Noir circuit).
 * Proof generation for gameplay is handled by Circom worker.
 */

import { buildPoseidon } from 'circomlibjs';

// -- Types -----------------------------------------------------------

export interface MerkleTree {
    root: string;
    layers: string[][];
    leaves: string[];
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


