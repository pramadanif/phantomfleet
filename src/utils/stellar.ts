/**
 * Stellar/Soroban Integration Utilities for Phantom Fleet
 * 
 * Handles wallet connection, account queries, and all contract
 * calls on Stellar TESTNET via Soroban RPC + Freighter signing.
 */

import { isConnected, requestAccess, signTransaction } from '@stellar/freighter-api';
import * as StellarSdk from '@stellar/stellar-sdk';

// ── Constants ──────────────────────────────────────────────

export const TESTNET_RPC_URL = 'https://soroban-testnet.stellar.org';
export const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;
export const GAME_HUB_CONTRACT = 'CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG';
export const EXPLORER_BASE = 'https://stellar.expert/explorer/testnet/tx/';

/** PhantomFleet contract address — deployed on Stellar Testnet. */
export let PHANTOM_FLEET_CONTRACT = 'CCO5NIUW6B4HPLUUA6YOMNJ6F5OXMUJDUOZQFNAJLKWXWOTVEVL224KQ';

/** Set the PhantomFleet contract address (called after deployment). */
export function setContractAddress(addr: string) {
    PHANTOM_FLEET_CONTRACT = addr;
}

// ── Wallet ─────────────────────────────────────────────────

export interface WalletInfo {
    address: string;
}

export async function connectWallet(): Promise<WalletInfo> {
    const connected = await isConnected();
    if (!connected) {
        throw new Error('FREIGHTER_NOT_INSTALLED');
    }

    const accessRes = await requestAccess();
    if (accessRes && 'address' in accessRes) {
        return { address: accessRes.address };
    }
    throw new Error('WALLET_ACCESS_DENIED');
}

// ── Account ────────────────────────────────────────────────

export interface AccountInfo {
    address: string;
    balanceXLM: string;
    sequence: string;
}

export async function getAccount(publicKey: string): Promise<AccountInfo> {
    try {
        const server = new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org');
        const account = await server.loadAccount(publicKey);
        const xlmBalance = account.balances.find(
            (b: any) => b.asset_type === 'native'
        );

        return {
            address: publicKey,
            balanceXLM: xlmBalance ? xlmBalance.balance : '0',
            sequence: account.sequence,
        };
    } catch (err: any) {
        if (err?.response?.status === 404) {
            return { address: publicKey, balanceXLM: '0', sequence: '0' };
        }
        throw err;
    }
}

/**
 * Fund a testnet account via Friendbot.
 * Automatically gives 10,000 XLM on testnet.
 */
export async function fundAccountViaFriendbot(publicKey: string): Promise<void> {
    const res = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`);
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Friendbot failed: ${text}`);
    }
}

// ── Contract Calls ─────────────────────────────────────────

export interface TxResult {
    txHash: string;
    explorerUrl: string;
    success: boolean;
}

export type OnChainGameStatus = 'WaitingForCommitments' | 'Active' | 'Finished';

export interface OnChainGameState {
    player1: string;
    player2: string;
    p1Commitment: string;
    p2Commitment: string;
    p1HitsReceived: number;
    p2HitsReceived: number;
    currentTurn: string;
    status: OnChainGameStatus;
    turnNumber: number;
    sessionId: number;
}

export interface OnChainPendingShot {
    shooter: string;
    targetX: number;
    targetY: number;
}

export interface OnChainShotResult {
    isHit: boolean;
    proximityMin: number;
    proximityMax: number;
    proofVerified: boolean;
    txSequence: number;
}

function mapContractError(simulationError: string): string {
    if (simulationError.includes('Error(Contract, #3)')) {
        return 'Not your turn yet. Wait for opponent turn to finish, then try again.';
    }
    if (simulationError.includes('Error(Contract, #2)')) {
        return 'Game is not active yet. Ensure both players have sealed fleet.';
    }
    if (simulationError.includes('Error(Contract, #6)')) {
        return 'Invalid proof. Regenerate proof and retry.';
    }
    if (simulationError.includes('Error(Contract, #7)')) {
        return 'Commitment mismatch. Proof harus dibangun dari layout defender (lawan), bukan layout wallet yang sedang menembak.';
    }
    if (simulationError.includes('Error(Contract, #10)')) {
        return 'Invalid public inputs format.';
    }
    if (simulationError.includes('Error(Contract, #11)')) {
        return 'Verification key missing on-chain.';
    }
    return simulationError;
}

/**
 * Build, simulate, sign (via Freighter), and submit a Soroban transaction.
 * Uses full Soroban RPC workflow — no mocks.
 */
