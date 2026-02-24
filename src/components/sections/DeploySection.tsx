"use client";

import { motion } from 'motion/react';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';

const PHANTOM_FLEET_CONTRACT = 'CAN3TAI7W6ASCRCVBRIZFC6YXGZ36PPWWFXDDJS35RJ4JSRZEZT2TWRJ';
const CONTRACT_EXPLORER_URL = `https://stellar.expert/explorer/testnet/contract/${PHANTOM_FLEET_CONTRACT}`;

export function DeploySection() {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(PHANTOM_FLEET_CONTRACT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="deploy" className="py-32 relative overflow-hidden flex flex-col items-center justify-center min-h-[80vh] bg-gradient-to-b from-abyss via-abyss to-hull/10">
      {/* Watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none -z-10 overflow-hidden">
        <div className="font-display text-[15vw] md:text-[20vw] text-hull opacity-30 md:opacity-40 -rotate-12 select-none whitespace-nowrap">
          CLASSIFIED
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 32 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as any }}
        viewport={{ once: true, margin: "-80px" }}
        className="max-w-3xl w-full mx-auto px-6 flex flex-col items-center text-center z-10"
      >
        <div className="font-mono text-[0.65rem] text-haze-gray tracking-[0.35em] mb-8">
          TESTNET LIVE · NO INSTALL REQUIRED · STELLAR WALLET ONLY
        </div>

        <h2 className="font-display text-[clamp(2.5rem,5vw,4.5rem)] text-chalk mb-6">
          READY TO SAIL?
        </h2>

        <p className="font-sans font-medium text-[1.1rem] text-smoke max-w-[500px] mb-12 leading-relaxed">
          Your opponent won't know where you are.<br className="hidden sm:block" />
          The blockchain will know everything is fair.
        </p>

        <motion.a
          href="/game"
          whileHover={{ scale: 1.02, y: -3, boxShadow: '0 12px 32px rgba(184,150,46,0.35)', filter: 'brightness(1.12)' }}
          whileTap={{ scale: 0.98 }}
          className="bg-brass text-abyss font-sans font-bold text-[1rem] md:text-[1.1rem] tracking-wider py-4 md:py-5 px-8 md:px-12 mb-12 transition-all cursor-pointer"
        >
          LAUNCH PHANTOM FLEET →
        </motion.a>

        <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-6 sm:gap-8 font-mono text-[0.65rem] md:text-[0.7rem] text-haze-gray mb-16">
          <a href={CONTRACT_EXPLORER_URL} target="_blank" rel="noopener noreferrer" className="hover:text-brass transition-colors">
            View on Stellar Testnet ↗
          </a>
          <a href="https://github.com/pramadanif/phantomfleet" target="_blank" rel="noopener noreferrer" className="hover:text-brass transition-colors">
            GitHub →
          </a>
          <a href="#" className="hover:text-brass transition-colors">
            Documentation →
          </a>
        </div>

        <div className="w-full max-w-[600px] bg-hull/50 border border-brass/50 p-6 font-mono text-[0.65rem] md:text-[0.7rem] text-chalk rounded-lg backdrop-blur-sm">
          <div className="text-brass mb-3 font-semibold tracking-wider">[ PHANTOM FLEET CONTRACT ]</div>
          <div className="text-haze-gray mb-2 text-[0.6rem] md:text-[0.65rem]">STELLAR TESTNET</div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-abyss/50 p-3 rounded border border-brass/20">
            <code className="flex-1 break-all text-brass font-mono text-[0.65rem] md:text-[0.7rem] leading-relaxed">
              {PHANTOM_FLEET_CONTRACT}
            </code>
            <motion.button
              onClick={handleCopy}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              className="flex-shrink-0 text-haze-gray hover:text-brass transition-colors p-1"
              title="Copy to clipboard"
            >
              {copied ? <Check size={16} className="text-radar" /> : <Copy size={16} />}
            </motion.button>
          </div>
        </div>

      </motion.div>
    </section>
  );
}