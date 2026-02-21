"use client";

import { motion } from 'motion/react';

export function ProximityRings() {
  return (
    <div className="relative w-[300px] h-[300px] md:w-[400px] md:h-[400px] flex items-center justify-center">
      
      {/* Center Target */}
      <div className="absolute z-10 flex flex-col items-center">
        <div className="w-2 h-2 bg-signal-red rounded-full shadow-[0_0_12px_rgba(192,57,43,0.6)] mb-2"></div>
        <div className="font-mono text-haze-gray text-[0.5rem] tracking-widest">TARGET · C4</div>
      </div>

      {/* Ring 1: 1-2 Cells */}
      <motion.div 
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        className="absolute w-[120px] h-[120px] md:w-[160px] md:h-[160px] rounded-full border border-radar opacity-85 shadow-[0_0_15px_rgba(61,255,110,0.3)] flex items-start justify-center"
      >
        <div className="bg-abyss px-2 -mt-2 font-mono text-radar text-[0.5rem] tracking-widest">1–2 CELLS · VERY HOT</div>
      </motion.div>

      {/* Ring 2: 3-4 Cells */}
      <motion.div 
        animate={{ scale: [1, 1.03, 1] }}
        transition={{ duration: 1.5, repeat: Infinity, delay: 0.3, ease: "easeInOut" }}
        className="absolute w-[200px] h-[200px] md:w-[260px] md:h-[260px] rounded-full border border-radar opacity-40"
      ></motion.div>

      {/* Ring 3: 5-6 Cells */}
      <motion.div 
        animate={{ scale: [1, 1.02, 1] }}
        transition={{ duration: 1.5, repeat: Infinity, delay: 0.6, ease: "easeInOut" }}
        className="absolute w-[280px] h-[280px] md:w-[360px] md:h-[360px] rounded-full border border-radar opacity-15"
      ></motion.div>

      {/* Hidden Ship Silhouette */}
      <motion.div 
        animate={{ opacity: [0, 0.6, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        className="absolute w-12 h-6 border border-brass bg-brass/20"
        style={{ top: '35%', left: '60%', transform: 'rotate(45deg)' }}
      ></motion.div>

      {/* Crosshairs */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
        <div className="w-full h-[1px] bg-radar"></div>
        <div className="h-full w-[1px] bg-radar absolute"></div>
      </div>
    </div>
  );
}