async function submitContractCall(
    callerAddress: string,
    contractId: string,
    method: string,
    args: StellarSdk.xdr.ScVal[] = []
): Promise<TxResult> {
    const server = new StellarSdk.rpc.Server(TESTNET_RPC_URL);

    // Load the caller's account for sequence number
    const account = await server.getAccount(callerAddress);

    // Build the contract invocation
    const contract = new StellarSdk.Contract(contractId);
    const operation = contract.call(method, ...args);

    const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: '10000000', // 1 XLM max fee for complex Soroban contracts
        networkPassphrase: NETWORK_PASSPHRASE,
    })
        .addOperation(operation)
        .setTimeout(60)
        .build();

    // Simulate to get resource estimates
    const simulated = await server.simulateTransaction(transaction);

    if (StellarSdk.rpc.Api.isSimulationError(simulated)) {
        const human = mapContractError(String(simulated.error));
        throw new Error(`Simulation failed: ${human}`);
    }

    // Assemble with resource estimates
    const assembled = StellarSdk.rpc.assembleTransaction(
        transaction,
        simulated
    ).build();

    // Sign via Freighter
    const signResult = await signTransaction(assembled.toXDR(), {
        networkPassphrase: NETWORK_PASSPHRASE,
    });

    const signedXdr = typeof signResult === 'string'
        ? signResult
        : (signResult as unknown as { signedTxXdr: string }).signedTxXdr;

    const signedTx = StellarSdk.TransactionBuilder.fromXDR(
        signedXdr,
        NETWORK_PASSPHRASE
    ) as StellarSdk.Transaction;

    // Submit
    const submitResult = await server.sendTransaction(signedTx);

    if (submitResult.status === 'ERROR') {
        let errMsg = 'Transaction submission failed';
        try {
            const errXdr = (submitResult as any)?.errorResultXdr;
            if (errXdr) errMsg += ': ' + JSON.stringify(errXdr);
        } catch { /* ignore */ }
        throw new Error(errMsg);
    }

    // Wait for confirmation
    let getResult = await server.getTransaction(submitResult.hash);
    while (getResult.status === 'NOT_FOUND') {
        await new Promise(r => setTimeout(r, 1000));
        getResult = await server.getTransaction(submitResult.hash);
    }

    if (getResult.status === 'FAILED') {
        let errDetail = 'Unknown error';
        try {
            const raw = (getResult as any)?.resultXdr;
            if (raw && typeof raw === 'object') {
                // XDR object — extract the result code
                errDetail = JSON.stringify(raw);
            } else if (typeof raw === 'string') {
                errDetail = raw;
            }
        } catch { /* ignore */ }
        // Also check the explorer URL for debugging
        console.error('On-chain TX failed:', submitResult.hash, errDetail);
        throw new Error(
            `Transaction failed on-chain. Check: ${EXPLORER_BASE}${submitResult.hash}\nDetail: ${errDetail}`
        );
    }

    return {
        txHash: submitResult.hash,
        explorerUrl: `${EXPLORER_BASE}${submitResult.hash}`,
        success: getResult.status === 'SUCCESS',
    };
}

function fieldStringToBytes32(input: string): Buffer {
    if (input.startsWith('0x')) {
        return Buffer.from(input.slice(2).padStart(64, '0').slice(0, 64), 'hex');
    }
    const bigintValue = BigInt(input);
    const hex = bigintValue.toString(16).padStart(64, '0').slice(0, 64);
    return Buffer.from(hex, 'hex');
}

function parseFieldToNumber(input: string): number {
    if (input.startsWith('0x')) {
        return Number(BigInt(input));
    }
    return Number(BigInt(input));
}

function parseGameStatus(rawStatus: any): OnChainGameStatus {
    if (typeof rawStatus === 'string') {
        const normalized = rawStatus.toLowerCase();
        if (normalized.includes('active')) return 'Active';
        if (normalized.includes('finished')) return 'Finished';
        return 'WaitingForCommitments';
    }
    if (rawStatus && typeof rawStatus === 'object') {
        const keys = Object.keys(rawStatus).map(k => k.toLowerCase());
        if (keys.some(k => k.includes('active'))) return 'Active';
        if (keys.some(k => k.includes('finished'))) return 'Finished';
    }
    return 'WaitingForCommitments';
}

function scValToNativeSafe(scVal: any): any {
    return StellarSdk.scValToNative(scVal as StellarSdk.xdr.ScVal);
}

