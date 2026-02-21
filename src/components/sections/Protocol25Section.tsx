"use client";

import { motion } from 'motion/react';
import { BeforeAfterPanel } from '../ui/BeforeAfterPanel';

export function Protocol25Section() {
  return (
    <section id="protocol" className="py-24">
      <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as any }}
          viewport={{ once: true, margin: "-80px" }}
        >
          <div className="font-mono text-[0.7rem] text-brass tracking-[0.3em] uppercase mb-6">
            03 · WHY THIS ONLY EXISTS NOW
          </div>
          <h2 className="font-display text-[2.5rem] text-chalk leading-[1.1] mb-8">
            BEFORE PROTOCOL 25,<br />
            THIS WAS IMPOSSIBLE.
          </h2>
          <div className="font-sans text-smoke text-[1rem] leading-[1.7] space-y-6">
            <p>
              Verifying a Groth16 ZK proof requires BN254 pairing arithmetic —
              a mathematically intensive operation. Before Protocol 25, this meant
              emulating elliptic curve operations inside WASM on Soroban.
              The computational cost was prohibitive for a real game with
              multiple moves per session.
            </p>
            <p>
              Protocol 25 changes the category. BN254 pairing is now a native
              host function — a single call with constant, predictable cost.
              Phantom Fleet does not use Protocol 25 as a convenience.
              It cannot exist without it.
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 32 }}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.25, 0.46, 0.45, 0.94] as any }}
          viewport={{ once: true, margin: "-80px" }}
        >
          <BeforeAfterPanel />
        </motion.div>

      </div>
    </section>
  );
}