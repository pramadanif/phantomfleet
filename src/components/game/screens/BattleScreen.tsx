"use client";

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useGame } from '../GameContext';
import { getMerklePath, buildMerkleTree, findClosestShip } from '../../../utils/zkProof';
import { callSubmitShot, EXPLORER_BASE } from '../../../utils/stellar';
import {
    BOT_FLEET,
    createBotState,
    getBotShot,
    processBotShotResult,
    processPlayerShotAgainstBot,
    countBotShipsRemaining,
    type BotState,
} from '../../../utils/botEngine';
import { soundEngine } from '../../../utils/soundEngine';

const TOTAL_SHIP_CELLS = 11;

export function BattleScreen() {
    const { wallet, gameId, shipGrid, layoutNonce, setScreen, setDidWin, setGlobalError, setLastTx, isBotGame, setShotsFired, shotsFired, setPlayerHits, playerHits } = useGame();

    const [turn, setTurn] = useState<'PLAYER' | 'ENEMY'>('PLAYER');
    const [enemyGrid, setEnemyGrid] = useState<Record<number, 'MISS' | 'HIT'>>({});
    const [playerGrid, setPlayerGrid] = useState<Record<number, 'MISS' | 'HIT'>>({});
    const [generatingProofCell, setGeneratingProofCell] = useState<number | null>(null);
    const [proofProgress, setProofProgress] = useState(0);
    const [lastMissInfo, setLastMissInfo] = useState<{ cell: string; distance: 'HOT' | 'WARM' | 'COLD'; txHash: string } | null>(null);
    const [lastHitTx, setLastHitTx] = useState<string | null>(null);
    const workerRef = useRef<Worker | null>(null);

    // Bot state
    const botStateRef = useRef<BotState>(createBotState('NORMAL'));
    const [playerHitsOnBot, setPlayerHitsOnBot] = useState(0);
    const [botHitsOnPlayer, setBotHitsOnPlayer] = useState(0);

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

    // Bot's turn handler
    const executeBotTurn = async () => {
        if (!isBotGame) return;

        await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));
        soundEngine.play('bot_fire'); // Simulate thinking

        const botShot = getBotShot(botStateRef.current);
        const shotIndex = botShot.y * 6 + botShot.x;
        const isHit = shipGrid[shotIndex] === 1;

        // Process the bot's shot result
        processBotShotResult(botStateRef.current, shotIndex, isHit);

        // Update player's grid
        setPlayerGrid(prev => ({ ...prev, [shotIndex]: isHit ? 'HIT' : 'MISS' }));

        if (isHit) {
            soundEngine.play('hit_explosion');
            const newBotHits = botHitsOnPlayer + 1;
            setBotHitsOnPlayer(newBotHits);

            // Check if bot wins
            if (newBotHits >= TOTAL_SHIP_CELLS) {
                setTimeout(() => {
                    setDidWin(false);
                    setScreen('GAME_OVER');
                }, 1500);
                return;
            }
        }

        // Return turn to player
        setTimeout(() => { setTurn('PLAYER'); }, 800);
    };

    const handleEnemyGridClick = async (index: number) => {
        if (turn !== 'PLAYER' || enemyGrid[index] || generatingProofCell !== null) return;

        const targetX = index % 6;
        const targetY = Math.floor(index / 6);

        setGeneratingProofCell(index);
        setProofProgress(0);
        soundEngine.play('shot_fire');
        setShotsFired(shotsFired + 1);

        try {
            if (isBotGame) {
                // ── Bot Mode: Process locally ──
                // Simulate proof generation with progress
                for (let p = 0; p <= 100; p += 10) {
                    setProofProgress(p);
                    await new Promise(r => setTimeout(r, 150 + Math.random() * 100));
                }

                const result = processPlayerShotAgainstBot(targetX, targetY);
                const botTxHash = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');

                setGeneratingProofCell(null);
                setProofProgress(0);

                setEnemyGrid(prev => ({ ...prev, [index]: result.isHit ? 'HIT' : 'MISS' }));
                soundEngine.play('proof_complete');

                if (result.isHit) {
                    soundEngine.play('hit_explosion');
                    const newHits = playerHitsOnBot + 1;
                    setPlayerHitsOnBot(newHits);
                    setPlayerHits(playerHits + 1);
                    setLastMissInfo(null);
                    setLastHitTx(botTxHash);

                    // Check if player wins
                    if (newHits >= TOTAL_SHIP_CELLS) {
                        setTimeout(() => {
                            setDidWin(true);
                            setScreen('GAME_OVER');
                        }, 1500);
                        return;
                    }
                } else {
                    soundEngine.play('miss_splash');
                    soundEngine.play('sonar_ping');
                    const cellName = `${String.fromCharCode(65 + targetY)}${targetX + 1}`;
                    setLastMissInfo({ cell: cellName, distance: result.distLabel, txHash: botTxHash });
                    setLastHitTx(null);
                }

                // Bot's turn
                setTurn('ENEMY');
                executeBotTurn();

            } else {
                // ── PvP Mode: Use Web Worker + Stellar ──
                const proofResult = await new Promise<any>((resolve, reject) => {
                    if (!workerRef.current) { reject(new Error('Worker not ready')); return; }

                    workerRef.current.onmessage = (e) => {
                        if (e.data.type === 'PROOF_PROGRESS') {
                            setProofProgress(e.data.percent);
                        } else if (e.data.type === 'PROOF_READY') {
                            resolve(e.data.proof);
                        } else if (e.data.type === 'PROOF_ERROR') {
                            reject(new Error(e.data.error));
                        }
                    };

                    // Find actual closest ship using Chebyshev distance
                    const closest = findClosestShip(shipGrid, targetX, targetY);
                    const closestX = closest.x;
                    const closestY = closest.y;

                    workerRef.current.postMessage({
                        type: 'GENERATE_PROOF',
                        witness: {
                            shipGrid,
                            merklePath: [],
                            targetX,
                            targetY,
                            closestShipX: closestX,
                            closestShipY: closestY,
                            layoutNonce,
                        },
                    });
                });

                // Submit to Stellar
                const txResult = await callSubmitShot(
                    wallet?.address || '',
                    gameId || '',
                    targetX,
                    targetY,
                    proofResult.proof,
                    proofResult.publicInputs
                );

                setLastTx(txResult);
                setGeneratingProofCell(null);
                setProofProgress(0);

                const isHit = txResult.isHit;
                setEnemyGrid(prev => ({ ...prev, [index]: isHit ? 'HIT' : 'MISS' }));

                if (!isHit) {
                    const dist = txResult.distance;
                    const distLabel: 'HOT' | 'WARM' | 'COLD' = dist <= 2 ? 'HOT' : dist <= 4 ? 'WARM' : 'COLD';
                    const cellName = `${String.fromCharCode(65 + targetY)}${targetX + 1}`;
                    setLastMissInfo({ cell: cellName, distance: distLabel, txHash: txResult.txHash });
                    setLastHitTx(null);
                } else {
                    setLastMissInfo(null);
                    setLastHitTx(txResult.txHash);
                }

                setTurn('ENEMY');
                setTimeout(() => { setTurn('PLAYER'); }, 2000);
            }

        } catch (err: any) {
            setGlobalError('Proof generation failed: ' + (err.message || 'Unknown error'));
            setGeneratingProofCell(null);
            setProofProgress(0);
        }
    };

    // Compute remaining ships
    const playerShipsRemaining = TOTAL_SHIP_CELLS - botHitsOnPlayer;
    const enemyShipsRemaining = isBotGame
        ? countBotShipsRemaining(new Set(Object.entries(enemyGrid).filter(([_, v]) => v === 'HIT').map(([k]) => Number(k))))
        : TOTAL_SHIP_CELLS;

    const renderYourWaters = () => {
        const cells = [];
        for (let i = 0; i < 36; i++) {
            const hasShip = shipGrid[i] === 1;
            const hitState = playerGrid[i];
            const rowLabel = i % 6 === 0 ? String.fromCharCode(65 + Math.floor(i / 6)) : '';
            const colLabel = i < 6 ? (i + 1).toString() : '';
            cells.push(
                <div key={`y-${i}`} className={`relative w-[34px] h-[34px] md:w-[38px] md:h-[38px] xl:w-[48px] xl:h-[48px] border border-ocean-gray ${hitState === 'HIT' ? 'bg-signal-red/20 border-signal-red' :
                    hitState === 'MISS' ? 'bg-hull' :
                        hasShip ? 'bg-mist-blue border-brass border-[1px]' : 'bg-hull'
                    }`}>
                    {colLabel && <div className="absolute -top-5 left-1/2 -translate-x-1/2 font-mono text-[0.6rem] text-haze-gray">{colLabel}</div>}
                    {rowLabel && <div className="absolute -left-5 top-1/2 -translate-y-1/2 font-mono text-[0.6rem] text-haze-gray">{rowLabel}</div>}
                    {hitState === 'HIT' && <div className="absolute inset-0 flex items-center justify-center text-signal-red font-bold text-lg" style={{ filter: 'drop-shadow(0 0 8px rgba(192,57,43,0.8))' }}>✕</div>}
                    {hitState === 'MISS' && <div className="absolute inset-0 flex items-center justify-center text-haze-gray font-bold">●</div>}
                </div>
            );
        }
        return cells;
    };

    const renderEnemyWaters = () => {
        const cells = [];
        for (let i = 0; i < 36; i++) {
            const state = enemyGrid[i];
            const isGenerating = generatingProofCell === i;
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
                    {state === 'MISS' && <div className="absolute inset-0 flex items-center justify-center text-haze-gray font-bold">●</div>}
                    {state === 'HIT' && <div className="absolute inset-0 flex items-center justify-center text-signal-red font-bold text-xl" style={{ filter: 'drop-shadow(0 0 8px rgba(192,57,43,0.8))' }}>✕</div>}
                    {isGenerating && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.2, repeat: Infinity }} className="absolute inset-0 flex items-center justify-center text-radar font-bold text-sm">⚡</motion.div>
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
                        {turn === 'PLAYER' ? 'YOUR TURN TO FIRE' : isBotGame ? 'PHANTOM AI TARGETING...' : 'ENEMY TURN'}
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
                        <button onClick={() => { setDidWin(true); setScreen('GAME_OVER'); }} className="px-2 py-1 bg-abyss border border-ocean-gray hover:text-smoke">DEBUG: WIN</button>
                        <button onClick={() => { setDidWin(false); setScreen('GAME_OVER'); }} className="px-2 py-1 bg-abyss border border-ocean-gray hover:text-smoke">DEBUG: LOSE</button>
                    </div>
                </div>

                {/* GRIDS */}
                <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] flex-1 gap-8 lg:gap-16 overflow-hidden pt-4 pb-12">

                    <div className="flex flex-col lg:pl-4">
                        <h2 className="font-mono text-brass tracking-widest text-sm mb-8 bg-hull inline-block border-l-2 border-brass px-3 py-1 self-start">YOUR WATERS</h2>
                        <div className="grid grid-cols-6 gap-0 border border-ocean-gray bg-abyss p-[1px] self-start ml-4 opacity-80">
                            {renderYourWaters()}
                        </div>
                    </div>

                    <div className="flex flex-col items-center">
                        <h2 className="font-mono text-haze-gray tracking-widest text-sm mb-8 bg-hull inline-block border-l-2 border-ocean-gray px-3 py-1 self-center lg:self-start">
                            {isBotGame ? 'PHANTOM AI WATERS' : 'ENEMY WATERS'}
                        </h2>

                        <div className="grid grid-cols-6 gap-0 border border-ocean-gray bg-abyss p-[1px] self-center lg:self-start lg:ml-6 mb-8 relative">
                            {renderEnemyWaters()}

                            <AnimatePresence>
                                {generatingProofCell !== null && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 10 }}
                                        className="absolute bottom-[-100px] right-0 w-[340px] bg-hull border border-brass p-4 z-10"
                                        style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.5)' }}
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.8, repeat: Infinity }} className="text-radar font-bold">⚡</motion.span>
                                            <span className="font-mono text-smoke text-sm">GENERATING ZK PROOF</span>
                                        </div>
                                        <div className="font-mono text-haze-gray text-[0.65rem] mb-3">Noir circuit · BN254 · Groth16</div>
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
                        <div className="h-[130px] w-full flex justify-center lg:justify-start lg:ml-6">
                            <AnimatePresence>
                                {lastMissInfo && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 20 }}
                                        key={lastMissInfo.cell}
                                        className="bg-hull border-l-4 border-radar p-4 min-w-[320px]"
                                        style={{ boxShadow: '-8px 0 16px -8px rgba(61,255,110,0.3)' }}
                                    >
                                        <div className="font-mono text-[0.7rem] text-smoke mb-2 tracking-widest">◉ PROXIMITY REPORT — {lastMissInfo.cell}</div>
                                        <div className="w-full border-b border-ocean-gray mb-3"></div>
                                        <div className="font-mono text-sm text-radar tracking-widest flex items-center gap-3 mb-2">
                                            <span className="opacity-80">
                                                {lastMissInfo.distance === 'HOT' ? '[●●●●●●░░░░]' : lastMissInfo.distance === 'WARM' ? '[●●●░░░░░░░]' : '[●░░░░░░░░░]'}
                                            </span>
                                            <span>{lastMissInfo.distance === 'HOT' ? 'VERY HOT — 1-2 CELLS' : lastMissInfo.distance === 'WARM' ? 'WARM — 3-4 CELLS' : 'COLD — 5-6 CELLS'}</span>
                                        </div>
                                        <a
                                            href={`${EXPLORER_BASE}${lastMissInfo.txHash}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="font-mono text-[0.55rem] text-haze-gray uppercase hover:text-smoke"
                                        >
                                            CRYPTOGRAPHIC RANGE PROOF · VERIFIED ON STELLAR ↗
                                        </a>
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
