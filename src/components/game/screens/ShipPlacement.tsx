"use client";

import { useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { useGame } from '../GameContext';
import { buildMerkleTree, computeCommitment } from '../../../utils/zkProof';
import { callCommitLayout, callGetGameState, callHasVerificationKey, EXPLORER_BASE } from '../../../utils/stellar';
import { soundEngine } from '../../../utils/soundEngine';

type ShipType = 'CARRIER' | 'CRUISER' | 'DESTROYER' | 'SCOUT';
type Orientation = 'HORIZONTAL' | 'VERTICAL';

interface ShipInfo {
    id: string;
    type: ShipType;
    size: number;
}

const INVENTORY: ShipInfo[] = [
    { id: 'C1', type: 'CARRIER', size: 4 },
    { id: 'R1', type: 'CRUISER', size: 3 },
    { id: 'D1', type: 'DESTROYER', size: 2 },
    { id: 'S1', type: 'SCOUT', size: 1 },
    { id: 'S2', type: 'SCOUT', size: 1 },
];

const CRYPTO_TIP = "Your layout will be cryptographically sealed using a Poseidon hash before the game starts. Your opponent will never see this — guaranteed by zero-knowledge proof.";

export function ShipPlacement() {
    const { setScreen, setShipGrid, setLayoutNonce, wallet, gameId, setGlobalError, setLastTx, isBotGame } = useGame();

    const [placedShips, setPlacedShips] = useState<Record<string, { cells: number[], type: ShipType }>>({});
    const [selectedShip, setSelectedShip] = useState<string | null>(null);
    const [orientation, setOrientation] = useState<Orientation>('HORIZONTAL');
    const [hoverCells, setHoverCells] = useState<number[]>([]);
    const [isSealing, setIsSealing] = useState(false);
    const [sealedTx, setSealedTx] = useState<string | null>(null);
    const [sealStatus, setSealStatus] = useState<string>('');

    const isZeroCommitment = (hex: string) => {
        const clean = hex.toLowerCase().replace(/^0x/, '');
        return clean === ''.padStart(64, '0');
    };

    const waitForGameActive = async (callerAddress: string, gameIdValue: string) => {
        const timeoutMs = 5 * 60 * 1000;
        const pollMs = 2500;
        const started = Date.now();

        while (Date.now() - started < timeoutMs) {
            const state = await callGetGameState(callerAddress, gameIdValue);
            const bothCommitted = !isZeroCommitment(state.p1Commitment) && !isZeroCommitment(state.p2Commitment);
            if (state.status === 'Active' || bothCommitted) return;
            await new Promise((resolve) => setTimeout(resolve, pollMs));
        }

        throw new Error('Opponent has not sealed fleet yet (or game state has not synchronized). Please retry in a few seconds.');
    };

    const getHoverCells = useCallback((startIndex: number, size: number, ori: Orientation) => {
        const row = Math.floor(startIndex / 6);
        const col = startIndex % 6;
        const cells = [];

        for (let i = 0; i < size; i++) {
            if (ori === 'HORIZONTAL') {
                if (col + i >= 6) return null;
                cells.push(startIndex + i);
            } else {
                if (row + i >= 6) return null;
                cells.push(startIndex + (i * 6));
            }
        }

        const isOverlap = cells.some(c =>
            Object.values(placedShips).some(ship => ship.cells.includes(c))
        );
        if (isOverlap) return null;
        return cells;
    }, [placedShips]);

    const handleCellHover = (index: number) => {
        if (!selectedShip) { setHoverCells([]); return; }
        const shipInfo = INVENTORY.find(s => s.id === selectedShip)!;
        setHoverCells(getHoverCells(index, shipInfo.size, orientation) || []);
    };

    const handleCellClick = (index: number) => {
        const existingShipEntry = Object.entries(placedShips).find(([_, data]) => data.cells.includes(index));
        if (existingShipEntry) {
            const newPlaced = { ...placedShips };
            delete newPlaced[existingShipEntry[0]];
            setPlacedShips(newPlaced);
            setSelectedShip(existingShipEntry[0]);
            return;
        }
        if (!selectedShip || hoverCells.length === 0) return;
        const shipInfo = INVENTORY.find(s => s.id === selectedShip)!;
        setPlacedShips(prev => ({ ...prev, [selectedShip]: { cells: hoverCells, type: shipInfo.type } }));
        soundEngine.play('ship_place');
        setSelectedShip(null);
        setHoverCells([]);
    };

    const handleSeal = async () => {
        setIsSealing(true);
        try {
            // 1. Convert placed ships to flat grid
            const grid = new Array(36).fill(0);
            Object.values(placedShips).forEach(ship => {
                ship.cells.forEach(c => { grid[c] = 1; });
            });

            // Local bot mode: skip all on-chain operations
            if (isBotGame) {
                setShipGrid(grid);
                soundEngine.play('proof_complete');
                setSealStatus('FLEET DEPLOYED — ENTERING TUTORIAL...');
                setTimeout(() => setScreen('BATTLE'), 800);
                return;
            }

            // 2. Build Merkle tree (real Poseidon BN254 hashing)
            setSealStatus('BUILDING MERKLE TREE...');
            soundEngine.play('proof_generating');
            const { tree, nonce } = await buildMerkleTree(grid);

            // 3. Compute Poseidon commitment
            setSealStatus('COMPUTING POSEIDON COMMITMENT...');
            const commitment = await computeCommitment(grid, nonce);

            // 4. Store grid and nonce in context (needed for battle ZK proofs)
            setShipGrid(grid);
            setLayoutNonce(nonce);

            if (!wallet?.address || !gameId) {
                throw new Error('Wallet or game session missing');
            }

            setSealStatus('VERIFYING PROTOCOL 25 SETUP...');
            const hasVk = await callHasVerificationKey(wallet.address);
            if (!hasVk) {
                throw new Error('Verification key is not configured on-chain. Run scripts/set_vk.sh first.');
            }

            setSealStatus('SUBMITTING TO STELLAR...');
            const txResult = await callCommitLayout(wallet.address, gameId, commitment);

            setLastTx(txResult);
            setSealedTx(txResult.txHash);

            if (isBotGame) {
                setSealStatus('REQUESTING ON-CHAIN BOT COMMITMENT...');
                const botRes = await fetch('/api/bot/onchain', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'commit', gameId, playerAddress: wallet.address }),
                });
                const botJson = await botRes.json();
                if (!botRes.ok || !botJson?.ok) {
                    throw new Error(botJson?.error || 'Bot commit failed');
                }
            }

            setSealStatus('AWAITING OPPONENT COMMITMENT...');

            await waitForGameActive(wallet.address, gameId);
            setSealStatus('BOTH FLEETS SEALED. ENTERING BATTLE...');

            setTimeout(() => {
                setScreen('BATTLE');
            }, 1200);
        } catch (err: any) {
            setGlobalError('Fleet sealing failed: ' + (err.message || 'Unknown error'));
            setIsSealing(false);
            setSealStatus('');
        }
    };

    const renderGrid = () => {
        const cells = [];
        for (let i = 0; i < 36; i++) {
            const isHovered = hoverCells.includes(i);
            const placedShip = Object.values(placedShips).find(s => s.cells.includes(i));
            const rowLabel = i % 6 === 0 ? String.fromCharCode(65 + Math.floor(i / 6)) : '';
            const colLabel = i < 6 ? (i + 1).toString() : '';

            cells.push(
                <div
                    key={i}
                    onMouseEnter={() => handleCellHover(i)}
                    onMouseLeave={() => setHoverCells([])}
                    onClick={() => handleCellClick(i)}
                    className={`
            relative w-[38px] h-[38px] md:w-[64px] md:h-[64px] border border-ocean-gray 
            transition-colors duration-200
            ${placedShip ? 'bg-mist-blue border-brass border-[1px]' : 'bg-hull'}
            ${isHovered ? 'bg-ocean-gray' : ''}
          `}
                >
                    {colLabel && <div className="absolute -top-6 left-1/2 -translate-x-1/2 font-mono text-[0.65rem] text-haze-gray">{colLabel}</div>}
                    {rowLabel && <div className="absolute -left-6 top-1/2 -translate-y-1/2 font-mono text-[0.65rem] text-haze-gray">{rowLabel}</div>}
                </div>
            );
        }
        return cells;
    };

    const allPlaced = Object.keys(placedShips).length === INVENTORY.length;

    return (
        <div className="min-h-screen bg-abyss flex flex-col pt-16 px-6 relative">
            <div className="max-w-[1000px] w-full mx-auto flex flex-col items-center">

                <div className="text-center mb-12">
                    <h1 className="font-display text-chalk text-4xl md:text-5xl tracking-widest mb-2">DEPLOY YOUR FLEET</h1>
                    <p className="font-sans text-smoke text-lg leading-snug mb-3">
                        {isBotGame
                            ? <>Place your ships on the grid. The bot won&apos;t see your layout!</>
                            : <>Your layout will be cryptographically sealed.<br />Your opponent will never see this.</>}
                    </p>
                    {!isBotGame && (
                        <p className="font-mono text-haze-gray text-[0.65rem] tracking-wider max-w-lg mx-auto leading-relaxed border-t border-ocean-gray pt-2">
                            🔒 {CRYPTO_TIP}
                        </p>
                    )}
                    {isBotGame && (
                        <p className="font-mono text-brass text-[0.65rem] tracking-wider max-w-lg mx-auto leading-relaxed border-t border-brass/30 pt-2">
                            🎮 TUTORIAL MODE — No blockchain transactions. Place all ships and deploy!
                        </p>
                    )}
                </div>

                <div className="w-full flex flex-col md:flex-row gap-12 lg:gap-24 justify-center items-start">

                    {/* GRID */}
                    <div className="relative pl-6 pt-6">
                        <div className="grid grid-cols-6 gap-0 border border-ocean-gray bg-abyss p-[1px]">
                            {renderGrid()}
                        </div>
                    </div>

                    {/* INVENTORY */}
                    <div className="w-full max-w-[320px] flex flex-col gap-4">

                        <div className="flex bg-hull border border-ocean-gray p-1 mb-4">
                            <button
                                type="button"
                                onClick={() => setOrientation('HORIZONTAL')}
                                className={`flex-1 font-mono text-xs py-2 transition-colors ${orientation === 'HORIZONTAL' ? 'bg-brass text-abyss' : 'text-smoke'}`}
                            >
                                HORIZONTAL
                            </button>
                            <button
                                type="button"
                                onClick={() => setOrientation('VERTICAL')}
                                className={`flex-1 font-mono text-xs py-2 transition-colors ${orientation === 'VERTICAL' ? 'bg-brass text-abyss' : 'text-smoke'}`}
                            >
                                VERTICAL
                            </button>
                        </div>

                        <div className="flex flex-col gap-2">
                            {INVENTORY.map((ship) => {
                                const isPlaced = !!placedShips[ship.id];
                                const isSelected = selectedShip === ship.id;
                                return (
                                    <button
                                        key={ship.id}
                                        type="button"
                                        onClick={() => !isPlaced && setSelectedShip(isSelected ? null : ship.id)}
                                        disabled={isPlaced}
                                        className={`
                      w-full p-4 flex items-center justify-between border-l-4 transition-all
                      ${isSelected ? 'bg-brass text-abyss border-brass' : 'bg-hull border-brass/50 text-smoke'}
                      ${isPlaced ? 'opacity-50 line-through border-haze-gray' : 'hover:border-brass'}
                    `}
                                    >
                                        <div className="flex flex-col items-start gap-1">
                                            <span className={`font-sans font-bold tracking-wider ${isSelected ? 'text-abyss' : 'text-chalk'} ${isPlaced && 'text-haze-gray'}`}>
                                                {ship.type}
                                            </span>
                                            <div className="flex gap-1">
                                                {Array(ship.size).fill(0).map((_, i) => (
                                                    <div key={i} className={`w-3 h-3 ${isSelected ? 'bg-abyss' : isPlaced ? 'bg-haze-gray' : 'bg-smoke'}`}></div>
                                                ))}
                                            </div>
                                        </div>
                                        {isPlaced && (
                                            <div className="text-deck-green">
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                                    <circle cx="12" cy="12" r="8"></circle>
                                                </svg>
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="mt-8">
                            {!sealedTx ? (
                                <button
                                    type="button"
                                    onClick={handleSeal}
                                    disabled={!allPlaced || isSealing}
                                    className={`
                    w-full font-sans font-bold text-lg tracking-wider py-4 transition-all
                    ${allPlaced && !isSealing ? 'bg-brass text-abyss hover:brightness-110' : 'bg-hull text-smoke opacity-50 cursor-not-allowed'}
                  `}
                                >
                                    {isSealing ? (
                                        <span className="flex items-center justify-center gap-2 text-radar font-mono text-sm tracking-widest">
                                            <motion.div
                                                animate={{ opacity: [1, 0.3, 1] }}
                                                transition={{ duration: 1.2, repeat: Infinity }}
                                                className="w-2 h-2 rounded-full bg-radar"
                                            />
                                            {sealStatus || 'SEALING YOUR FLEET...'}
                                        </span>
                                    ) : isBotGame ? 'DEPLOY FLEET →' : 'SEAL FLEET →'}
                                </button>
                            ) : (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex flex-col items-center bg-hull border border-radar/50 p-4"
                                >
                                    <span className="font-mono text-radar text-sm tracking-widest flex items-center gap-2 mb-2">
                                        <motion.div
                                            animate={{ opacity: [1, 0.3, 1] }}
                                            transition={{ duration: 1.2, repeat: Infinity }}
                                            className="w-2 h-2 rounded-full bg-radar"
                                        />
                                        FLEET SEALED
                                    </span>
                                    <a
                                        href={`${EXPLORER_BASE}${sealedTx}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-mono text-haze-gray text-xs hover:text-smoke"
                                    >
                                        TX: {sealedTx.substring(0, 12)}... ↗
                                    </a>
                                    <span className="font-mono text-haze-gray text-xs mt-2">AWAITING OPPONENT...</span>
                                </motion.div>
                            )}
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
}
