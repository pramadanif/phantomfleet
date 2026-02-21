"use client";

import { motion } from 'motion/react';

export function StatsBar() {
  const stats = [
    { value: '~8 SECONDS', label1: 'PROOF TIME', label2: 'IN-BROWSER' },
    { value: '<100ms', label1: 'VERIFICATION', label2: 'BN254 ON-CHAIN' },
    { value: '~850', label1: 'CIRCUIT SIZE', label2: 'CONSTRAINTS' },
    { value: 'STELLAR', label1: 'BLOCKCHAIN', label2: 'PROTOCOL 25' },
  ];

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as any } }
  };

  return (
    <div className="w-full bg-hull border-y border-brass/30">
      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-ocean-gray"
      >
        {stats.map((stat, i) => (
          <motion.div key={i} variants={item} className="p-8 flex flex-col items-center text-center">
            <div className="font-display text-brass text-2xl md:text-3xl mb-3">{stat.value}</div>
            <div className="font-sans font-semibold text-chalk text-[0.85rem] uppercase mb-1">{stat.label1}</div>
            <div className="font-mono text-haze-gray text-[0.65rem]">{stat.label2}</div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}