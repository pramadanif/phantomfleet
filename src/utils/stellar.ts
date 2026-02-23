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
export let PHANTOM_FLEET_CONTRACT = 'CCXT66VF4VJYZFCKB6BF7UEBWHQN7M45RPG3BV4ODKL7U3T4MZFDMRV7';

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
        fee: '100',
        networkPassphrase: NETWORK_PASSPHRASE,
    })
        .addOperation(operation)
        .setTimeout(30)
        .build();

    // Simulate to get resource estimates
    const simulated = await server.simulateTransaction(transaction);

    if (StellarSdk.rpc.Api.isSimulationError(simulated)) {
        throw new Error(`Simulation failed: ${simulated.error}`);
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
        throw new Error('Transaction submission failed');
    }

    // Wait for confirmation
    let getResult = await server.getTransaction(submitResult.hash);
    while (getResult.status === 'NOT_FOUND') {
        await new Promise(r => setTimeout(r, 1000));
        getResult = await server.getTransaction(submitResult.hash);
    }

    if (getResult.status === 'FAILED') {
        throw new Error('Transaction failed on-chain');
    }

    return {
        txHash: submitResult.hash,
        explorerUrl: `${EXPLORER_BASE}${submitResult.hash}`,
        success: getResult.status === 'SUCCESS',
    };
}

/**
 * Start a new game. Calls initialize_game() on PhantomFleet contract,
 * which cross-calls start_game() on the Game Hub.
 */
export async function callStartGame(
    callerAddress: string,
    player1: string,
    player2?: string
): Promise<TxResult & { gameId: string }> {
    const args = [
        StellarSdk.nativeToScVal(player1, { type: 'address' }),
        StellarSdk.nativeToScVal(player2 || callerAddress, { type: 'address' }),
    ];

    const result = await submitContractCall(
        callerAddress,
        PHANTOM_FLEET_CONTRACT || GAME_HUB_CONTRACT,
        'initialize_game',
        args
    );

    const gameId = 'GAME-' + result.txHash.substring(0, 8).toUpperCase();
    return { ...result, gameId };
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
    // Encode gameId as UTF-8 bytes, padded to 32 bytes
    const gameIdUtf8 = new TextEncoder().encode(gameId);
    const gameIdBytes = new Uint8Array(32);
    gameIdBytes.set(gameIdUtf8.slice(0, 32));

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
        PHANTOM_FLEET_CONTRACT || GAME_HUB_CONTRACT,
        'commit_layout',
        args
    );
}

/**
 * Submit a shot with its ZK proof and public inputs.
 * Calls submit_shot(game_id, shooter, target_x, target_y, proof, public_inputs).
 */
export async function callSubmitShot(
    callerAddress: string,
    gameId: string,
    targetX: number,
    targetY: number,
    proof: string,
    publicInputs: string[]
): Promise<TxResult & { isHit: boolean; distance: number }> {
    const gameIdBytes = Buffer.alloc(32);
    Buffer.from(gameId.replace(/^GAME-/, '').padStart(64, '0').slice(0, 64), 'hex').copy(gameIdBytes);

    const proofBytes = Buffer.from(atob(proof), 'binary');

    const pubInputScVals = publicInputs.map(pi => {
        const hex = pi.startsWith('0x') ? pi.slice(2) : pi;
        const padded = hex.padStart(64, '0').slice(0, 64);
        return StellarSdk.xdr.ScVal.scvBytes(Buffer.from(padded, 'hex'));
    });

    const args = [
        StellarSdk.xdr.ScVal.scvBytes(gameIdBytes),
        StellarSdk.nativeToScVal(callerAddress, { type: 'address' }),
        StellarSdk.nativeToScVal(targetX, { type: 'u32' }),
        StellarSdk.nativeToScVal(targetY, { type: 'u32' }),
        StellarSdk.xdr.ScVal.scvBytes(proofBytes),
        StellarSdk.xdr.ScVal.scvVec(pubInputScVals),
    ];

    const result = await submitContractCall(
        callerAddress,
        PHANTOM_FLEET_CONTRACT || GAME_HUB_CONTRACT,
        'submit_shot',
        args
    );

    // Parse result from public inputs
    // Order: [commitment, targetX, targetY, minDist, maxDist, isHit]
    const isHit = publicInputs[5] === '1';
    const distance = parseInt(publicInputs[3], 10);

    return { ...result, isHit, distance };
}

/**
 * End a game. The contract auto-determines winner from hit counts.
 * Calls end_game() on our PhantomFleet contract — no arguments needed.
 * (The contract's submit_shot already calls the Hub's end_game internally when someone wins)
 */
export async function callEndGame(
    callerAddress: string,
    gameId: string
): Promise<TxResult> {
    // Our PhantomFleet contract's end_game takes the game_id bytes
    const gameIdUtf8 = new TextEncoder().encode(gameId);
    const gameIdBytes = new Uint8Array(32);
    gameIdBytes.set(gameIdUtf8.slice(0, 32));

    const args = [
        StellarSdk.xdr.ScVal.scvBytes(Buffer.from(gameIdBytes)),
    ];

    return submitContractCall(
        callerAddress,
        PHANTOM_FLEET_CONTRACT || GAME_HUB_CONTRACT,
        'end_game',
        args
    );
}
