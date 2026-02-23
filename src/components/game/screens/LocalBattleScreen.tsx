"use client";

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useGame } from '../GameContext';
import { soundEngine } from '../../../utils/soundEngine';

const TOTAL_SHIP_CELLS = 11;

const BOT_GRID = [
    0, 1, 1, 1, 1, 0,
    0, 0, 0, 0, 0, 0,
    1, 1, 1, 0, 0, 0,
    0, 0, 0, 0, 1, 1,
    0, 0, 0, 0, 0, 0,
    1, 0, 0, 0, 0, 1,
];

type ProximityLabel = 'HOT' | 'WARM' | 'COLD';

function chebyshevProximity(tx: number, ty: number, grid: number[]): { isHit: boolean; minDist: number } {
    if (grid[ty * 6 + tx] === 1) return { isHit: true, minDist: 0 };
    let best = 10;
    for (let i = 0; i < 36; i++) {
        if (grid[i] !== 1) continue;
        const d = Math.max(Math.abs(tx - (i % 6)), Math.abs(ty - Math.floor(i / 6)));
        if (d < best) best = d;
    }
    return { isHit: false, minDist: best };
}

function distLabel(d: number): ProximityLabel {
    return d <= 2 ? 'HOT' : d <= 4 ? 'WARM' : 'COLD';
}

