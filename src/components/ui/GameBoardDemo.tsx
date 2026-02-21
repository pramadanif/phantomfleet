"use client";

import { motion } from 'motion/react';

export function GameBoardDemo() {
  const cols = ['1', '2', '3', '4', '5', '6'];
  const rows = ['A', 'B', 'C', 'D', 'E', 'F'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as any }}
      viewport={{ once: true, margin: "-80px" }}
      className="flex flex-col items-center"
    >
      <div className="relative inline-block">
        {/* Top Labels */}
        <div className="flex ml-6 mb-2">
          {cols.map(c => (
            <div key={c} className="w-[38px] md:w-[52px] text-center font-mono text-haze-gray text-[0.65rem]">{c}</div>
          ))}
        </div>

        <div className="flex">
          {/* Left Labels */}
          <div className="flex flex-col mr-2 mt-[1px]">
            {rows.map(r => (
              <div key={r} className="h-[38px] md:h-[52px] flex items-center justify-end font-mono text-haze-gray text-[0.65rem] pr-2">{r}</div>
            ))}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-6 gap-[1px] bg-ocean-gray border border-ocean-gray p-[1px]">
            {rows.map((r, rIdx) =>
              cols.map((c, cIdx) => {
                const cellId = `${r}${c}`;
                let cellContent = null;
                let cellClass = "bg-hull w-[38px] h-[38px] md:w-[52px] md:h-[52px] flex items-center justify-center relative";

                if (['A2', 'B5', 'E1'].includes(cellId)) {
                  // MISS
                  cellContent = <div className="w-3 h-3 rounded-full bg-haze-gray shadow-[0_0_8px_rgba(74,107,124,0.6)]"></div>;
                } else if (cellId === 'D3') {
                  // HIT
                  cellClass += " bg-signal-red shadow-[inset_0_0_12px_rgba(192,57,43,0.8)]";
                  cellContent = <div className="text-abyss font-sans font-bold text-xl leading-none">✕</div>;
                } else if (cellId === 'C4') {
                  // PROOF GENERATING
                  cellContent = (
                    <>
                      <motion.div
                        animate={{
                          boxShadow: [
                            'inset 0 0 0 1px rgba(61,255,110,0.4)',
                            'inset 0 0 0 2px rgba(61,255,110,1)',
                            'inset 0 0 0 1px rgba(61,255,110,0.4)'
                          ]
                        }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        className="absolute inset-0 shadow-[0_0_12px_rgba(61,255,110,0.5)]"
                      ></motion.div>
                      <span className="text-radar font-mono text-xs animate-pulse">...</span>
                    </>
                  );
                }

                return (
                  <div key={cellId} className={cellClass}>
                    {cellContent}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Status Terminal */}
      <div className="mt-6 font-mono text-[0.7rem] text-radar flex items-center gap-2 bg-hull/50 px-4 py-2 border border-radar/20">
        <span>▶ SHOT FIRED: C4 · GENERATING ZK PROOF ·</span>
        <div className="flex items-center">
          <span className="tracking-widest">████████</span>
          <motion.span
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1, repeat: Infinity }}
            className="tracking-widest opacity-50"
          >░░</motion.span>
        </div>
        <span>78%</span>
      </div>
    </motion.div>
  );
}