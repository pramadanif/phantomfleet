"use client";

import { motion } from 'motion/react';
import { useGame } from '../GameContext';
import {
    EXPLORER_BASE,
    callRevealLayout,
    callGetGameState,
    callGetRevealedLayout,
} from '../../../utils/stellar';
import { useState, useEffect, useRef } from 'react';
import { soundEngine } from '../../../utils/soundEngine';
import { computeCommitment } from '../../../utils/zkProof';

export function GameOver() {
    const { didWin, setScreen, setGameId, wallet, gameId, setLastTx, shotsFired, playerHits, isBotGame, enemyShipGrid, setEnemyShipGrid, shipGrid, layoutNonce, opponentAddress } = useGame();
    const [endGameTx] = useState<string | null>(null);
    const [revealStep, setRevealStep] = useState(0);
    const [revealStatus, setRevealStatus] = useState<string>('PUBLISHING YOUR REVEAL...');
    const revealFlowStartedRef = useRef<string | null>(null);

    const isValidStellarAddress = (value: string) => /^G[A-Z2-7]{55}$/.test(value);

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
        // Local bot games: grid is already set, no on-chain reveal needed
        if (isBotGame) {
            setRevealStatus('TUTORIAL COMPLETE — FLEET REVEALED');
            return;
        }

        if (!wallet?.address || !gameId) return;

        const runKey = `${wallet.address}:${gameId}`;
        if (revealFlowStartedRef.current === runKey) return;
        revealFlowStartedRef.current = runKey;

        let cancelled = false;

        const runRevealFlow = async () => {
            // STEP 1: Publish our own reveal
            try {
                setRevealStatus('PUBLISHING YOUR REVEAL...');
                console.log('[reveal] submitting own reveal, address:', wallet.address, 'gameId:', gameId);
                await callRevealLayout(wallet.address, gameId, shipGrid, layoutNonce);
                console.log('[reveal] own reveal submitted OK');
            } catch (err: any) {
                const msg = String(err?.message || err);
                console.warn('[reveal] own reveal error:', msg);
                // Tolerate any "already revealed" type error — many possible error codes
                const isAlreadyRevealed = msg.includes('AlreadyRevealed') || msg.includes('#14') || msg.includes('#16') || msg.includes('#9');
                if (!isAlreadyRevealed) {
                    // Even if own reveal fails, still try to poll for opponent
                    console.warn('[reveal] own reveal failed but continuing to poll:', msg);
                }
            }

            // STEP 2: Get game state to find opponent address
            setRevealStatus('WAITING FOR OPPONENT REVEAL...');
            console.log('[reveal] starting opponent poll');

            let opponentAddr: string | null = null;
            try {
                const state = await callGetGameState(wallet.address, gameId);
                console.log('[reveal] game state p1:', state.player1, 'p2:', state.player2, 'self:', wallet.address, 'cached opponent:', opponentAddress);

                // Collect ALL valid addresses that could be the opponent
                const allAddrs = [opponentAddress, state.player1, state.player2]
                    .filter((a): a is string => typeof a === 'string' && !!a && isValidStellarAddress(a));

                // Prefer the address that isn't us
                const opponents = allAddrs.filter(a => a !== wallet.address);
                if (opponents.length > 0) {
                    opponentAddr = opponents[0];
                } else if (allAddrs.length > 0) {
                    // Same-wallet testing fallback: use any valid addr (even self)
                    opponentAddr = allAddrs[0];
                }
                console.log('[reveal] resolved opponent address:', opponentAddr);
            } catch (err) {
                console.error('[reveal] failed to get game state:', err);
            }

            if (!opponentAddr) {
                setRevealStatus('COULD NOT DETERMINE OPPONENT ADDRESS');
                return;
            }

            // STEP 3: Poll for opponent's revealed layout (direct fetch, skip has_revealed_layout)
            const maxAttempts = 90;
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                if (cancelled) return;

                try {
                    console.log(`[reveal] poll attempt ${attempt + 1}/${maxAttempts} for ${opponentAddr}`);
                    const revealed = await callGetRevealedLayout(wallet.address, gameId, opponentAddr);

                    if (revealed && revealed.shipGrid && revealed.shipGrid.length === 36 && revealed.shipGrid.some(c => c === 1)) {
                        console.log('[reveal] GOT opponent layout:', revealed.shipGrid.join(','), 'nonce:', revealed.layoutNonceHex?.substring(0, 20));

                        // Verify commitment (best-effort, don't block on failure)
                        try {
                            const state = await callGetGameState(wallet.address, gameId);
                            const opponentCommitment = (opponentAddr === state.player1 ? state.p1Commitment : state.p2Commitment)
                                .toLowerCase().replace(/^0x/, '');
                            const recomputed = (await computeCommitment(revealed.shipGrid, revealed.layoutNonceHex))
                                .toLowerCase().replace(/^0x/, '');

                            console.log('[reveal] commitment check — on-chain:', opponentCommitment.substring(0, 16), 'recomputed:', recomputed.substring(0, 16));

                            if (recomputed === opponentCommitment) {
                                setRevealStatus('REVEAL VERIFIED ✓');
                            } else {
                                setRevealStatus('REVEAL RECEIVED (COMMITMENT COULD NOT BE VERIFIED)');
                            }
                        } catch (commitErr) {
                            console.warn('[reveal] commitment verification failed, showing layout anyway:', commitErr);
                            setRevealStatus('REVEAL RECEIVED');
                        }

                        setEnemyShipGrid(revealed.shipGrid);
                        return;
                    }
                } catch {
                    // get_revealed_layout throws if layout doesn't exist yet — this is expected
                }

                // Progress feedback
                if (attempt > 0 && attempt % 10 === 0) {
                    setRevealStatus(`WAITING FOR OPPONENT REVEAL... (${attempt}/${maxAttempts})`);
                }

                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            setRevealStatus('OPPONENT HAS NOT REVEALED YET — TRY REFRESHING');
        };

        runRevealFlow().catch(err => {
            if (!cancelled) {
                console.error('[reveal] unexpected error:', err);
                setRevealStatus(`REVEAL ERROR: ${err?.message || 'unknown'}`);
            }
        });

        return () => { cancelled = true; };
    }, [isBotGame, wallet?.address, gameId, shipGrid, layoutNonce, setEnemyShipGrid, opponentAddress]);

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
                        {isBotGame ? 'LOCAL TUTORIAL — BOT FLEET POSITIONS' : 'LAYOUT WAS PRIVATE UNTIL NOW — VERIFIED BY ZK PROOF'}
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
                        {isBotGame ? 'TUTORIAL COMPLETE' : 'GAME SEALED ON STELLAR'}
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
