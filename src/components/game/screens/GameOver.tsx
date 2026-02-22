"use client";

import { motion } from 'motion/react';
import { useGame } from '../GameContext';
import { callEndGame, EXPLORER_BASE } from '../../../utils/stellar';
import { useState, useEffect } from 'react';
import { soundEngine } from '../../../utils/soundEngine';

export function GameOver() {
    const { didWin, setScreen, setGameId, wallet, gameId, setLastTx, shotsFired, playerHits, isBotGame } = useGame();
    const [endGameTx, setEndGameTx] = useState<string | null>(null);

    const resultText = didWin ? "VICTORY" : "DEFEATED";
    const subText = didWin
        ? "Enemy fleet eliminated. All proofs verified on Stellar."
        : "Your fleet has been eliminated.";
    const accentColor = didWin ? "text-brass" : "text-haze-gray";

    // Real stats from game state
    const shots = shotsFired || 1;
    const hits = playerHits;
    const accuracy = Math.round((hits / shots) * 100);
    const proofSize = (shots * 0.256).toFixed(2);

    // Play victory/defeat sound
    useEffect(() => {
        soundEngine.stopMusic();
        soundEngine.play(didWin ? 'victory' : 'defeat');
    }, [didWin]);

    // Call end_game on mount (skip for bot games)
    useEffect(() => {
        if (isBotGame) return;
        async function endGame() {
            try {
                const result = await callEndGame(wallet?.address || '', gameId || '');
                setEndGameTx(result.txHash);
                setLastTx(result);
            } catch {
                // Non-fatal
            }
        }
        endGame();
    }, [wallet, gameId, setLastTx, isBotGame]);

    const handlePlayAgain = () => {
        setGameId(null);
        setScreen('LOBBY');
        soundEngine.play('ui_click');
    };

    return (
        <div className="fixed inset-0 bg-abyss/95 backdrop-blur-[4px] z-50 flex flex-col items-center justify-center p-6 text-center overflow-y-auto">
            <div
                className="absolute inset-0 -z-10 opacity-20 pointer-events-none"
                style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(184,150,46,0.03) 0px, rgba(184,150,46,0.03) 1px, transparent 1px, transparent 80px)' }}
            />

            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className="flex flex-col items-center max-w-3xl w-full"
            >
                <h1 className={`font-display text-7xl md:text-9xl mb-4 tracking-widest ${accentColor}`}>
                    {resultText}
                </h1>

                <p className="font-mono text-smoke text-lg tracking-widest mb-12">
                    {subText}
                </p>

                {/* FLEET REVEAL */}
                <div className="w-full bg-hull border border-ocean-gray p-8 mb-12 relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-ocean-gray to-transparent" />
                    <h3 className="font-mono text-xs text-haze-gray mb-6 tracking-widest">POST-BATTLE ANALYSIS REVEAL</h3>
                    <div className="flex justify-center gap-1 flex-wrap">
                        {Array.from({ length: 36 }).map((_, i) => (
                            <motion.div
                                key={i}
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ delay: i * 0.05, duration: 0.3 }}
                                className={`w-6 h-6 border border-abyss ${(i % 5 === 0 || i % 9 === 0) ? 'bg-signal-red' : 'bg-ocean-gray'}`}
                                style={(i % 5 === 0 || i % 9 === 0) ? { boxShadow: 'inset 0 0 12px rgba(192,57,43,0.8), 0 0 8px rgba(192,57,43,0.5)' } : {}}
                            />
                        ))}
                    </div>
                </div>

                {/* STATS */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full mb-12 font-mono text-sm tracking-widest">
                    <div className="flex flex-col items-center p-4 bg-hull border border-ocean-gray">
                        <span className="text-haze-gray mb-2">SHOTS FIRED</span>
                        <span className="text-smoke text-xl">{shots}</span>
                    </div>
                    <div className="flex flex-col items-center p-4 bg-hull border border-ocean-gray">
                        <span className="text-haze-gray mb-2">HITS</span>
                        <span className="text-smoke text-xl">{hits}</span>
                    </div>
                    <div className="flex flex-col items-center p-4 bg-hull border border-ocean-gray">
                        <span className="text-haze-gray mb-2">ACCURACY</span>
                        <span className="text-smoke text-xl">{accuracy}%</span>
                    </div>
                    <div className="flex flex-col items-center p-4 bg-hull border border-ocean-gray">
                        <span className="text-haze-gray mb-2">PROOFS</span>
                        <span className="text-smoke text-xl">{shots} · {proofSize}KB</span>
                    </div>
                </div>

                {/* BADGES & CTA */}
                <div className="flex flex-col items-center gap-8">
                    <div className="font-mono text-radar text-sm tracking-widest flex items-center gap-2 px-6 py-2 border border-radar/50 bg-radar/10">
                        <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }} className="w-2 h-2 rounded-full bg-radar" />
                        {isBotGame ? 'GAME COMPLETED LOCALLY' : 'GAME SEALED ON STELLAR'}
                    </div>

                    {endGameTx && (
                        <a
                            href={`${EXPLORER_BASE}${endGameTx}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-haze-gray text-xs hover:text-smoke"
                        >
                            END_GAME TX: {endGameTx.substring(0, 16)}... ↗
                        </a>
                    )}

                    <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handlePlayAgain}
                            className="bg-brass text-abyss font-sans font-bold text-[1rem] tracking-wider py-4 px-10 transition-colors"
                        >
                            PLAY AGAIN →
                        </motion.button>
                        {endGameTx && (
                            <motion.button
                                whileHover={{ borderColor: '#8DA0AC', color: '#8DA0AC' }}
                                onClick={() => window.open(`${EXPLORER_BASE}${endGameTx}`, '_blank')}
                                className="bg-transparent border border-ocean-gray text-haze-gray font-sans font-bold text-[1rem] tracking-wider py-4 px-10 transition-colors"
                            >
                                VIEW ON STELLAR EXPLORER ↗
                            </motion.button>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
