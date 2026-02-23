/**
 * Web Worker for ZK Proof Generation (Circom + SnarkJS)
 *
 * Messages:
 *   IN:  { type: 'GENERATE_PROOF', witness: ShotWitness }
 *   OUT: { type: 'PROOF_READY', proof: ZKProof }
 *     |  { type: 'PROOF_ERROR', error: string }
 *   OUT: { type: 'PROOF_PROGRESS', percent: number }
 */

// @ts-expect-error — circomlibjs has no types
import { buildPoseidon } from 'circomlibjs';

interface ShotWitness {
    shipGrid: number[];
    targetX: number;
    targetY: number;
    layoutNonce: string;
}

interface ZKProof {
    proof: string; // base64, raw 256-byte Groth16 proof
    publicInputs: string[];
}

// ── Poseidon BN254 ───────────────────────────────────────

let poseidonInstance: any = null;

async function getPoseidon() {
    if (!poseidonInstance) {
        poseidonInstance = await buildPoseidon();
    }
    return poseidonInstance;
}

async function poseidonHashDec(...inputs: (string | number | bigint)[]): Promise<string> {
    const poseidon = await getPoseidon();
    const F = poseidon.F;
    const prepared = inputs.map((value) => F.e(BigInt(value)));
    const hash = poseidon(prepared);
    return F.toString(hash);
}

async function computeCommitmentDec(grid: number[], nonce: string): Promise<string> {
    const chunk1 = await poseidonHashDec(...grid.slice(0, 15));
    const chunk2 = await poseidonHashDec(...grid.slice(15, 30));
    const chunk3 = await poseidonHashDec(...grid.slice(30, 36), 0);
    const gridHash = await poseidonHashDec(chunk1, chunk2, chunk3);
    return poseidonHashDec(gridHash, nonce);
}

// ── Encoding helpers (must match successful E2E variant) ──────────

function fieldToHex32(value: string | number | bigint): string {
    return BigInt(value).toString(16).padStart(64, '0').slice(-64);
}

function g1ToHex(point: [string, string]): string {
    return fieldToHex32(point[0]) + fieldToHex32(point[1]);
}

function g2ToHexSwapFq2(point: [[string, string], [string, string]]): string {
    const x0 = point[0][1];
    const x1 = point[0][0];
    const y0 = point[1][1];
    const y1 = point[1][0];
    return fieldToHex32(x0) + fieldToHex32(x1) + fieldToHex32(y0) + fieldToHex32(y1);
}

function proofToHex256(proofJson: any): string {
    const a = g1ToHex([proofJson.pi_a[0], proofJson.pi_a[1]]);
    const b = g2ToHexSwapFq2([
        [proofJson.pi_b[0][0], proofJson.pi_b[0][1]],
        [proofJson.pi_b[1][0], proofJson.pi_b[1][1]],
    ]);
    const c = g1ToHex([proofJson.pi_c[0], proofJson.pi_c[1]]);
    const hex = a + b + c;
    if (hex.length !== 512) {
        throw new Error(`Invalid proof size: expected 512 hex chars, got ${hex.length}`);
    }
    return hex;
}

function hexToBase64(hex: string): string {
    const pairs = hex.match(/.{1,2}/g) || [];
    const bytes = new Uint8Array(pairs.map((pair) => parseInt(pair, 16)));
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// ── Proof Generation ───────────────────────────────────────

async function generateProofInWorker(witness: ShotWitness): Promise<ZKProof> {
    self.postMessage({ type: 'PROOF_PROGRESS', percent: 5 });

    const targetIndex = witness.targetY * 6 + witness.targetX;
    const isHit = witness.shipGrid[targetIndex] === 1;
    const minDist = 0;
    const maxDist = 0;

    const commitmentDec = await computeCommitmentDec(witness.shipGrid, witness.layoutNonce);

    self.postMessage({ type: 'PROOF_PROGRESS', percent: 25 });

    const input = {
        ship_grid: witness.shipGrid,
        layout_nonce: witness.layoutNonce,
        target_x: witness.targetX,
        target_y: witness.targetY,
        layout_commitment: commitmentDec,
        min_dist: minDist,
        max_dist: maxDist,
        is_hit: isHit ? 1 : 0,
    };

    const snarkjs = await import('snarkjs');

    self.postMessage({ type: 'PROOF_PROGRESS', percent: 45 });

    const wasmUrl = '/circuits/circom/phantom_fleet.wasm';
    const zkeyUrl = '/circuits/circom/circuit_final.zkey';

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmUrl, zkeyUrl);

    self.postMessage({ type: 'PROOF_PROGRESS', percent: 80 });

    if (!Array.isArray(publicSignals) || publicSignals.length !== 6) {
        throw new Error(`Unexpected public signal length: ${publicSignals?.length ?? 'unknown'}`);
    }

    if (BigInt(publicSignals[0]) !== BigInt(commitmentDec)) {
        throw new Error('Public signal commitment mismatch.');
    }

    const proofHex = proofToHex256(proof);
    const proofBase64 = hexToBase64(proofHex);

    self.postMessage({ type: 'PROOF_PROGRESS', percent: 100 });

    return {
        proof: proofBase64,
        publicInputs: publicSignals.map((x: any) => String(x)),
    };
}

self.onmessage = async (e: MessageEvent) => {
    const { type, witness } = e.data;

    if (type === 'GENERATE_PROOF') {
        try {
            const result = await generateProofInWorker(witness as ShotWitness);
            self.postMessage({ type: 'PROOF_READY', proof: result });
        } catch (err: any) {
            self.postMessage({ type: 'PROOF_ERROR', error: err?.message || 'Unknown error' });
        }
    }
};