export function LocalBattleScreen() {
    const { shipGrid, setScreen, setDidWin, setEnemyShipGrid, setShotsFired, setPlayerHits } = useGame();

    const [turn, setTurn] = useState<'PLAYER' | 'BOT'>('PLAYER');
    const [playerBoard, setPlayerBoard] = useState<Record<number, 'HIT' | 'MISS'>>({});
    const [botBoard, setBotBoard] = useState<Record<number, 'HIT' | 'MISS'>>({});
    const [botCellDist, setBotCellDist] = useState<Record<number, number>>({});
    const [playerHitsOnBot, setPlayerHitsOnBot] = useState(0);
    const [botHitsOnPlayer, setBotHitsOnPlayer] = useState(0);
    const [shotCount, setShotCount] = useState(0);
    const [hint, setHint] = useState('TUTORIAL: Tap any cell on PHANTOM AI WATERS to fire your first shot!');
    const [hintKey, setHintKey] = useState(0);
    const [lastMissInfo, setLastMissInfo] = useState<{ cell: string; distance: ProximityLabel } | null>(null);
    const [gameEnded, setGameEnded] = useState(false);

    // Refs for mutable tracking (avoid stale closures in effects)
    const botFiredRef = useRef(new Set<number>());
    const playerHitsRef = useRef(0);
    const botHitsRef = useRef(0);
    const shotCountRef = useRef(0);
    const hasHitRef = useRef(false);
    const gameEndedRef = useRef(false);

    useEffect(() => {
        soundEngine.startMusic();
        soundEngine.play('game_start');
        return () => { soundEngine.stopMusic(); };
    }, []);

    const triggerGameOver = (playerWon: boolean) => {
        if (gameEndedRef.current) return;
        gameEndedRef.current = true;
        setGameEnded(true);
        setDidWin(playerWon);
        setEnemyShipGrid(BOT_GRID);
        setShotsFired(shotCountRef.current);
        setPlayerHits(playerHitsRef.current);
        setTimeout(() => setScreen('GAME_OVER'), 1500);
    };

    // Bot turn logic
    useEffect(() => {
        if (turn !== 'BOT' || gameEndedRef.current) return;

        setHint('PHANTOM AI is targeting your grid...');
        setHintKey(k => k + 1);

        const timer = setTimeout(() => {
            if (gameEndedRef.current) return;

            const available: number[] = [];
            for (let i = 0; i < 36; i++) {
                if (!botFiredRef.current.has(i)) available.push(i);
            }
            if (available.length === 0) { setTurn('PLAYER'); return; }

            const target = available[Math.floor(Math.random() * available.length)];
            botFiredRef.current.add(target);

            const isHit = shipGrid[target] === 1;
            setPlayerBoard(prev => ({ ...prev, [target]: isHit ? 'HIT' : 'MISS' }));

            if (isHit) {
                soundEngine.play('hit_explosion');
                botHitsRef.current += 1;
                setBotHitsOnPlayer(botHitsRef.current);

                if (botHitsRef.current >= TOTAL_SHIP_CELLS) {
                    setHint('Your fleet has been eliminated!');
                    setHintKey(k => k + 1);
                    triggerGameOver(false);
                    return;
                }

                if (botHitsRef.current >= TOTAL_SHIP_CELLS - 3) {
                    setHint(`Hull critical! ${botHitsRef.current}/${TOTAL_SHIP_CELLS} cells hit. Sink them fast!`);
                } else {
                    setHint('You\'ve been hit! Stay focused — find their ships before they find yours.');
                }
                setHintKey(k => k + 1);
            } else {
                soundEngine.play('miss_splash');
            }

            setTurn('PLAYER');
        }, 1200);

        return () => clearTimeout(timer);
    }, [turn]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleFireAtBot = (index: number) => {
        if (turn !== 'PLAYER' || botBoard[index] || gameEndedRef.current) return;

        const x = index % 6;
        const y = Math.floor(index / 6);
        const { isHit, minDist } = chebyshevProximity(x, y, BOT_GRID);

        setBotBoard(prev => ({ ...prev, [index]: isHit ? 'HIT' : 'MISS' }));
        shotCountRef.current += 1;
        setShotCount(shotCountRef.current);
        soundEngine.play('shot_fire');

        if (isHit) {
            soundEngine.play('hit_explosion');
            playerHitsRef.current += 1;
            setPlayerHitsOnBot(playerHitsRef.current);
            setLastMissInfo(null);

            if (playerHitsRef.current >= TOTAL_SHIP_CELLS) {
                setHint('ALL ENEMY SHIPS DESTROYED!');
                setHintKey(k => k + 1);
                triggerGameOver(true);
                return;
            }

            const remaining = TOTAL_SHIP_CELLS - playerHitsRef.current;
            if (!hasHitRef.current) {
                hasHitRef.current = true;
                setHint('DIRECT HIT! Ships span multiple cells — fire at adjacent cells to sink it!');
            } else if (remaining <= 3) {
                setHint(`Almost there! Only ${remaining} enemy cells left. Check hot zones!`);
            } else {
                setHint(`Hit confirmed! ${remaining} enemy cells remaining. Keep targeting this area.`);
            }
        } else {
            soundEngine.play('miss_splash');
            soundEngine.play('sonar_ping');

            const label = distLabel(minDist);
            const cellName = `${String.fromCharCode(65 + y)}${x + 1}`;
            setLastMissInfo({ cell: cellName, distance: label });
            setBotCellDist(prev => ({ ...prev, [index]: minDist }));

            if (label === 'HOT') setHint('VERY CLOSE! Orange rings = 1-2 cells away. Try adjacent cells!');
            else if (label === 'WARM') setHint('Getting warm! Yellow = 3-4 cells away. A ship is nearby.');
            else setHint('Cold zone — far from any ship. Try a different area of the grid.');
        }

        setHintKey(k => k + 1);
        setTurn('BOT');
    };

    const playerShipsRemaining = TOTAL_SHIP_CELLS - botHitsOnPlayer;
    const botShipsRemaining = TOTAL_SHIP_CELLS - playerHitsOnBot;

    return (
        <div className="min-h-screen bg-abyss flex flex-col pt-4 relative">
            <div className="w-full max-w-[1400px] mx-auto px-4 md:px-6 flex-1 flex flex-col">

                {/* TUTORIAL HINT */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={hintKey}
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        className="bg-brass/10 border border-brass/40 p-3 mb-4 flex items-center gap-3"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brass shrink-0">
                            <path d="M9 18h6" />
                            <path d="M10 22h4" />
                            <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
                        </svg>
                        <span className="font-mono text-brass text-xs tracking-wide flex-1">{hint}</span>
                        <span className="font-mono text-haze-gray text-[0.6rem] tracking-widest shrink-0">TUTORIAL</span>
                    </motion.div>
                </AnimatePresence>

                {/* STATUS BAR */}
                <div className="flex flex-col md:flex-row items-center justify-between border border-ocean-gray bg-hull p-4 mb-4 gap-4">
                    <div className={`font-mono text-sm tracking-widest flex items-center gap-2 ${turn === 'PLAYER' ? 'text-radar' : 'text-haze-gray'}`}>
                        {turn === 'PLAYER' && (
                            <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }} className="w-2 h-2 bg-radar rounded-full" />
                        )}
                        {turn === 'PLAYER' ? 'YOUR TURN TO FIRE' : 'PHANTOM AI TARGETING...'}
                    </div>

                    <div className="flex items-center gap-8 font-mono text-xs">
                        <div className="flex flex-col items-center">
                            <span className="text-haze-gray mb-1">YOUR SHIPS</span>
                            <span className={`text-lg ${playerShipsRemaining < 5 ? 'text-signal-red' : 'text-smoke'}`}>
                                {playerShipsRemaining}/{TOTAL_SHIP_CELLS}
                            </span>
                        </div>
                        <div className="w-[1px] h-8 bg-ocean-gray"></div>
                        <div className="flex flex-col items-center">
                            <span className="text-haze-gray mb-1">BOT SHIPS</span>
                            <span className={`text-lg ${botShipsRemaining < 5 ? 'text-signal-red' : 'text-smoke'}`}>
                                {botShipsRemaining}/{TOTAL_SHIP_CELLS}
                            </span>
                        </div>
                    </div>

                    <span className="font-mono text-[0.65rem] px-2 py-1 bg-brass/10 border border-brass/30 text-brass">TUTORIAL MODE</span>
                </div>

                {/* GRIDS */}
                <div className="flex flex-col lg:flex-row justify-center items-start flex-1 gap-12 lg:gap-32 pt-12 pb-12 w-full">

                    {/* YOUR WATERS */}
                    <div className="flex flex-col items-center lg:items-end">
                        <h2 className="font-mono text-brass tracking-widest text-sm mb-8 bg-hull inline-block border-r-2 border-brass px-3 py-1">YOUR WATERS</h2>
                        <div className="grid grid-cols-6 gap-0 border border-ocean-gray bg-abyss p-[1px] opacity-80 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
                            {Array.from({ length: 36 }).map((_, i) => {
                                const hasShip = shipGrid[i] === 1;
                                const hitState = playerBoard[i];
                                const rowLabel = i % 6 === 0 ? String.fromCharCode(65 + Math.floor(i / 6)) : '';
                                const colLabel = i < 6 ? (i + 1).toString() : '';
                                return (
                                    <div key={`y-${i}`} className={`relative w-[34px] h-[34px] md:w-[38px] md:h-[38px] xl:w-[48px] xl:h-[48px] border border-ocean-gray ${hitState === 'HIT' ? 'bg-signal-red/20 border-signal-red' :
                                        hitState === 'MISS' ? 'bg-hull' :
                                            hasShip ? 'bg-mist-blue border-brass border-[1px]' : 'bg-hull'
                                        }`}>
                                        {colLabel && <div className="absolute -top-5 left-1/2 -translate-x-1/2 font-mono text-[0.6rem] text-haze-gray">{colLabel}</div>}
                                        {rowLabel && <div className="absolute -left-5 top-1/2 -translate-y-1/2 font-mono text-[0.6rem] text-haze-gray">{rowLabel}</div>}
                                        {hitState === 'HIT' && (
                                            <div className="absolute inset-0 flex items-center justify-center text-signal-red" style={{ filter: 'drop-shadow(0 0 8px rgba(192,57,43,0.8))' }}>
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                    <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
                                                </svg>
                                            </div>
                                        )}
                                        {hitState === 'MISS' && (
                                            <div className="absolute inset-0 flex items-center justify-center text-haze-gray">
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"></circle></svg>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ENEMY WATERS */}
                    <div className="flex flex-col items-center lg:items-start">
                        <h2 className="font-mono text-haze-gray tracking-widest text-sm mb-8 bg-hull inline-block border-l-2 border-ocean-gray px-3 py-1">PHANTOM AI WATERS</h2>
                        <div className="grid grid-cols-6 gap-0 border border-ocean-gray bg-abyss p-[1px] mb-8 relative shadow-[0_0_40px_rgba(0,0,0,0.6)]">
                            {Array.from({ length: 36 }).map((_, i) => {
                                const state = botBoard[i];
                                const rowLabel = i % 6 === 0 ? String.fromCharCode(65 + Math.floor(i / 6)) : '';
                                const colLabel = i < 6 ? (i + 1).toString() : '';
                                return (
                                    <div
                                        key={`e-${i}`}
                                        onClick={() => handleFireAtBot(i)}
                                        className={`
                                            relative w-[38px] h-[38px] md:w-[44px] md:h-[44px] xl:w-[64px] xl:h-[64px] border border-ocean-gray transition-colors
                                            ${!state && turn === 'PLAYER' && !gameEnded ? 'hover:bg-ocean-gray bg-hull cursor-crosshair' : 'bg-hull'}
                                            ${state === 'HIT' ? 'bg-signal-red/20 border-signal-red' : ''}
                                        `}
                                        style={state === 'HIT' ? { boxShadow: 'inset 0 0 16px rgba(192,57,43,0.4)' } : {}}
                                    >
                                        {colLabel && <div className="absolute -top-6 left-1/2 -translate-x-1/2 font-mono text-[0.65rem] text-haze-gray">{colLabel}</div>}
                                        {rowLabel && <div className="absolute -left-6 top-1/2 -translate-y-1/2 font-mono text-[0.65rem] text-haze-gray">{rowLabel}</div>}
                                        {state === 'MISS' && (
                                            <>
                                                {(() => {
                                                    const dist = botCellDist[i];
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
                                                    color: botCellDist[i] !== undefined && botCellDist[i] <= 2 ? '#FF6B35' : botCellDist[i] !== undefined && botCellDist[i] <= 4 ? '#FFC107' : '#6495ED'
                                                }}>
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"></circle></svg>
                                                </div>
                                            </>
                                        )}
                                        {state === 'HIT' && (
                                            <div className="absolute inset-0 flex items-center justify-center text-signal-red" style={{ filter: 'drop-shadow(0 0 8px rgba(192,57,43,0.8))' }}>
                                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                    <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
                                                </svg>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
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
                                                <circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="4"></circle>
                                                <line x1="12" y1="2" x2="12" y2="4"></line><line x1="12" y1="20" x2="12" y2="22"></line>
                                                <line x1="2" y1="12" x2="4" y2="12"></line><line x1="20" y1="12" x2="22" y2="12"></line>
                                            </svg>
                                            PROXIMITY REPORT — {lastMissInfo.cell}
                                        </div>
                                        <div className="w-full border-b border-ocean-gray mb-3"></div>
                                        <div className="font-mono text-sm tracking-widest flex items-center gap-4 mb-2">
                                            <div className="flex gap-1">
                                                {Array.from({ length: 10 }).map((_, j) => {
                                                    const activeBlocks = lastMissInfo.distance === 'HOT' ? 6 : lastMissInfo.distance === 'WARM' ? 3 : 1;
                                                    const colorClass = lastMissInfo.distance === 'HOT' ? 'bg-[#FF6B35]' : lastMissInfo.distance === 'WARM' ? 'bg-[#FFC107]' : 'bg-[#6495ED]';
                                                    return (
                                                        <div key={j} className={`w-2 h-4 ${j < activeBlocks ? colorClass : 'bg-ocean-gray/30'} border border-abyss border-[0.5px]`}></div>
                                                    );
                                                })}
                                            </div>
                                            <span style={{ color: lastMissInfo.distance === 'HOT' ? '#FF6B35' : lastMissInfo.distance === 'WARM' ? '#FFC107' : '#6495ED' }}>
                                                {lastMissInfo.distance === 'HOT' ? 'VERY HOT — 1-2 CELLS' : lastMissInfo.distance === 'WARM' ? 'WARM — 3-4 CELLS' : 'COLD — 5-6 CELLS'}
                                            </span>
                                        </div>
                                        <span className="font-mono text-[0.55rem] text-haze-gray uppercase">
                                            LOCAL PROXIMITY — CHEBYSHEV DISTANCE
                                        </span>
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
