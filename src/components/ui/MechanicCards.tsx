"use client";

import { motion } from 'motion/react';

export function MechanicCards() {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const item = {
    hidden: { opacity: 0, x: 32 },
    show: { opacity: 1, x: 0, transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as any } }
  };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      className="flex flex-col gap-6"
    >
      {/* Card 1 */}
      <motion.div variants={item} className="bg-hull border-l-[3px] border-brass p-6">
        <div className="flex items-center gap-4 mb-3">
          <span className="font-mono text-brass text-[0.8rem]">[01]</span>
          <div className="h-[1px] flex-grow bg-brass/30"></div>
        </div>
        <h3 className="font-sans font-bold text-chalk text-[1.1rem] uppercase tracking-wider mb-2">FIRE</h3>
        <p className="font-sans text-smoke text-[0.95rem] leading-[1.6]">
          Select a coordinate. Your shot is registered privately. Your opponent knows only that you fired — nothing more.
        </p>
      </motion.div>

      {/* Card 2 */}
      <motion.div variants={item} className="bg-hull border-l-[3px] border-brass p-6">
        <div className="flex items-center gap-4 mb-3">
          <span className="font-mono text-brass text-[0.8rem]">[02]</span>
          <div className="h-[1px] flex-grow bg-brass/30"></div>
        </div>
        <h3 className="font-sans font-bold text-chalk text-[1.1rem] uppercase tracking-wider mb-2">PROVE</h3>
        <p className="font-sans text-smoke text-[0.95rem] leading-[1.6]">
          A Noir circuit generates a ZK proof in your browser. Hit or miss — plus a proximity range. Never the exact position.
        </p>
      </motion.div>

      {/* Card 3 */}
      <motion.div variants={item} className="bg-hull border-l-[3px] border-brass p-6 relative">
        <div className="flex items-center gap-4 mb-3">
          <span className="font-mono text-brass text-[0.8rem]">[03]</span>
          <div className="h-[1px] flex-grow bg-brass/30"></div>
        </div>
        <h3 className="font-sans font-bold text-chalk text-[1.1rem] uppercase tracking-wider mb-2 flex items-center gap-3">
          VERIFY
          <span className="flex items-center gap-1.5 text-radar text-[0.7rem] font-mono tracking-normal">
            <motion.span
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="w-1.5 h-1.5 rounded-full bg-radar inline-block"
            ></motion.span>
            LIVE
          </span>
        </h3>
        <p className="font-sans text-smoke text-[0.95rem] leading-[1.6]">
          Stellar's BN254 precompile verifies the proof on-chain in &lt;100ms. No oracle. No server. Mathematical certainty.
        </p>
      </motion.div>
    </motion.div>
  );
}