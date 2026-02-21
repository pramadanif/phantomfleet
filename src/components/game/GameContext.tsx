"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { connectWallet as stellarConnect, getAccount, type WalletInfo, type AccountInfo, type TxResult, EXPLORER_BASE } from '../../utils/stellar';

// ── Types ──────────────────────────────────────────────────

export type GameScreen = 'CONNECTING' | 'LOBBY' | 'PLACEMENT' | 'BATTLE' | 'GAME_OVER';

export interface GameContextType {
    // Wallet
    wallet: WalletInfo | null;
    account: AccountInfo | null;
    walletError: string | null;
    isConnecting: boolean;
    connectWallet: () => Promise<void>;

    // Game state
    screen: GameScreen;
    setScreen: (s: GameScreen) => void;
    gameId: string | null;
    setGameId: (id: string | null) => void;
    didWin: boolean;
    setDidWin: (w: boolean) => void;

    // Ship layout (persisted between placement → battle)
    shipGrid: number[];
    setShipGrid: (g: number[]) => void;
    layoutNonce: string;
    setLayoutNonce: (n: string) => void;

    // Transaction tracking
    lastTx: TxResult | null;
    setLastTx: (tx: TxResult | null) => void;

    // Error handling
    globalError: string | null;
    setGlobalError: (e: string | null) => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

// ── Provider ───────────────────────────────────────────────

export function GameProvider({ children }: { children: React.ReactNode }) {
    // Wallet
    const [wallet, setWallet] = useState<WalletInfo | null>(null);
    const [account, setAccount] = useState<AccountInfo | null>(null);
    const [walletError, setWalletError] = useState<string | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);

    // Game state
    const [screen, setScreenState] = useState<GameScreen>('CONNECTING');
    const [gameId, setGameIdState] = useState<string | null>(null);
    const [didWin, setDidWin] = useState(false);

    // Ship layout
    const [shipGrid, setShipGrid] = useState<number[]>(new Array(36).fill(0));
    const [layoutNonce, setLayoutNonce] = useState<string>(crypto.randomUUID());

    // Transaction tracking
    const [lastTx, setLastTx] = useState<TxResult | null>(null);

    // Error handling
    const [globalError, setGlobalError] = useState<string | null>(null);

    // ── Persist gameId to localStorage ──
    const setGameId = useCallback((id: string | null) => {
        setGameIdState(id);
        if (id) {
            localStorage.setItem('phantomfleet_gameId', id);
        } else {
            localStorage.removeItem('phantomfleet_gameId');
        }
    }, []);

    const setScreen = useCallback((s: GameScreen) => {
        setScreenState(s);
    }, []);

    // Recover gameId from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem('phantomfleet_gameId');
        if (saved) {
            setGameIdState(saved);
        }
    }, []);

    // ── Wallet connection ──
    const handleConnectWallet = useCallback(async () => {
        setIsConnecting(true);
        setWalletError(null);
        try {
            const info = await stellarConnect();
            setWallet(info);

            // Fetch account balance
            try {
                const acct = await getAccount(info.address);
                setAccount(acct);
            } catch {
                // Non-fatal: account may not be funded on testnet
                setAccount({ address: info.address, balanceXLM: '0', sequence: '0' });
            }

            setScreenState('LOBBY');
        } catch (err: any) {
            if (err.message === 'FREIGHTER_NOT_INSTALLED') {
                setWalletError('Freighter wallet is not installed. Please install it from freighter.app');
            } else if (err.message === 'WALLET_ACCESS_DENIED') {
                setWalletError('Access denied by user.');
            } else {
                setWalletError('Failed to connect wallet.');
            }
        } finally {
            setIsConnecting(false);
        }
    }, []);

    const value: GameContextType = {
        wallet,
        account,
        walletError,
        isConnecting,
        connectWallet: handleConnectWallet,
        screen,
        setScreen,
        gameId,
        setGameId,
        didWin,
        setDidWin,
        shipGrid,
        setShipGrid,
        layoutNonce,
        setLayoutNonce,
        lastTx,
        setLastTx,
        globalError,
        setGlobalError,
    };

    return (
        <GameContext.Provider value={value}>
            {children}
        </GameContext.Provider>
    );
}

// ── Hook ───────────────────────────────────────────────────

export function useGame(): GameContextType {
    const ctx = useContext(GameContext);
    if (!ctx) {
        throw new Error('useGame must be used within a GameProvider');
    }
    return ctx;
}
