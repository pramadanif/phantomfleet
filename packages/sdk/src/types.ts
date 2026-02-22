// ═══════════════════════════════════════════════════════════════
// PHANTOM FLEET SDK — TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════

/** Flattened 6×6 ship grid. 1 = ship, 0 = water. */
export type ShipGrid = number[];

/** Merkle tree for grid commitment verification. */
export interface MerkleTree {
    root: string;
    layers: string[][];
    leaves: string[];
}

/** Witness data required by the Noir circuit to generate a shot proof. */
export interface ShotWitness {
    shipGrid: number[];                   // 36-element flat array
    merklePath: [string, number][];       // [sibling_hash, direction] per level
    targetX: number;                      // 0-5
    targetY: number;                      // 0-5
    closestShipX: number;                 // X of nearest ship cell (private)
    closestShipY: number;                 // Y of nearest ship cell (private)
    layoutNonce: bigint;                  // Nonce used in Poseidon commitment
}

/** Groth16 proof output from the Noir prover. */
export interface ShotProof {
    proof: Uint8Array;                    // Groth16 proof bytes (256 bytes)
    publicInputs: string[];              // Ordered field elements:
    // [commitment, target_x, target_y,
    //  min_dist, max_dist, is_hit]
}

/** Result of a shot, returned from the Soroban contract. */
export interface ShotResult {
    isHit: boolean;
    proximityMin: number;                 // Chebyshev lower bound (0 if hit)
    proximityMax: number;                 // Chebyshev upper bound (0 if hit)
    txHash: string;
    explorerUrl: string;
}

/** On-chain game state retrieved from Soroban contract. */
export interface GameState {
    player1: string;
    player2: string;
    p1Commitment: string;
    p2Commitment: string;
    p1HitsReceived: number;
    p2HitsReceived: number;
    currentTurn: string;
    status: 'WaitingForCommitments' | 'Active' | 'Finished';
    turnNumber: number;
    gameHubGameId: string;
}

/** Network configuration. */
export interface NetworkConfig {
    rpcUrl: string;
    networkPassphrase: string;
    contractAddress: string;
    gameHubAddress: string;
    explorerBaseUrl: string;
}

/** Default testnet configuration. */
export const TESTNET_CONFIG: NetworkConfig = {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    contractAddress: '', // Set after deployment
    gameHubAddress: 'CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG',
    explorerBaseUrl: 'https://stellar.expert/explorer/testnet/tx/',
};

/** Ship definition for fleet setup. */
export interface ShipDef {
    id: string;
    type: 'CARRIER' | 'CRUISER' | 'DESTROYER' | 'SCOUT';
    size: number;
}

/** Standard fleet composition: 4+3+2+1+1 = 11 cells. */
export const FLEET: ShipDef[] = [
    { id: 'C1', type: 'CARRIER', size: 4 },
    { id: 'R1', type: 'CRUISER', size: 3 },
    { id: 'D1', type: 'DESTROYER', size: 2 },
    { id: 'S1', type: 'SCOUT', size: 1 },
    { id: 'S2', type: 'SCOUT', size: 1 },
];

export const GRID_SIZE = 6;
export const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;
export const TOTAL_SHIP_CELLS = 11;
