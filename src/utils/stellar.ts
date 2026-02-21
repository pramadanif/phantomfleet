/**
 * Stellar/Soroban Integration Utilities for Phantom Fleet
 * 
 * Handles wallet connection, account queries, and all contract
 * calls on the Stellar TESTNET. All transactions are signed
 * via Freighter browser extension.
 */

import { isConnected, requestAccess, signTransaction } from '@stellar/freighter-api';
import * as StellarSdk from '@stellar/stellar-sdk';

// ── Constants ──────────────────────────────────────────────

export const TESTNET_URL = 'https://soroban-testnet.stellar.org';
export const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;
export const GAME_HUB_CONTRACT = 'CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG';
export const EXPLORER_BASE = 'https://stellar.expert/explorer/testnet/tx/';

// ── Wallet ─────────────────────────────────────────────────

export interface WalletInfo {
    address: string;
}

/**
 * Connect to Freighter wallet. Returns public key address.
 * Throws if Freighter is not installed or user denies access.
 */
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

/**
 * Fetch account info and XLM balance from Stellar TESTNET.
 */
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
            return {
                address: publicKey,
                balanceXLM: '0',
                sequence: '0',
            };
        }
        throw err;
    }
}

// ── Contract Calls ─────────────────────────────────────────

export interface TxResult {
    txHash: string;
    explorerUrl: string;
    success: boolean;
}

/**
 * Generic helper to build, sign, and submit a Soroban transaction.
 * In production this would use StellarSdk.Contract and SorobanRpc.
 * Currently mocked for UI development.
 */
async function submitContractCall(
    callerAddress: string,
    contractId: string,
    method: string,
    args: any[] = []
): Promise<TxResult> {
    // Mock: simulate network delay
    await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000));

    // Generate a mock transaction hash
    const encoder = new TextEncoder();
    const data = encoder.encode(`${contractId}:${method}:${Date.now()}`);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const txHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 64);

    return {
        txHash,
        explorerUrl: `${EXPLORER_BASE}${txHash}`,
        success: true,
    };
}

/**
 * Start a new game. Calls start_game() on both the
 * PhantomFleet contract and the Game Hub.
 */
export async function callStartGame(
    callerAddress: string,
    player1: string,
    player2?: string
): Promise<TxResult & { gameId: string }> {
    const result = await submitContractCall(
        callerAddress,
        GAME_HUB_CONTRACT,
        'start_game',
        [player1, player2 || '']
    );

    const gameId = 'GAME-' + result.txHash.substring(0, 8).toUpperCase();
    return { ...result, gameId };
}

/**
 * Commit a fleet layout (Poseidon commitment) on-chain.
 */
export async function callCommitLayout(
    callerAddress: string,
    gameId: string,
    commitment: string
): Promise<TxResult> {
    return submitContractCall(
        callerAddress,
        GAME_HUB_CONTRACT,
        'commit_layout',
        [gameId, commitment]
    );
}

/**
 * Submit a shot with its ZK proof and public inputs.
 */
export async function callSubmitShot(
    callerAddress: string,
    gameId: string,
    targetX: number,
    targetY: number,
    proof: string,
    publicInputs: string[]
): Promise<TxResult & { isHit: boolean; distance: number }> {
    const result = await submitContractCall(
        callerAddress,
        GAME_HUB_CONTRACT,
        'submit_shot',
        [gameId, targetX, targetY, proof, publicInputs]
    );

    // Mock: derive hit/distance from public inputs
    const isHit = publicInputs[4] === '1';
    const distance = parseInt(publicInputs[3], 10);

    return { ...result, isHit, distance };
}

/**
 * End a game. Calls end_game() on both contracts.
 */
export async function callEndGame(
    callerAddress: string,
    gameId: string
): Promise<TxResult> {
    return submitContractCall(
        callerAddress,
        GAME_HUB_CONTRACT,
        'end_game',
        [gameId]
    );
}
