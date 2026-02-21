"use client";

import { motion } from 'motion/react';
import { ProximityRings } from '../ui/ProximityRings';

export function ProximitySection() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-hull -z-20"></div>
      <div
        className="absolute inset-0 -z-10"
        style={{ background: 'radial-gradient(circle 500px at 50% 50%, rgba(61,255,110,0.07), transparent 70%)' }}
      ></div>

      <motion.div
        initial={{ opacity: 0, y: 32 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as any }}
        viewport={{ once: true, margin: "-80px" }}
        className="max-w-[800px] mx-auto px-6 flex flex-col items-center text-center"
      >
        <ProximityRings />

        <div className="mt-16 mb-12">
          <p className="font-display text-[1.6rem] text-chalk leading-relaxed">
            "You fired at C4.<br />
            You missed.<br />
            The nearest hull is <span className="text-brass">1–2 cells away</span>.<br />
            Cryptographically proven.<br />
            <span className="text-haze-gray tracking-widest italic">Coordinate: unknown.</span>"
          </p>
        </div>

        <div className="font-mono text-[0.65rem] text-haze-gray mb-8 border border-haze-gray/20 px-4 py-2 bg-abyss/30">
          proof · groth16 · 256 bytes · verified · block #4821048 · stellar testnet ↗
        </div>

        <div className="font-sans font-bold text-radar text-[0.8rem] tracking-[0.4em] uppercase">
          THIS IS NOT A HINT. THIS IS A PROOF.
        </div>
      </motion.div>
    </section>
  );
}