// ═══════════════════════════════════════════════════════════════
// PHANTOM FLEET SDK — MERKLE TREE UTILITIES
// ═══════════════════════════════════════════════════════════════
//
// Real Poseidon BN254 hash via circomlibjs.
// Matches the Noir circuit's poseidon::bn254 parameterization.
// ═══════════════════════════════════════════════════════════════

import { MerkleTree, TOTAL_CELLS, GRID_SIZE } from './types';

import { buildPoseidon } from 'circomlibjs';

// ─── Poseidon Hash (Real BN254) ────────────────────────────

let poseidonInstance: any = null;

async function getPoseidon() {
    if (!poseidonInstance) {
        poseidonInstance = await buildPoseidon();
    }
    return poseidonInstance;
}

async function poseidonHash(...inputs: (string | number | bigint)[]): Promise<string> {
    const poseidon = await getPoseidon();
    const F = poseidon.F;
    const inputElements = inputs.map(x => F.e(BigInt(x)));
    const hash = poseidon(inputElements);
    return '0x' + F.toString(hash, 16).padStart(64, '0');
}

// ─── Merkle Tree Construction ──────────────────────────────

export async function buildMerkleTree(
    grid: number[],
    nonce: bigint
): Promise<MerkleTree> {
    if (grid.length !== TOTAL_CELLS) {
        throw new Error(`Grid must be ${TOTAL_CELLS} cells, got ${grid.length}`);
    }

    const leaves: string[] = [];
    for (let i = 0; i < TOTAL_CELLS; i++) {
        const x = i % GRID_SIZE;
        const y = Math.floor(i / GRID_SIZE);
        const leaf = await poseidonHash(grid[i], x, y, nonce);
        leaves.push(leaf);
    }

    // Pad to 64 (nearest power of 2)
    const targetSize = Math.pow(2, Math.ceil(Math.log2(TOTAL_CELLS)));
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

    return { root: current[0], layers, leaves: layers[0] };
}

/**
 * Compute Poseidon commitment matching Noir circuit hash_grid():
 *   commitment = poseidon(poseidon(chunk1, chunk2, chunk3), nonce)
 */
export async function computeCommitment(
    grid: number[],
    nonce: bigint
): Promise<string> {
    if (grid.length !== TOTAL_CELLS) {
        throw new Error(`Grid must be ${TOTAL_CELLS} cells`);
    }

    const chunk1 = await poseidonHash(...grid.slice(0, 15));
    const chunk2 = await poseidonHash(...grid.slice(15, 30));
    const chunk3 = await poseidonHash(...grid.slice(30, 36), 0);
    const gridHash = await poseidonHash(chunk1, chunk2, chunk3);

    return poseidonHash(gridHash, nonce);
}

export function getMerklePath(
    tree: MerkleTree,
    leafIndex: number
): [string, number][] {
    const path: [string, number][] = [];
    let idx = leafIndex;

    for (let level = 0; level < tree.layers.length - 1; level++) {
        const layer = tree.layers[level];
        const isRight = idx % 2 === 1;
        const siblingIdx = isRight ? idx - 1 : idx + 1;
        const sibling = layer[siblingIdx] || layer[idx];
        path.push([sibling, isRight ? 1 : 0]);
        idx = Math.floor(idx / 2);
    }

    return path;
}

export function findClosestShip(
    grid: number[],
    targetX: number,
    targetY: number
): { x: number; y: number; distance: number } {
    let closest = { x: 0, y: 0, distance: Infinity };

    for (let i = 0; i < TOTAL_CELLS; i++) {
        if (grid[i] !== 1) continue;
        const cellX = i % GRID_SIZE;
        const cellY = Math.floor(i / GRID_SIZE);
        const dist = Math.max(Math.abs(targetX - cellX), Math.abs(targetY - cellY));
        if (dist < closest.distance) {
            closest = { x: cellX, y: cellY, distance: dist };
        }
    }

    if (closest.distance === Infinity) throw new Error('No ship cells found in grid');
    return closest;
}

export async function verifyMerklePath(
    leaf: string,
    path: [string, number][],
    root: string
): Promise<boolean> {
    let current = leaf;
    for (const [sibling, direction] of path) {
        if (direction === 0) {
            current = await poseidonHash(current, sibling);
        } else {
            current = await poseidonHash(sibling, current);
        }
    }
    return current === root;
}
