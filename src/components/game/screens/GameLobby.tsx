"use client";

import { useState } from 'react';
import { NavBar } from '../../layout/NavBar';
import { motion } from 'motion/react';
import { useGame } from '../GameContext';
import { callStartGame, EXPLORER_BASE } from '../../../utils/stellar';

export function GameLobby() {
    const { wallet, account, setScreen, setGameId, gameId, setGlobalError } = useGame();
    const [createdGameId, setCreatedGameId] = useState<string | null>(null);
    const [joinInput, setJoinInput] = useState('');
    const [isDeploying, setIsDeploying] = useState(false);
    const [deployTx, setDeployTx] = useState<string | null>(null);

    const walletAddress = wallet?.address || '';

    const handleCreateGame = async () => {
        setIsDeploying(true);
        try {
            const result = await callStartGame(walletAddress, walletAddress);
            setCreatedGameId(result.gameId);
            setDeployTx(result.txHash);
            setGameId(result.gameId);
        } catch (err: any) {
            setGlobalError('Failed to deploy game: ' + (err.message || 'Unknown error'));
        } finally {
            setIsDeploying(false);
        }
    };

    const handleJoinSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (joinInput.trim()) {
            setGameId(joinInput.trim());
            setScreen('PLACEMENT');
        }
    };

    const handleEnterLobby = () => {
        if (createdGameId) {
            setGameId(createdGameId);
            setScreen('PLACEMENT');
        }
    };

    return (
        <div className="min-h-screen relative bg-abyss pt-24 pb-12 flex flex-col">
            <NavBar />

            <div className="max-w-6xl mx-auto w-full px-6 flex-1 flex flex-col pt-12">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-24 flex-1">

                    {/* CREATE GAME PANEL */}
                    <div className="flex flex-col">
                        <h2 className="font-display text-brass text-2xl tracking-widest mb-6">CREATE GAME</h2>
                        <div className="bg-hull border-l-2 border-brass p-8 flex-1 flex flex-col">
                            <p className="font-mono text-smoke text-sm mb-8 leading-relaxed">
                                Deploy a new ZK-Battleship match to the Stellar network.<br />
                                Creates a game instance on Game Hub contract:<br />
                                <span className="text-haze-gray text-xs break-all mt-2 block">CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG</span>
                            </p>

                            {!createdGameId ? (
                                <button
                                    onClick={handleCreateGame}
                                    disabled={isDeploying}
                                    className="bg-brass text-abyss font-sans font-bold text-lg tracking-wider py-4 px-8 mt-auto self-start hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-wait"
                                >
                                    {isDeploying ? 'DEPLOYING CONTRACT...' : 'DEPLOY GAME →'}
                                </button>
                            ) : (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mt-auto"
                                >
                                    <p className="font-mono text-haze-gray text-xs mb-2">GAME DEPLOYED. SHARE ID WITH OPPONENT:</p>
                                    <div className="font-mono text-brass text-2xl tracking-widest bg-abyss p-4 border border-ocean-gray mb-4">
                                        {createdGameId}
                                    </div>
                                    <button
                                        onClick={handleEnterLobby}
                                        className="text-smoke hover:text-brass font-mono text-sm underline underline-offset-4"
                                    >
                                        ENTER PLACEMENT →
                                    </button>
                                    {deployTx && (
                                        <a
                                            href={`${EXPLORER_BASE}${deployTx}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block mt-4 font-mono text-xs text-haze-gray hover:text-smoke"
                                        >
                                            View deployment on Stellar Explorer ↗
                                        </a>
                                    )}
                                </motion.div>
                            )}
                        </div>
                    </div>

                    {/* JOIN GAME PANEL */}
                    <div className="flex flex-col">
                        <h2 className="font-display text-haze-gray text-2xl tracking-widest mb-6">JOIN GAME</h2>
                        <div className="bg-hull border-l-2 border-ocean-gray p-8 flex-1 flex flex-col">
                            <p className="font-mono text-smoke text-sm mb-8">
                                Enter an existing Game ID to connect and deploy your fleet.
                            </p>

                            <form onSubmit={handleJoinSubmit} className="mt-auto flex flex-col gap-4">
                                <input
                                    type="text"
                                    placeholder="ENTER GAME ID"
                                    value={joinInput}
                                    onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
                                    className="bg-abyss border border-ocean-gray text-chalk font-mono p-4 tracking-widest focus:outline-none focus:border-brass placeholder:text-haze-gray uppercase"
                                    required
                                />
                                <button
                                    type="submit"
                                    className="bg-hull border border-ocean-gray text-smoke font-sans font-bold text-lg tracking-wider py-4 hover:border-brass hover:text-brass transition-colors"
                                >
                                    JOIN BATTLE →
                                </button>
                            </form>
                        </div>
                    </div>
                </div>

                {/* ACTIVE GAMES LIST MOCK */}
                <div className="mt-16 w-full">
                    <h3 className="font-mono text-haze-gray text-xs mb-4 tracking-widest">ACTIVE PUBLIC MATCHES</h3>
                    <div className="flex flex-col gap-2">
                        {[1, 2].map((i) => (
                            <div key={i} className="bg-hull flex items-center justify-between p-4 group hover:bg-hull/80 transition-colors">
                                <div className="flex gap-8 font-mono text-sm">
                                    <span className="text-brass tracking-wider">GAME-X9{i}KL2</span>
                                    <span className="text-smoke">1/2 PLAYERS</span>
                                    <span className="text-radar">WAITING...</span>
                                </div>
                                <button
                                    onClick={() => { setGameId(`GAME-X9${i}KL2`); setScreen('PLACEMENT'); }}
                                    className="font-sans font-bold text-smoke group-hover:text-brass text-sm tracking-widest"
                                >
                                    JOIN →
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* WALLET BAR */}
            <div className="w-full bg-hull border-t border-ocean-gray p-3 mt-12">
                <div className="max-w-6xl mx-auto flex items-center justify-between font-mono text-[0.65rem] text-haze-gray">
                    <div className="flex gap-4 items-center flex-wrap">
                        <span className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-radar"></div>
                            CONNECTED: {walletAddress.substring(0, 6)}...{walletAddress.substring(walletAddress.length - 4)}
                        </span>
                        <span>·</span>
                        <span>STELLAR TESTNET</span>
                        <span>·</span>
                        <span>XLM BALANCE: {account?.balanceXLM || '—'}</span>
                    </div>
                    <div>PHANTOM_FLEET_v0.1.0</div>
                </div>
            </div>
        </div>
    );
}
