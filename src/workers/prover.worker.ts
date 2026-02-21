/**
 * Web Worker for ZK Proof Generation
 * 
 * Runs proof computation off the main thread to prevent
 * blocking the UI during the ~8 second proof generation.
 * 
 * Messages:
 *   IN:  { type: 'GENERATE_PROOF', witness: ShotWitness }
 *   OUT: { type: 'PROOF_READY', proof: ZKProof }
 *     |  { type: 'PROOF_ERROR', error: string }
 *   OUT: { type: 'PROOF_PROGRESS', percent: number }
 */

// We inline the proof logic here since workers can't import
// from the main bundle in all environments.

interface ShotWitness {
    shipGrid: number[];
    merklePath: string[];
    targetX: number;
    targetY: number;
    closestShipX: number;
    closestShipY: number;
    layoutNonce: string;
}

async function mockPoseidon(...inputs: (string | number)[]): Promise<string> {
    const data = inputs.join(':');
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function computeCommitmentInWorker(grid: number[], nonce: string): Promise<string> {
    return mockPoseidon(grid.join(','), nonce);
}

async function generateProofInWorker(witness: ShotWitness) {
    const totalSteps = 8;

    // Simulate proof generation with progress updates
    for (let step = 1; step <= totalSteps; step++) {
        await new Promise(r => setTimeout(r, 800 + Math.random() * 200));
        self.postMessage({
            type: 'PROOF_PROGRESS',
            percent: Math.round((step / totalSteps) * 100)
        });
    }

    const dx = Math.abs(witness.targetX - witness.closestShipX);
    const dy = Math.abs(witness.targetY - witness.closestShipY);
    const distance = Math.max(dx, dy);
    const isHit = witness.shipGrid[witness.targetY * 6 + witness.targetX] === 1;

    const proofData = await mockPoseidon(
        JSON.stringify(witness),
        Date.now().toString()
    );

    const commitment = await computeCommitmentInWorker(witness.shipGrid, witness.layoutNonce);

    return {
        proof: btoa(proofData),
        publicInputs: [
            commitment,
            witness.targetX.toString(),
            witness.targetY.toString(),
            distance.toString(),
            isHit ? '1' : '0',
        ],
    };
}

self.onmessage = async (e: MessageEvent) => {
    const { type, witness } = e.data;

    if (type === 'GENERATE_PROOF') {
        try {
            const result = await generateProofInWorker(witness);
            self.postMessage({ type: 'PROOF_READY', proof: result });
        } catch (err: any) {
            self.postMessage({ type: 'PROOF_ERROR', error: err.message || 'Unknown error' });
        }
    }
};
