"use client";

import { useGame } from './GameContext';
import { GameProvider } from './GameContext';
import { WalletConnect } from './screens/WalletConnect';
import { GameLobby } from './screens/GameLobby';
import { ShipPlacement } from './screens/ShipPlacement';
import { BattleScreen } from './screens/BattleScreen';
import { GameOver } from './screens/GameOver';
import { GrainOverlay } from '../effects/GrainOverlay';
import { ScanlineOverlay } from '../effects/ScanlineOverlay';
import { motion, AnimatePresence } from 'motion/react';

function GameRouter() {
    const { screen, globalError, setGlobalError } = useGame();

    return (
        <div className="w-full min-h-screen relative">
            <GrainOverlay />
            <ScanlineOverlay />

            {/* Global Error Banner */}
            <AnimatePresence>
                {globalError && (
                    <motion.div
                        initial={{ y: -60, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -60, opacity: 0 }}
                        className="fixed top-0 left-0 right-0 z-[100] bg-signal-red/20 border-b border-signal-red/50 px-6 py-3 flex items-center justify-between"
                    >
                        <span className="font-mono text-signal-red text-sm">{globalError}</span>
                        <button onClick={() => setGlobalError(null)} className="font-mono text-signal-red text-sm flex items-center gap-1 hover:text-chalk">
                            DISMISS
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {screen === 'CONNECTING' && <WalletConnect />}
            {screen === 'LOBBY' && <GameLobby />}
            {screen === 'PLACEMENT' && <ShipPlacement />}
            {screen === 'BATTLE' && <BattleScreen />}
            {screen === 'GAME_OVER' && <GameOver />}
        </div>
    );
}

export function GameMachine() {
    return (
        <GameProvider>
            <GameRouter />
        </GameProvider>
    );
}
