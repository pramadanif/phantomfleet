"use client";

import { motion } from 'motion/react';
import { useGame } from '../GameContext';

export function WalletConnect() {
    const { connectWallet, walletError, isConnecting } = useGame();

    return (
        <div className="min-h-screen flex flex-col items-center justify-center relative bg-abyss">
            <div
                className="absolute inset-0 -z-10 opacity-30 pointer-events-none"
                style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(184,150,46,0.03) 0px, rgba(184,150,46,0.03) 1px, transparent 1px, transparent 80px)' }}
            ></div>

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8 }}
                className="flex flex-col items-center"
            >
                <h1 className="font-display text-brass text-5xl md:text-6xl tracking-widest mb-4 text-center">
                    PHANTOM FLEET
                </h1>

                <p className="font-mono text-haze-gray text-sm md:text-base tracking-wider mb-12">
                    CONNECT YOUR STELLAR WALLET TO BEGIN
                </p>

                <motion.button
                    whileHover={{ scale: 1.02, y: -2, boxShadow: '0 8px 24px rgba(184,150,46,0.3)' }}
                    whileTap={{ scale: 0.98 }}
                    onClick={connectWallet}
                    disabled={isConnecting}
                    className="bg-brass text-abyss font-sans font-bold text-[1.1rem] tracking-wider py-4 px-12 transition-all disabled:opacity-70 disabled:cursor-wait"
                >
                    {isConnecting ? 'CONNECTING...' : 'CONNECT FREIGHTER →'}
                </motion.button>

                {walletError && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="mt-6 font-mono text-[0.8rem] text-signal-red bg-signal-red/10 border border-signal-red/30 px-4 py-2 max-w-md text-center"
                    >
                        {walletError}
                    </motion.div>
                )}

                <div className="mt-16 flex items-center gap-2 border border-ocean-gray px-4 py-1.5 bg-hull/50">
                    <div className="w-2 h-2 rounded-full bg-haze-gray"></div>
                    <span className="font-mono text-[0.65rem] text-haze-gray">STELLAR TESTNET</span>
                </div>
            </motion.div>
        </div>
    );
}
