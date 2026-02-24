"use client";

import { motion } from 'motion/react';
import React from 'react';

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.1 }
  }
};

const cardVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 100 } }
};

// ----------------------------------------------------------------------
// Reusable Components
// ----------------------------------------------------------------------

function GlowCard({ title, badge, children, highlight = false, icon, onClick }: any) {
  return (
    <motion.div
      variants={cardVariants}
      whileHover={{ y: -4, scale: 1.02 }}
      onClick={onClick}
      className={`relative group rounded-xl bg-hull/60 backdrop-blur-md border p-5 shadow-lg transition-all duration-300 z-10 ${highlight
        ? 'border-radar/40 hover:border-radar/70 hover:shadow-[0_4px_30px_rgba(61,255,110,0.15)]'
        : 'border-ocean-gray/30 hover:border-brass/40 hover:shadow-[0_4px_30px_rgba(212,175,55,0.1)]'
        } ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className={`absolute top-0 left-0 w-full h-[2px] rounded-t-xl opacity-70 bg-gradient-to-r ${highlight ? 'from-transparent via-radar to-transparent' : 'from-transparent via-brass to-transparent'
        }`} />

      <div
        className={`absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10 blur-xl ${highlight ? 'bg-radar/5' : 'bg-brass/5'
          }`}
      />

      <div className="flex justify-between items-start mb-3 gap-2">
        <div className="flex items-center gap-2">
          {icon && <span className="text-lg opacity-80 group-hover:opacity-100 transition-opacity grayscale group-hover:grayscale-0">{icon}</span>}
          <h3 className="font-sans font-bold text-chalk text-[0.85rem] uppercase tracking-wide leading-tight">
            {title}
          </h3>
        </div>
        {badge && (
          <span className={`flex-shrink-0 text-[0.6rem] font-mono px-2 py-0.5 rounded-full border whitespace-nowrap ${highlight ? 'text-radar border-radar/30 bg-radar/10' : 'text-brass border-brass/30 bg-brass/10'
            }`}>
            {badge}
          </span>
        )}
      </div>
      <div className="text-[0.7rem] font-mono text-smoke leading-relaxed">
        {children}
      </div>
    </motion.div>
  );
}

function FlexArrow({ direction = 'right', colorClass = 'text-ocean-gray', animated = false, glow = false }: any) {
  const isRight = direction === 'right';

  return (
    <div className={`w-full flex items-center px-1 opacity-80 ${colorClass} ${glow ? 'drop-shadow-[0_0_6px_currentColor]' : ''} z-0`}>
      {!isRight && (
        <svg width="8" height="12" className="flex-shrink-0">
          <polygon points="8,0 0,6 8,12" fill="currentColor" />
        </svg>
      )}

      <div className="flex-1 h-[2px] overflow-hidden mx-1 relative">
        <svg width="100%" height="2" className="block absolute inset-0">
          <path d="M 0 1 L 4000 1" stroke="currentColor" strokeWidth="2"
            strokeDasharray={animated ? "6 6" : "none"}
            fill="none"
          />
          {animated && (
            <motion.path
              d="M 0 1 L 4000 1"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="6 6"
              fill="none"
              animate={{ strokeDashoffset: isRight ? [0, -48] : [0, 48] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            />
          )}
        </svg>
      </div>

      {isRight && (
        <svg width="8" height="12" className="flex-shrink-0">
          <polygon points="0,0 8,6 0,12" fill="currentColor" />
        </svg>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// Main Export Layout
// ----------------------------------------------------------------------

export function ArchitectureDiagram() {
  return (
    <motion.div
      className="w-full relative"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      {/* ================= DESKTOP / TABLET GRID LAYOUT ================= */}
      <div className="hidden lg:grid grid-cols-[1fr_60px_1fr_60px_1fr] xl:grid-cols-[1fr_80px_1fr_80px_1fr] gap-y-12 items-center mx-auto w-full max-w-6xl pb-10">

        {/* === HEADERS === */}
        <div className="col-start-1 text-center font-sans font-bold text-brass uppercase tracking-[0.2em] text-[0.65rem] border-b border-brass/20 pb-4 shadow-[0_10px_10px_-10px_rgba(212,175,55,0.1)]">
          [ 🌐 Browser Client ]
        </div>
        <div className="col-start-3 text-center font-sans font-bold text-radar uppercase tracking-[0.2em] text-[0.65rem] border-b border-radar/20 pb-4 shadow-[0_10px_10px_-10px_rgba(61,255,110,0.1)]">
          [ ⚡ ZK Prover System ]
        </div>
        <div className="col-start-5 text-center font-sans font-bold text-brass uppercase tracking-[0.2em] text-[0.65rem] border-b border-brass/20 pb-4 shadow-[0_10px_10px_-10px_rgba(212,175,55,0.1)]">
          [ ⛓️ Soroban (Stellar) ]
        </div>

        {/* === ROW 1: PREPARATORY === */}
        <div className="col-start-1 col-end-2">
          <GlowCard title="Place Ships" badge="Commit Layout" icon="⚓">
            Fleet sealed in Merkle Tree<br />
            <span className="text-chalk/40 text-[0.65rem] mt-2 block">Private layout + Random nonce</span>
          </GlowCard>
        </div>

        <div className="col-start-2 col-end-5 w-full flex">
          <FlexArrow direction="right" colorClass="text-ocean-gray" />
        </div>

        <div className="col-start-5 col-end-6">
          <GlowCard title="Store Hash" badge="commit_layout()" icon="🔒">
            Poseidon Hash anchored on-chain<br />
            <span className="text-chalk/40 text-[0.65rem] mt-2 block">Locks layout immutably on Ledger</span>
          </GlowCard>
        </div>

        {/* === ROW 2: ACTION (FIRE) === */}
        <div className="col-start-1 col-end-2">
          <GlowCard title="Fire Shot" badge="Target (X, Y)" icon="🎯">
            Select enemy coordinate<br />
            <span className="text-chalk/40 text-[0.65rem] mt-2 block">Initiate turn resolution state</span>
          </GlowCard>
        </div>

        <div className="col-start-2 col-end-3">
          <FlexArrow direction="right" colorClass="text-radar" animated glow />
        </div>

        <div className="col-start-3 col-end-4 relative">
          <div className="absolute inset-0 bg-radar/5 blur-3xl -z-20 rounded-full" />
          <GlowCard title="Compute ZK Proof" badge="~8 seconds" icon="⚡" highlight>
            Circom + snarkjs Groth16/BN254<br />
            <span className="text-chalk/40 text-[0.65rem] mt-2 block">Prove hit/miss, hide ship positions</span>
          </GlowCard>
        </div>

        <div className="col-start-4 col-end-5">
          <FlexArrow direction="right" colorClass="text-radar" animated glow />
        </div>

        <div className="col-start-5 col-end-6">
          <GlowCard title="Verify & Update" badge="submit_shot()" icon="⚖️">
            Protocol 25 Native Precompile<br />
            <span className="text-chalk/40 text-[0.65rem] mt-2 block font-semibold text-brass/70">bn254_pairing_check()</span>
          </GlowCard>
        </div>

        {/* === ROW 3: RESOLUTION === */}
        <div className="col-start-1 col-end-2">
          <GlowCard title="Render Result" badge="Display UI" icon="👁️">
            Reveal Proximity Rings (Hot/Cold)<br />
            <span className="text-chalk/40 text-[0.65rem] mt-2 block">Visual strategic intelligence update</span>
          </GlowCard>
        </div>

        <div className="col-start-2 col-end-5 w-full flex">
          <FlexArrow direction="left" colorClass="text-ocean-gray" animated />
        </div>

        <div className="col-start-5 col-end-6">
          <GlowCard title="Events & Logs" badge="emit(...)" icon="📡">
            Emit authenticated shot event<br />
            <span className="text-ocean-gray hover:text-brass transition-colors cursor-pointer text-[0.65rem] mt-2 block underline underline-offset-2">View Transaction Hash ↗</span>
          </GlowCard>
        </div>
      </div>

      {/* ================= MOBILE / SMALL SCREEN LAYOUT ================= */}
      <div className="flex lg:hidden flex-col relative w-full px-2 py-4 space-y-8">

        {/* Track Line */}
        <div className="absolute left-[38px] top-[40px] bottom-[40px] w-[2px] bg-gradient-to-b from-ocean-gray/30 via-radar/40 to-ocean-gray/30 z-0" />

        {/* Phase 1 Setup */}
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-3">
            <div className="w-8 h-8 rounded-full bg-hull border border-ocean-gray/50 shadow-[0_0_15px_rgba(61,79,92,0.5)] flex items-center justify-center font-mono text-[0.6rem] text-ocean-gray z-10 shrink-0">01</div>
            <div className="font-sans font-bold text-brass uppercase tracking-widest text-[0.6rem]">Preparatory Phase</div>
          </div>
          <div className="ml-12 grid grid-cols-1 md:grid-cols-2 gap-4">
            <GlowCard title="Place Ships" badge="Browser" icon="⚓">Merkle tree sealed</GlowCard>
            <GlowCard title="Store Hash" badge="Soroban" icon="🔒">commit_layout()</GlowCard>
          </div>
        </div>

        {/* Phase 2 Action */}
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-3">
            <div className="w-8 h-8 rounded-full bg-hull border border-radar/50 shadow-[0_0_15px_rgba(61,255,110,0.3)] flex items-center justify-center font-mono text-[0.6rem] text-radar z-10 shrink-0">02</div>
            <div className="font-sans font-bold text-radar uppercase tracking-widest text-[0.6rem]">Active Dispute</div>
          </div>
          <div className="ml-12 flex flex-col gap-4">
            <GlowCard title="Compute Proof" badge="Circom" icon="⚡" highlight>Groth16 / BN254 Generation (~8s)</GlowCard>
            <GlowCard title="Verify & Update" badge="Soroban" icon="⚖️">BN254 Pairing check via Protocol 25</GlowCard>
          </div>
        </div>

        {/* Phase 3 Result */}
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-3">
            <div className="w-8 h-8 rounded-full bg-hull border border-ocean-gray/50 shadow-[0_0_15px_rgba(61,79,92,0.5)] flex items-center justify-center font-mono text-[0.6rem] text-ocean-gray z-10 shrink-0">03</div>
            <div className="font-sans font-bold text-brass uppercase tracking-widest text-[0.6rem]">Resolution State</div>
          </div>
          <div className="ml-12">
            <GlowCard title="Render Result" badge="Browser" icon="👁️">Display proximity rings from verified parameters</GlowCard>
          </div>
        </div>
      </div>

    </motion.div>
  );
}