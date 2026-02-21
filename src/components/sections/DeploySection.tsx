"use client";

import { motion } from 'motion/react';
import { Copy } from 'lucide-react';

export function DeploySection() {
  return (
    <section id="deploy" className="py-32 relative overflow-hidden flex flex-col items-center justify-center min-h-[80vh]">
      {/* Watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none -z-10 overflow-hidden">
        <div className="font-display text-[20vw] text-hull opacity-40 -rotate-12 select-none whitespace-nowrap">
          CLASSIFIED
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 32 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as any }}
        viewport={{ once: true, margin: "-80px" }}
        className="max-w-3xl mx-auto px-6 flex flex-col items-center text-center z-10"
      >
        <div className="font-mono text-[0.65rem] text-haze-gray tracking-[0.35em] mb-8">
          TESTNET LIVE · NO INSTALL REQUIRED · STELLAR WALLET ONLY
        </div>

        <h2 className="font-display text-[clamp(2.5rem,5vw,4.5rem)] text-chalk mb-6">
          READY TO SAIL?
        </h2>

        <p className="font-sans font-medium text-[1.1rem] text-smoke max-w-[440px] mb-12">
          Your opponent won't know where you are.
          The blockchain will know everything is fair.
        </p>

        <motion.button
          whileHover={{ scale: 0.97, y: -3, boxShadow: '0 12px 32px rgba(184,150,46,0.35)', filter: 'brightness(1.12)' }}
          whileTap={{ scale: 0.95 }}
          className="bg-brass text-abyss font-sans font-bold text-[1.1rem] tracking-wider py-5 px-12 mb-12 transition-all"
        >
          LAUNCH PHANTOM FLEET →
        </motion.button>

        <div className="flex flex-wrap justify-center gap-8 font-mono text-[0.7rem] text-haze-gray mb-16">
          <a href="#" className="hover:text-brass transition-colors">View Contracts on Stellar Testnet ↗</a>
          <a href="#" className="hover:text-brass transition-colors">GitHub →</a>
          <a href="#" className="hover:text-brass transition-colors">Docs →</a>
        </div>

        <div className="bg-hull border border-brass p-4 font-mono text-[0.7rem] text-chalk flex flex-col items-start relative group">
          <div className="text-brass mb-2">CONTRACT · STELLAR TESTNET</div>
          <div className="flex items-center gap-4">
            <span>CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX</span>
            <button className="text-haze-gray hover:text-brass transition-colors">
              <Copy size={14} />
            </button>
          </div>
        </div>

      </motion.div>
    </section>
  );
}