async function simulateReadonlyCall(
    callerAddress: string,
    contractId: string,
    method: string,
    args: StellarSdk.xdr.ScVal[] = []
): Promise<any> {
    const server = new StellarSdk.rpc.Server(TESTNET_RPC_URL);
    const account = await server.getAccount(callerAddress);
    const contract = new StellarSdk.Contract(contractId);
    const operation = contract.call(method, ...args);

    const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: '100000',
        networkPassphrase: NETWORK_PASSPHRASE,
    })
        .addOperation(operation)
        .setTimeout(30)
        .build();

    const simulated = await server.simulateTransaction(transaction);
    if (StellarSdk.rpc.Api.isSimulationError(simulated)) {
        throw new Error(`Simulation failed: ${simulated.error}`);
    }

    const simAny = simulated as any;
    const retval = simAny?.result?.retval ?? simAny?.results?.[0]?.retval;
    if (!retval) {
        throw new Error('Simulation result has no return value');
    }

    const scVal = typeof retval === 'string'
        ? StellarSdk.xdr.ScVal.fromXDR(retval, 'base64')
        : retval;
    return scValToNativeSafe(scVal);
}

export function stringToGameIdBytes(gameIdStr: string): Uint8Array {
    const bytes = new Uint8Array(32);
    const textBytes = new TextEncoder().encode(gameIdStr);
    bytes.set(textBytes.slice(0, 32));
    return bytes;
}

/**
 * Start a new game. Calls initialize_game() on PhantomFleet contract,
 * which cross-calls start_game() on the Game Hub.
 */
export async function callStartGame(
    callerAddress: string,
    player1: string,
    player2: string,
    gameId: string
): Promise<TxResult> {
    const gameIdBytes = stringToGameIdBytes(gameId);

    const args = [
        StellarSdk.xdr.ScVal.scvBytes(Buffer.from(gameIdBytes)),
        StellarSdk.nativeToScVal(player1, { type: 'address' }),
        StellarSdk.nativeToScVal(player2, { type: 'address' }),
    ];

    const result = await submitContractCall(
        callerAddress,
        PHANTOM_FLEET_CONTRACT,
        'initialize_game',
        args
    );

    // gameId is passed in from the frontend, we use it directly.
    return result;
}

/**
 * Commit a fleet layout (Poseidon commitment) on-chain.
 * Calls commit_layout(game_id, player, commitment) on PhantomFleet contract.
 */
export async function callCommitLayout(
    callerAddress: string,
    gameId: string,
    commitment: string
): Promise<TxResult> {
    // Pad the short game string to exactly 32 bytes
    const gameIdBytes = stringToGameIdBytes(gameId);

    // commitment is a 0x-prefixed 32-byte hex field element
    const commitHex = commitment.startsWith('0x') ? commitment.slice(2) : commitment;
    const commitmentBytes = new Uint8Array(32);
    const commitHexPadded = commitHex.padStart(64, '0').slice(0, 64);
    for (let i = 0; i < 32; i++) {
        commitmentBytes[i] = parseInt(commitHexPadded.slice(i * 2, i * 2 + 2), 16);
    }

    const args = [
        StellarSdk.xdr.ScVal.scvBytes(Buffer.from(gameIdBytes)),
        StellarSdk.nativeToScVal(callerAddress, { type: 'address' }),
        StellarSdk.xdr.ScVal.scvBytes(Buffer.from(commitmentBytes)),
    ];

    return submitContractCall(
        callerAddress,
        PHANTOM_FLEET_CONTRACT,
        'commit_layout',
        args
    );
}

export async function callFireShot(
    callerAddress: string,
    gameId: string,
    targetX: number,
    targetY: number
): Promise<TxResult> {
    const gameIdBytes = stringToGameIdBytes(gameId);
    const args = [
        StellarSdk.xdr.ScVal.scvBytes(Buffer.from(gameIdBytes)),
        StellarSdk.nativeToScVal(callerAddress, { type: 'address' }),
        StellarSdk.nativeToScVal(targetX, { type: 'u32' }),
        StellarSdk.nativeToScVal(targetY, { type: 'u32' }),
    ];

    return submitContractCall(callerAddress, PHANTOM_FLEET_CONTRACT, 'fire_shot', args);
}

