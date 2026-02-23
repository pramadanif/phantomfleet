"use client";

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useGame } from '../GameContext';
import {
    callFireShot,
    callResolveShot,
    callGetGameState,
    callGetShotHistory,
    callHasPendingShot,
    callGetPendingShot,
    EXPLORER_BASE,
} from '../../../utils/stellar';
import { soundEngine } from '../../../utils/soundEngine';

const TOTAL_SHIP_CELLS = 11;
const EXPLORER_LEDGER_BASE = 'https://stellar.expert/explorer/testnet/ledger/';

type MissInfo = {
    cell: string;
    distance: 'HOT' | 'WARM' | 'COLD';
    txHash?: string;
    txSequence?: number;
};

export function BattleScreen() {
    const { wallet, gameId, shipGrid, layoutNonce, setScreen, setDidWin, setGlobalError, setLastTx, isBotGame, setShotsFired, shotsFired, setPlayerHits, playerHits, setEnemyShipGrid, setOpponentAddress } = useGame();

    const [turn, setTurn] = useState<'PLAYER' | 'ENEMY'>('PLAYER');
    const [enemyGrid, setEnemyGrid] = useState<Record<number, 'MISS' | 'HIT'>>({});
    const [enemyCellDist, setEnemyCellDist] = useState<Record<number, number>>({});
    const [playerGrid, setPlayerGrid] = useState<Record<number, 'MISS' | 'HIT'>>({});
    const [generatingProofCell, setGeneratingProofCell] = useState<number | null>(null);
    const [proofContext, setProofContext] = useState<'OUTGOING' | 'INCOMING' | null>(null);
    const [proofProgress, setProofProgress] = useState(0);
    const [lastMissInfo, setLastMissInfo] = useState<MissInfo | null>(null);
    const [lastHitTx, setLastHitTx] = useState<string | null>(null);
    const [turnSyncing, setTurnSyncing] = useState(false);
    const [pendingIncoming, setPendingIncoming] = useState<{ x: number; y: number; shooter: string } | null>(null);
    const [chainState, setChainState] = useState<{ player1: string; player2: string; p1HitsReceived: number; p2HitsReceived: number } | null>(null);
    const workerRef = useRef<Worker | null>(null);
    const pendingOutgoingCellRef = useRef<number | null>(null);
    const historyLenRef = useRef(0);

    const botTickingRef = useRef(false);

    // Initialize Web Worker + Music
    useEffect(() => {
        workerRef.current = new Worker(
            new URL('../../../workers/prover.worker.ts', import.meta.url),
            { type: 'module' }
        );
        soundEngine.startMusic();
        soundEngine.play('game_start');
        return () => {
            workerRef.current?.terminate();
            soundEngine.stopMusic();
        };
    }, []);

    const generateProofViaWorker = async (targetX: number, targetY: number) => {
        return new Promise<any>((resolve, reject) => {
            if (!workerRef.current) {
                reject(new Error('Worker not ready'));
                return;
            }

            workerRef.current.onmessage = (e) => {
                if (e.data.type === 'PROOF_PROGRESS') {
                    setProofProgress(e.data.percent);
                } else if (e.data.type === 'PROOF_READY') {
                    resolve(e.data.proof);
                } else if (e.data.type === 'PROOF_ERROR') {
                    reject(new Error(e.data.error));
                }
            };

            workerRef.current.postMessage({
                type: 'GENERATE_PROOF',
                witness: {
                    shipGrid,
                    targetX,
                    targetY,
                    layoutNonce,
                },
            });
        });
    };

    useEffect(() => {
        if (!wallet?.address || !gameId) return;

        const syncLoop = async () => {
            try {
                setTurnSyncing(true);
                const [state, hasPending] = await Promise.all([
                    callGetGameState(wallet.address, gameId),
                    callHasPendingShot(wallet.address, gameId),
                ]);

                setChainState({
                    player1: state.player1,
                    player2: state.player2,
                    p1HitsReceived: state.p1HitsReceived,
                    p2HitsReceived: state.p2HitsReceived,
                });

                const myHitsReceived = state.player1 === wallet.address ? state.p1HitsReceived : state.p2HitsReceived;
                const enemyHitsReceived = state.player1 === wallet.address ? state.p2HitsReceived : state.p1HitsReceived;
                const opponent = state.player1 === wallet.address ? state.player2 : state.player1;
                setOpponentAddress(opponent || null);
                setPlayerHits(enemyHitsReceived);

                if (myHitsReceived >= TOTAL_SHIP_CELLS || enemyHitsReceived >= TOTAL_SHIP_CELLS || state.status === 'Finished') {
                    setDidWin(enemyHitsReceived >= TOTAL_SHIP_CELLS);
                    setScreen('GAME_OVER');
                    return;
                }

                setTurn(state.currentTurn === wallet.address ? 'PLAYER' : 'ENEMY');

                if (hasPending) {
                    const pending = await callGetPendingShot(wallet.address, gameId);
                    const isDefenderTurn = pending.shooter !== wallet.address && state.currentTurn === wallet.address;

                    if (isDefenderTurn) {
                        setPendingIncoming({ x: pending.targetX, y: pending.targetY, shooter: pending.shooter });
                    } else {
                        setPendingIncoming(null);
                    }
                } else {
                    setPendingIncoming(null);
                }

                const history = await callGetShotHistory(wallet.address, gameId);
                if (history.length > historyLenRef.current) {
                    const latest = history[history.length - 1];
                    historyLenRef.current = history.length;

                    const pendingCell = pendingOutgoingCellRef.current;
                    if (pendingCell !== null) {
                        setEnemyGrid(prev => ({
                            ...prev,
                            [pendingCell]: latest.isHit ? 'HIT' : 'MISS',
                        }));

                        if (latest.isHit) {
                            soundEngine.play('hit_explosion');
                            setLastMissInfo(null);
                            setLastHitTx(null);
                        } else {
                            soundEngine.play('miss_splash');
                            soundEngine.play('sonar_ping');
                            const cellName = `${String.fromCharCode(65 + Math.floor(pendingCell / 6))}${(pendingCell % 6) + 1}`;
                            const distLabel: 'HOT' | 'WARM' | 'COLD' = latest.proximityMin <= 2 ? 'HOT' : latest.proximityMin <= 4 ? 'WARM' : 'COLD';
                            setLastMissInfo({
                                cell: cellName,
                                distance: distLabel,
                                txHash: undefined,
                                txSequence: latest.txSequence,
                            });
                            setLastHitTx(null);
                        }

                        if (!latest.isHit) {
                            setEnemyCellDist(prev => ({
                                ...prev,
                                [pendingCell]: latest.proximityMin,
                            }));
                        }
                        pendingOutgoingCellRef.current = null;
                        setGeneratingProofCell(null);
                        setProofContext(null);
                        setProofProgress(0);
                    }
                }
            } catch {
                // keep UI responsive during intermittent rpc errors
            } finally {
                setTurnSyncing(false);
            }
        };

        syncLoop();
        const timer = setInterval(syncLoop, 2500);
        return () => clearInterval(timer);
    }, [
        isBotGame,
        wallet?.address,
        gameId,
        shipGrid,
        layoutNonce,
        setLastTx,
        setDidWin,
        setScreen,
        setPlayerHits,
        setOpponentAddress,
    ]);

    const handleResolveIncomingShot = async () => {
        if (!pendingIncoming || !wallet?.address || !gameId) return;
        const cell = pendingIncoming.y * 6 + pendingIncoming.x;

        setGeneratingProofCell(cell);
        setProofContext('INCOMING');
        setProofProgress(0);
        try {
            const proofResult = await generateProofViaWorker(pendingIncoming.x, pendingIncoming.y);
            const txResult = await callResolveShot(wallet.address, gameId, proofResult.proof, proofResult.publicInputs);
            setLastTx(txResult);
            setPlayerGrid(prev => ({
                ...prev,
                [cell]: txResult.isHit ? 'HIT' : 'MISS',
            }));
            setPendingIncoming(null);
            soundEngine.play('proof_complete');
        } catch (err: any) {
            setGlobalError(err?.message || 'Failed to resolve incoming shot');
        } finally {
            setGeneratingProofCell(null);
            setProofContext(null);
            setProofProgress(0);
        }
    };

    const handleEnemyGridClick = async (index: number) => {
        if (turn !== 'PLAYER' || enemyGrid[index] || generatingProofCell !== null || pendingIncoming !== null) return;

        const targetX = index % 6;
        const targetY = Math.floor(index / 6);

        if (wallet?.address && gameId) {
            const state = await callGetGameState(wallet.address, gameId);
            if (state.currentTurn !== wallet.address) {
                setTurn('ENEMY');
                setGlobalError('Belum giliran kamu. Tunggu lawan menyelesaikan turn.');
                return;
            }
        }

        setGeneratingProofCell(index);
        setProofContext('OUTGOING');
        setProofProgress(100);
        soundEngine.play('shot_fire');
        setShotsFired(shotsFired + 1);

        try {
            const txResult = await callFireShot(
                wallet?.address || '',
                gameId || '',
                targetX,
                targetY
            );

            setLastTx(txResult);
            soundEngine.play('proof_complete');
            pendingOutgoingCellRef.current = index;
            setTurn('ENEMY');
            setLastMissInfo(null);
            setLastHitTx(null);

        } catch (err: any) {
            setGlobalError(err?.message || 'Unknown error');
            setGeneratingProofCell(null);
            setProofContext(null);
            setProofProgress(0);
        }
    };

    useEffect(() => {
        if (!isBotGame || !wallet?.address || !gameId) return;
        if (turn !== 'ENEMY' || pendingIncoming || generatingProofCell !== null) return;
        if (botTickingRef.current) return;

        botTickingRef.current = true;
        const runTick = async () => {
            try {
                const response = await fetch('/api/bot/onchain', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'tick',
                        gameId,
                        playerAddress: wallet.address,
                    }),
                });
                const data = await response.json();
                if (!response.ok || !data?.ok) {
                    throw new Error(data?.error || 'Bot tick failed');
                }

                if (Array.isArray(data.actions) && data.actions.some((a: string) => String(a).startsWith('fired_at_'))) {
                    soundEngine.play('bot_fire');
                }
            } catch (error: any) {
                setGlobalError(error?.message || 'Failed to advance on-chain bot turn');
            } finally {
                botTickingRef.current = false;
            }
        };

        void runTick();
    }, [isBotGame, turn, pendingIncoming, generatingProofCell, wallet?.address, gameId, setGlobalError]);

    // Compute remaining ships
    const myHitsReceived = chainState && wallet?.address
        ? (chainState.player1 === wallet.address ? chainState.p1HitsReceived : chainState.p2HitsReceived)
        : 0;
    const enemyHitsReceived = chainState && wallet?.address
        ? (chainState.player1 === wallet.address ? chainState.p2HitsReceived : chainState.p1HitsReceived)
        : 0;

    const playerShipsRemaining = TOTAL_SHIP_CELLS - myHitsReceived;
    const enemyShipsRemaining = TOTAL_SHIP_CELLS - enemyHitsReceived;

    const renderYourWaters = () => {
        const cells = [];
        for (let i = 0; i < 36; i++) {
            const hasShip = shipGrid[i] === 1;
            const hitState = playerGrid[i];
            const isResolvingCell = proofContext === 'INCOMING' && generatingProofCell === i;
            const rowLabel = i % 6 === 0 ? String.fromCharCode(65 + Math.floor(i / 6)) : '';
            const colLabel = i < 6 ? (i + 1).toString() : '';
            cells.push(
                <div key={`y-${i}`} className={`relative w-[34px] h-[34px] md:w-[38px] md:h-[38px] xl:w-[48px] xl:h-[48px] border border-ocean-gray ${hitState === 'HIT' ? 'bg-signal-red/20 border-signal-red' :
                    hitState === 'MISS' ? 'bg-hull' :
                        hasShip ? 'bg-mist-blue border-brass border-[1px]' : 'bg-hull'
                    } ${isResolvingCell ? 'border-radar border-2 bg-radar/10' : ''}`}
                    style={isResolvingCell ? { boxShadow: '0 0 12px rgba(61,255,110,0.6), inset 0 0 12px rgba(61,255,110,0.2)' } : {}}>
                    {colLabel && <div className="absolute -top-5 left-1/2 -translate-x-1/2 font-mono text-[0.6rem] text-haze-gray">{colLabel}</div>}
                    {rowLabel && <div className="absolute -left-5 top-1/2 -translate-y-1/2 font-mono text-[0.6rem] text-haze-gray">{rowLabel}</div>}
                    {hitState === 'HIT' && (
                        <div className="absolute inset-0 flex items-center justify-center text-signal-red" style={{ filter: 'drop-shadow(0 0 8px rgba(192,57,43,0.8))' }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </div>
                    )}
                    {hitState === 'MISS' && (
                        <div className="absolute inset-0 flex items-center justify-center text-haze-gray">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                <circle cx="12" cy="12" r="8"></circle>
                            </svg>
                        </div>
                    )}
                </div>
            );
        }
        return cells;
    };

    const renderEnemyWaters = () => {
        const cells = [];
        for (let i = 0; i < 36; i++) {
            const state = enemyGrid[i];
            const isGenerating = proofContext === 'OUTGOING' && generatingProofCell === i;
            const rowLabel = i % 6 === 0 ? String.fromCharCode(65 + Math.floor(i / 6)) : '';
            const colLabel = i < 6 ? (i + 1).toString() : '';
            cells.push(
                <div
                    key={`e-${i}`}
                    onClick={() => handleEnemyGridClick(i)}
                    className={`
            relative w-[38px] h-[38px] md:w-[44px] md:h-[44px] xl:w-[64px] xl:h-[64px] border border-ocean-gray transition-colors
            ${!state && !isGenerating && turn === 'PLAYER' ? 'hover:bg-ocean-gray bg-hull' : 'bg-hull'}
            ${state === 'HIT' ? 'bg-signal-red/20 border-signal-red' : ''}
            ${isGenerating ? 'border-radar border-2 bg-radar/10' : ''}
          `}
                    style={state === 'HIT' ? { boxShadow: 'inset 0 0 16px rgba(192,57,43,0.4)' } : isGenerating ? { boxShadow: '0 0 16px rgba(61,255,110,0.6), inset 0 0 16px rgba(61,255,110,0.2)' } : {}}
                >
                    {colLabel && <div className="absolute -top-6 left-1/2 -translate-x-1/2 font-mono text-[0.65rem] text-haze-gray">{colLabel}</div>}
                    {rowLabel && <div className="absolute -left-6 top-1/2 -translate-y-1/2 font-mono text-[0.65rem] text-haze-gray">{rowLabel}</div>}
                    {state === 'MISS' && (
                        <>
                            {/* Proximity rings */}
                            {(() => {
                                const dist = enemyCellDist[i];
                                const ringColor = dist !== undefined && dist <= 2 ? 'rgba(255,107,53,0.6)' : dist !== undefined && dist <= 4 ? 'rgba(255,193,7,0.5)' : 'rgba(100,149,237,0.4)';
                                const ringCount = dist !== undefined && dist <= 2 ? 3 : dist !== undefined && dist <= 4 ? 2 : 1;
                                return Array.from({ length: ringCount }).map((_, r) => (
                                    <motion.div
                                        key={`ring-${i}-${r}`}
                                        initial={{ opacity: 0.8, scale: 0.5 }}
                                        animate={{ opacity: [0.6, 0.15, 0.6], scale: 1 + (r + 1) * 0.7 }}
                                        transition={{ duration: 2 + r * 0.5, repeat: Infinity, ease: 'easeInOut' }}
                                        className="absolute inset-0 rounded-full border-2 pointer-events-none"
                                        style={{ borderColor: ringColor }}
                                    />
                                ));
                            })()}
                            <div className="absolute inset-0 flex items-center justify-center" style={{
                                color: enemyCellDist[i] !== undefined && enemyCellDist[i] <= 2 ? '#FF6B35' : enemyCellDist[i] !== undefined && enemyCellDist[i] <= 4 ? '#FFC107' : '#6495ED'
                            }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                    <circle cx="12" cy="12" r="8"></circle>
                                </svg>
                            </div>
                        </>
                    )}
                    {state === 'HIT' && (
                        <div className="absolute inset-0 flex items-center justify-center text-signal-red" style={{ filter: 'drop-shadow(0 0 8px rgba(192,57,43,0.8))' }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </div>
                    )}
                    {isGenerating && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.2, repeat: Infinity }} className="absolute inset-0 flex items-center justify-center text-radar font-bold">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="9"></circle>
                                <circle cx="12" cy="12" r="3"></circle>
                                <line x1="12" y1="1" x2="12" y2="4"></line>
                                <line x1="12" y1="20" x2="12" y2="23"></line>
                                <line x1="1" y1="12" x2="4" y2="12"></line>
                                <line x1="20" y1="12" x2="23" y2="12"></line>
                            </svg>
                        </motion.div>
                    )}
                </div>
            );
        }
        return cells;
    };

    return (
        <div className="min-h-screen bg-abyss flex flex-col pt-4 relative">
            <div className="w-full max-w-[1400px] mx-auto px-4 md:px-6 flex-1 flex flex-col">

                {/* STATUS BAR */}
                <div className="flex flex-col md:flex-row items-center justify-between border border-ocean-gray bg-hull p-4 mb-4 gap-4">
                    <div className={`font-mono text-sm tracking-widest flex items-center gap-2 ${turn === 'PLAYER' ? 'text-radar' : 'text-haze-gray'}`}>
                        {turn === 'PLAYER' && (
                            <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }} className="w-2 h-2 bg-radar rounded-full" />
                        )}
                        {turnSyncing ? 'SYNCING TURN...' : turn === 'PLAYER' ? 'YOUR TURN TO FIRE' : isBotGame ? 'PHANTOM AI TARGETING...' : 'ENEMY TURN'}
                    </div>

                    <div className="flex items-center gap-8 font-mono text-xs">
                        <div className="flex flex-col items-center">
                            <span className="text-haze-gray mb-1">YOUR SHIPS</span>
                            <span className={`text-lg ${playerShipsRemaining < 5 ? 'text-signal-red' : 'text-smoke'}`}>{playerShipsRemaining}/{TOTAL_SHIP_CELLS}</span>
                        </div>
                        <div className="w-[1px] h-8 bg-ocean-gray"></div>
                        <div className="flex flex-col items-center">
                            <span className="text-haze-gray mb-1">{isBotGame ? 'BOT SHIPS' : 'ENEMY SHIPS'}</span>
                            <span className={`text-lg ${enemyShipsRemaining < 5 ? 'text-signal-red' : 'text-smoke'}`}>{enemyShipsRemaining}/{TOTAL_SHIP_CELLS}</span>
                        </div>
                    </div>

                    <div className="font-mono text-haze-gray text-[0.65rem] flex gap-2">
                        {isBotGame && <span className="px-2 py-1 bg-brass/10 border border-brass/30 text-brass">VS BOT</span>}
                    </div>
                </div>

                <AnimatePresence>
                    {!isBotGame && pendingIncoming && generatingProofCell === null && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-abyss/70 z-20 flex items-center justify-center px-4"
                        >
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 8 }}
                                className="w-full max-w-[420px] bg-hull border border-radar p-4"
                                style={{ boxShadow: '0 8px 30px rgba(0,0,0,0.55)' }}
                            >
                                <div className="font-mono text-radar text-xs tracking-widest mb-2">INCOMING SHOT</div>
                                <div className="font-mono text-smoke text-sm mb-3">
                                    Opponent fired at <span className="text-brass">{String.fromCharCode(65 + pendingIncoming.y)}{pendingIncoming.x + 1}</span>.
                                </div>
                                <div className="font-mono text-haze-gray text-[0.7rem] mb-4">
                                    Resolve now to generate proof and continue turn order.
                                </div>
                                <button
                                    onClick={handleResolveIncomingShot}
                                    className="w-full bg-radar/10 border border-radar text-radar font-mono text-xs py-2 hover:brightness-110"
                                >
                                    RESOLVE SHOT
                                </button>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* GRIDS */}
                <div className="flex flex-col lg:flex-row justify-center items-start flex-1 gap-12 lg:gap-32 pt-12 pb-12 w-full">

                    <div className="flex flex-col items-center lg:items-end">
                        <h2 className="font-mono text-brass tracking-widest text-sm mb-8 bg-hull inline-block border-r-2 border-brass px-3 py-1">YOUR WATERS</h2>
                        <div className="grid grid-cols-6 gap-0 border border-ocean-gray bg-abyss p-[1px] opacity-80 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
                            {renderYourWaters()}
                        </div>
                    </div>

                    <div className="flex flex-col items-center lg:items-start">
                        <h2 className="font-mono text-haze-gray tracking-widest text-sm mb-8 bg-hull inline-block border-l-2 border-ocean-gray px-3 py-1">
                            {isBotGame ? 'PHANTOM AI WATERS' : 'ENEMY WATERS'}
                        </h2>

                        <div className="grid grid-cols-6 gap-0 border border-ocean-gray bg-abyss p-[1px] mb-8 relative shadow-[0_0_40px_rgba(0,0,0,0.6)]">
                            {renderEnemyWaters()}

                            <AnimatePresence>
                                {generatingProofCell !== null && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 10 }}
                                        className="absolute bottom-[-100px] left-1/2 -translate-x-1/2 w-[340px] bg-hull border border-brass p-4 z-10"
                                        style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.5)' }}
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.8, repeat: Infinity }} className="text-radar">
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <circle cx="12" cy="12" r="9"></circle>
                                                    <circle cx="12" cy="12" r="3"></circle>
                                                    <line x1="12" y1="1" x2="12" y2="4"></line>
                                                    <line x1="12" y1="20" x2="12" y2="23"></line>
                                                    <line x1="1" y1="12" x2="4" y2="12"></line>
                                                    <line x1="20" y1="12" x2="23" y2="12"></line>
                                                </svg>
                                            </motion.div>
                                            <span className="font-mono text-smoke text-sm">{proofContext === 'INCOMING' ? 'RESOLVING INCOMING SHOT' : 'GENERATING ZK PROOF'}</span>
                                        </div>
                                        <div className="font-mono text-haze-gray text-[0.65rem] mb-3">Circom circuit · BN254 · Groth16</div>
                                        <div className="w-full h-1 bg-abyss border border-ocean-gray">
                                            <motion.div
                                                initial={{ width: '0%' }}
                                                animate={{ width: `${proofProgress}%` }}
                                                transition={{ duration: 0.3 }}
                                                className="h-full bg-brass"
                                            />
                                        </div>
                                        <div className="font-mono text-haze-gray text-[0.55rem] mt-2">{proofProgress}% · ~{Math.max(0, Math.round(8 - proofProgress * 0.08))}s remaining</div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* PROXIMITY PANEL */}
                        <div className="h-[130px] w-full flex justify-center lg:justify-start">
                            <AnimatePresence>
                                {lastMissInfo && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 20 }}
                                        key={lastMissInfo.cell}
                                        className="bg-hull border-l-4 border-radar p-4 min-w-[340px]"
                                        style={{ boxShadow: '-8px 0 16px -8px rgba(61,255,110,0.3)' }}
                                    >
                                        <div className="font-mono text-[0.7rem] text-smoke mb-2 tracking-widest flex items-center gap-2">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-radar">
                                                <circle cx="12" cy="12" r="10"></circle>
                                                <circle cx="12" cy="12" r="4"></circle>
                                                <line x1="12" y1="2" x2="12" y2="4"></line>
                                                <line x1="12" y1="20" x2="12" y2="22"></line>
                                                <line x1="2" y1="12" x2="4" y2="12"></line>
                                                <line x1="20" y1="12" x2="22" y2="12"></line>
                                            </svg>
                                            PROXIMITY REPORT — {lastMissInfo.cell}
                                        </div>
                                        <div className="w-full border-b border-ocean-gray mb-3"></div>
                                        <div className="font-mono text-sm tracking-widest flex items-center gap-4 mb-2">
                                            <div className="flex gap-1">
                                                {Array.from({ length: 10 }).map((_, i) => {
                                                    const activeBlocks = lastMissInfo.distance === 'HOT' ? 6 : lastMissInfo.distance === 'WARM' ? 3 : 1;
                                                    const colorClass = lastMissInfo.distance === 'HOT' ? 'bg-[#FF6B35]' : lastMissInfo.distance === 'WARM' ? 'bg-[#FFC107]' : 'bg-[#6495ED]';
                                                    return (
                                                        <div key={i} className={`w-2 h-4 ${i < activeBlocks ? colorClass : 'bg-ocean-gray/30'} border border-abyss border-[0.5px]`}></div>
                                                    );
                                                })}
                                            </div>
                                            <span style={{ color: lastMissInfo.distance === 'HOT' ? '#FF6B35' : lastMissInfo.distance === 'WARM' ? '#FFC107' : '#6495ED' }}>
                                                {lastMissInfo.distance === 'HOT' ? 'VERY HOT — 1-2 CELLS' : lastMissInfo.distance === 'WARM' ? 'WARM — 3-4 CELLS' : 'COLD — 5-6 CELLS'}
                                            </span>
                                        </div>
                                        {lastMissInfo.txHash ? (
                                            <a
                                                href={`${EXPLORER_BASE}${lastMissInfo.txHash}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="font-mono text-[0.55rem] text-haze-gray uppercase hover:text-smoke"
                                            >
                                                CRYPTOGRAPHIC RANGE PROOF · VERIFIED ON STELLAR ↗
                                            </a>
                                        ) : lastMissInfo.txSequence ? (
                                            <a
                                                href={`${EXPLORER_LEDGER_BASE}${lastMissInfo.txSequence}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="font-mono text-[0.55rem] text-haze-gray uppercase hover:text-smoke"
                                            >
                                                CRYPTOGRAPHIC RANGE PROOF · LEDGER #{lastMissInfo.txSequence} ↗
                                            </a>
                                        ) : (
                                            <span className="font-mono text-[0.55rem] text-haze-gray uppercase">
                                                CRYPTOGRAPHIC RANGE PROOF · VERIFIED ON STELLAR
                                            </span>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
