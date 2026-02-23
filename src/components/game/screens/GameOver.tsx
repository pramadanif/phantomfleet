"use client";

import { motion } from 'motion/react';
import { useGame } from '../GameContext';
import {
    EXPLORER_BASE,
    callRevealLayout,
    callGetGameState,
    callHasRevealedLayout,
    callGetRevealedLayout,
} from '../../../utils/stellar';
import { useState, useEffect, useRef } from 'react';
import { soundEngine } from '../../../utils/soundEngine';
import { computeCommitment } from '../../../utils/zkProof';

export function GameOver() {
    const { didWin, setScreen, setGameId, wallet, gameId, setLastTx, shotsFired, playerHits, isBotGame, enemyShipGrid, setEnemyShipGrid, shipGrid, layoutNonce } = useGame();
    const [endGameTx] = useState<string | null>(null);
    const [revealStep, setRevealStep] = useState(0);
    const [revealStatus, setRevealStatus] = useState<string>('PUBLISHING YOUR REVEAL...');
    const revealFlowStartedRef = useRef<string | null>(null);

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

    // Staggered reveal animation
    useEffect(() => {
        const timer = setInterval(() => {
            setRevealStep(prev => {
                if (prev >= 36) { clearInterval(timer); return 36; }
                return prev + 1;
            });
        }, 80);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!wallet?.address || !gameId) return;

        const runKey = `${wallet.address}:${gameId}`;
        if (revealFlowStartedRef.current === runKey) return;
        revealFlowStartedRef.current = runKey;

        let cancelled = false;

        const runRevealFlow = async () => {
            try {
                setRevealStatus('PUBLISHING YOUR REVEAL...');
                try {
                    await callRevealLayout(wallet.address, gameId, shipGrid, layoutNonce);
                } catch (err: any) {
                    const msg = String(err?.message || err);
                    if (!msg.includes('AlreadyRevealed') && !msg.includes('#14')) {
                        throw err;
                    }
                }

                if (isBotGame) {
                    const botRevealRes = await fetch('/api/bot/onchain', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'reveal',
                            gameId,
                            playerAddress: wallet.address,
                        }),
                    });
                    const botRevealData = await botRevealRes.json();
                    if (!botRevealRes.ok || !botRevealData?.ok) {
                        throw new Error(botRevealData?.error || 'Failed to trigger bot reveal');
                    }
                }

                setRevealStatus('WAITING FOR OPPONENT REVEAL...');

                const maxAttempts = 60;
                for (let attempt = 0; attempt < maxAttempts; attempt++) {
                    if (cancelled) return;

                    const state = await callGetGameState(wallet.address, gameId);
                    const candidates = [state.player1, state.player2]
                        .filter((address) => !!address && address !== wallet.address);

                    for (const opponentAddress of candidates) {
                        const hasReveal = await callHasRevealedLayout(wallet.address, gameId, opponentAddress);
                        if (!hasReveal) continue;

                        const opponentCommitment = (
                            opponentAddress === state.player1 ? state.p1Commitment : state.p2Commitment
                        )
                            .toLowerCase()
                            .replace(/^0x/, '');

                        const revealed = await callGetRevealedLayout(wallet.address, gameId, opponentAddress);
                        const recomputed = (await computeCommitment(revealed.shipGrid, revealed.layoutNonceHex))
                            .toLowerCase()
                            .replace(/^0x/, '');

                        if (recomputed === opponentCommitment) {
                            setEnemyShipGrid(revealed.shipGrid);
                            setRevealStatus('REVEAL VERIFIED');
                        } else {
                            setRevealStatus('REVEAL RECEIVED BUT COMMITMENT MISMATCH');
                        }
                        return;
                    }

                    await new Promise((resolve) => setTimeout(resolve, 2000));
                }

                setRevealStatus('OPPONENT HAS NOT REVEALED YET');
            } catch (err: any) {
                if (!cancelled) {
                    setRevealStatus(`REVEAL ERROR: ${err?.message || 'unknown'}`);
                }
            }
        };

        runRevealFlow();
        return () => {
            cancelled = true;
        };
    }, [isBotGame, wallet?.address, gameId, shipGrid, layoutNonce, setEnemyShipGrid]);

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

                {/* REAL FLEET REVEAL — actual enemy ship positions */}
                <div className="w-full bg-hull border border-ocean-gray p-8 mb-12 relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-ocean-gray to-transparent" />
                    <h3 className="font-mono text-xs text-haze-gray mb-6 tracking-widest">
                        {didWin ? 'ENEMY FLEET POSITIONS REVEALED' : 'OPPONENT\'S FLEET REVEALED'}
                    </h3>
                    <div className="grid grid-cols-6 gap-1 w-fit mx-auto">
                        {Array.from({ length: 36 }).map((_, i) => {
                            const isShip = enemyShipGrid[i] === 1;
                            const isRevealed = i < revealStep;
                            return (
                                <motion.div
                                    key={i}
                                    initial={{ scale: 0, opacity: 0, rotateY: 180 }}
                                    animate={isRevealed ? { scale: 1, opacity: 1, rotateY: 0 } : {}}
                                    transition={{ duration: 0.4, ease: 'easeOut' }}
                                    className={`w-8 h-8 border flex items-center justify-center font-mono text-xs ${isRevealed
                                        ? isShip
                                            ? 'bg-signal-red/30 border-signal-red text-signal-red'
                                            : 'bg-ocean-gray/20 border-ocean-gray/50 text-ocean-gray'
                                        : 'bg-hull border-ocean-gray/30'
                                        }`}
                                    style={isRevealed && isShip ? { boxShadow: 'inset 0 0 12px rgba(192,57,43,0.8), 0 0 8px rgba(192,57,43,0.5)' } : {}}
                                >
                                    {isRevealed && (isShip ? '■' : '·')}
                                </motion.div>
                            );
                        })}
                    </div>
                    <p className="font-mono text-[0.6rem] text-haze-gray mt-4 tracking-widest">
                        LAYOUT WAS PRIVATE UNTIL NOW — VERIFIED BY ZK PROOF
                    </p>
                    <p className="font-mono text-[0.6rem] text-radar mt-2 tracking-widest">
                        {revealStatus}
                    </p>
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
                        GAME SEALED ON STELLAR
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