export async function callResolveShot(
    callerAddress: string,
    gameId: string,
    proof: string,
    publicInputs: string[]
): Promise<TxResult & { isHit: boolean; distance: number }> {
    const gameIdBytes = stringToGameIdBytes(gameId);
    const proofBytes = Buffer.from(atob(proof), 'binary');
    const pubInputScVals = publicInputs.map(pi => StellarSdk.xdr.ScVal.scvBytes(fieldStringToBytes32(pi)));

    const args = [
        StellarSdk.xdr.ScVal.scvBytes(Buffer.from(gameIdBytes)),
        StellarSdk.nativeToScVal(callerAddress, { type: 'address' }),
        StellarSdk.xdr.ScVal.scvBytes(proofBytes),
        StellarSdk.xdr.ScVal.scvVec(pubInputScVals),
    ];

    const result = await submitContractCall(callerAddress, PHANTOM_FLEET_CONTRACT, 'resolve_shot', args);
    const isHit = parseFieldToNumber(publicInputs[5]) === 1;
    const distance = parseFieldToNumber(publicInputs[3]);
    return { ...result, isHit, distance };
}

export async function callGetGameState(
    callerAddress: string,
    gameId: string
): Promise<OnChainGameState> {
    const gameIdBytes = stringToGameIdBytes(gameId);
    const native = await simulateReadonlyCall(
        callerAddress,
        PHANTOM_FLEET_CONTRACT,
        'get_game_state',
        [StellarSdk.xdr.ScVal.scvBytes(Buffer.from(gameIdBytes))]
    );

    if (!native || typeof native !== 'object') {
        throw new Error('Invalid game state response');
    }

    const p1 = String(native.player1 ?? native.player_1 ?? '');
    const p2 = String(native.player2 ?? native.player_2 ?? '');
    const p1CommitmentBytes: Uint8Array = native.p1_commitment ?? native.p1Commitment ?? new Uint8Array(32);
    const p2CommitmentBytes: Uint8Array = native.p2_commitment ?? native.p2Commitment ?? new Uint8Array(32);

    return {
        player1: p1,
        player2: p2,
        p1Commitment: Buffer.from(p1CommitmentBytes).toString('hex'),
        p2Commitment: Buffer.from(p2CommitmentBytes).toString('hex'),
        p1HitsReceived: Number(native.p1_hits_received ?? native.p1HitsReceived ?? 0),
        p2HitsReceived: Number(native.p2_hits_received ?? native.p2HitsReceived ?? 0),
        currentTurn: String(native.current_turn ?? native.currentTurn ?? ''),
        status: parseGameStatus(native.status),
        turnNumber: Number(native.turn_number ?? native.turnNumber ?? 0),
        sessionId: Number(native.session_id ?? native.sessionId ?? 0),
    };
}

export async function callHasPendingShot(callerAddress: string, gameId: string): Promise<boolean> {
    const gameIdBytes = stringToGameIdBytes(gameId);
    const native = await simulateReadonlyCall(
        callerAddress,
        PHANTOM_FLEET_CONTRACT,
        'has_pending_shot',
        [StellarSdk.xdr.ScVal.scvBytes(Buffer.from(gameIdBytes))]
    );
    return native === true;
}

export async function callGetPendingShot(callerAddress: string, gameId: string): Promise<OnChainPendingShot> {
    const gameIdBytes = stringToGameIdBytes(gameId);
    const native = await simulateReadonlyCall(
        callerAddress,
        PHANTOM_FLEET_CONTRACT,
        'get_pending_shot',
        [StellarSdk.xdr.ScVal.scvBytes(Buffer.from(gameIdBytes))]
    );

    return {
        shooter: String(native.shooter ?? ''),
        targetX: Number(native.target_x ?? native.targetX ?? 0),
        targetY: Number(native.target_y ?? native.targetY ?? 0),
    };
}

export async function callGetShotHistory(callerAddress: string, gameId: string): Promise<OnChainShotResult[]> {
    const gameIdBytes = stringToGameIdBytes(gameId);
    const native = await simulateReadonlyCall(
        callerAddress,
        PHANTOM_FLEET_CONTRACT,
        'get_shot_history',
        [StellarSdk.xdr.ScVal.scvBytes(Buffer.from(gameIdBytes))]
    );

    const arr = Array.isArray(native) ? native : [];
    return arr.map((entry: any) => ({
        isHit: Boolean(entry.is_hit ?? entry.isHit ?? false),
        proximityMin: Number(entry.proximity_min ?? entry.proximityMin ?? 0),
        proximityMax: Number(entry.proximity_max ?? entry.proximityMax ?? 0),
        proofVerified: Boolean(entry.proof_verified ?? entry.proofVerified ?? false),
        txSequence: Number(entry.tx_sequence ?? entry.txSequence ?? 0),
    }));
}

export async function callHasVerificationKey(callerAddress: string): Promise<boolean> {
    const native = await simulateReadonlyCall(
        callerAddress,
        PHANTOM_FLEET_CONTRACT,
        'has_verification_key',
        []
    );
    return native === true;
}

// end_game is NOT exposed as a frontend function.

