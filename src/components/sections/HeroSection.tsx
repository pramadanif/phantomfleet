"use client";

import { motion } from 'motion/react';
import Link from 'next/link';

const CONTRACT_EXPLORER = 'https://stellar.expert/explorer/testnet/contract/CAN3TAI7W6ASCRCVBRIZFC6YXGZ36PPWWFXDDJS35RJ4JSRZEZT2TWRJ';

const ShipBlueprint = ({ className, animate, transition }: { className: string, animate: any, transition: any }) => (
  <motion.div 
    className={`absolute pointer-events-none ${className}`} 
    animate={animate} 
    transition={transition}
  >
    <svg viewBox="-50 -50 300 900" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <g stroke="currentColor" strokeWidth="2">
        {/* Outer Hull */}
        <path d="M100 20 L140 120 L170 400 L150 750 L100 780 L50 750 L30 400 L60 120 Z" />
        {/* Inner Hull / Deck */}
        <path d="M100 50 L125 130 L150 400 L135 730 L100 750 L65 730 L50 400 L75 130 Z" strokeDasharray="4 4" opacity="0.6"/>
        
        {/* Center Line */}
        <line x1="100" y1="20" x2="100" y2="780" strokeDasharray="2 8" opacity="0.4" />

        {/* Forward Turret 1 */}
        <circle cx="100" cy="180" r="16" />
        <line x1="94" y1="180" x2="94" y2="100" />
        <line x1="106" y1="180" x2="106" y2="100" />
        
        {/* Forward Turret 2 */}
        <circle cx="100" cy="240" r="18" />
        <line x1="92" y1="240" x2="92" y2="140" />
        <line x1="100" y1="240" x2="100" y2="140" />
        <line x1="108" y1="240" x2="108" y2="140" />

        {/* Bridge / Superstructure */}
        <path d="M70 300 L130 300 L140 450 L60 450 Z" />
        <rect x="80" y="320" width="40" height="40" />
        <circle cx="100" cy="340" r="10" />
        <path d="M60 380 L140 380 M60 400 L140 400" opacity="0.5" />
        
        {/* Midship Details (Funnels/Vents) */}
        <rect x="85" y="470" width="30" height="50" rx="15" />
        <rect x="85" y="540" width="30" height="50" rx="15" />

        {/* Aft Turret */}
        <circle cx="100" cy="650" r="18" />
        <line x1="92" y1="650" x2="92" y2="740" />
        <line x1="100" y1="650" x2="100" y2="740" />
        <line x1="108" y1="650" x2="108" y2="740" />

        {/* Technical Markings / Crosshairs */}
        <circle cx="100" cy="400" r="250" strokeDasharray="1 10" opacity="0.3" />
        <line x1="-50" y1="400" x2="250" y2="400" strokeDasharray="2 4" opacity="0.3" />
        
        {/* Measurement lines */}
        <line x1="10" y1="20" x2="25" y2="20" />
        <line x1="10" y1="780" x2="25" y2="780" />
        <line x1="17" y1="20" x2="17" y2="780" opacity="0.5" />
        <text x="-5" y="400" fill="currentColor" fontSize="16" fontFamily="monospace" transform="rotate(-90 -5 400)" opacity="0.6" letterSpacing="4">CLASS-V DREADNOUGHT</text>

        {/* Targeting Brackets */}
        <path d="M -20 20 L -20 -20 L 20 -20" stroke="currentColor" strokeWidth="2" opacity="0.5" fill="none"/>
        <path d="M 220 -20 L 220 20" stroke="currentColor" strokeWidth="2" opacity="0.5" fill="none"/>
        <path d="M 180 -20 L 220 -20" stroke="currentColor" strokeWidth="2" opacity="0.5" fill="none"/>
        <path d="M -20 780 L -20 820 L 20 820" stroke="currentColor" strokeWidth="2" opacity="0.5" fill="none"/>
        <path d="M 220 780 L 220 820 L 180 820" stroke="currentColor" strokeWidth="2" opacity="0.5" fill="none"/>
      </g>
    </svg>
  </motion.div>
);

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden pt-20">
      {/* Background Layers */}
      <div className="absolute inset-0 bg-abyss -z-30"></div>
      <div 
        className="absolute inset-0 -z-30"
        style={{ background: 'radial-gradient(ellipse 90% 70% at 50% 65%, rgba(74,107,124,0.15), transparent 70%)' }}
      ></div>
      <div 
        className="absolute inset-0 -z-20 opacity-30"
        style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(184,150,46,0.03) 0px, rgba(184,150,46,0.03) 1px, transparent 1px, transparent 80px)' }}
      ></div>
      
      {/* Blueprint Ships */}
      <ShipBlueprint 
        className="right-[-35%] md:right-[-5%] top-[5%] w-[450px] md:w-[650px] text-brass opacity-20 z-0"
        animate={{ y: [0, -40, 0], rotate: [15, 15, 15] }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      />
      <ShipBlueprint 
        className="left-[-40%] md:left-[-10%] bottom-[-10%] w-[350px] md:w-[500px] text-ocean-gray opacity-30 z-0"
        animate={{ y: [0, 30, 0], rotate: [-25, -25, -25] }}
        transition={{ duration: 25, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      />

      <div 
        className="absolute bottom-0 left-0 right-0 h-[40%] -z-10"
        style={{ background: 'linear-gradient(to top, #0D1519 0%, transparent 100%)' }}
      ></div>

      <div className="max-w-[780px] w-full px-6 flex flex-col items-center text-center z-10">
        
        {/* Status Pill */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.6 }}
          className="flex items-center gap-3 font-mono text-[0.65rem] text-brass tracking-[0.4em] mb-8"
        >
          <motion.div 
            animate={{ 
              boxShadow: [
                '0 0 0 0 rgba(61,255,110,0.4)',
                '0 0 0 8px rgba(61,255,110,0)',
                '0 0 0 0 rgba(61,255,110,0)'
              ]
            }}
            transition={{ duration: 1.8, repeat: Infinity }}
            className="w-2 h-2 rounded-full bg-radar"
          ></motion.div>
          STELLAR TESTNET LIVE · PROTOCOL 25 · GROTH16 VERIFIED
        </motion.div>

        {/* H1 */}
        <motion.h1 
          className="font-display text-chalk text-[clamp(2.5rem,8vw,6.5rem)] md:text-[clamp(3.2rem,7vw,6.5rem)] leading-[0.95] tracking-[0.02em] mb-8"
        >
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.6 }}>YOUR FLEET IS REAL.</motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.23, duration: 0.6 }}>YOUR POSITION IS</motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.31, duration: 0.6 }} className="text-brass">CLASSIFIED.</motion.div>
        </motion.h1>

        {/* Subheadline */}
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="font-sans font-medium text-[1.15rem] text-smoke max-w-[500px] mb-12"
        >
          No server. No referee. No trust required.<br/>
          Every resolved shot is a cryptographic proof, verified on Stellar.
        </motion.p>

        {/* CTAs */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.6 }}
          className="flex flex-col sm:flex-row gap-4 mb-16 w-full sm:w-auto"
        >
          <motion.div 
            whileHover={{ scale: 1.02, y: -2, boxShadow: '0 8px 24px rgba(184,150,46,0.3)', filter: 'brightness(1.1)' }}
            whileTap={{ scale: 0.98 }}
            className="transition-colors"
          >
            <Link href="/game" className="block bg-brass text-abyss font-sans font-bold text-[1rem] tracking-wider py-4 px-10">
              LAUNCH BATTLE →
            </Link>
          </motion.div>
          <motion.div 
            whileHover={{ borderColor: '#B8962E', color: '#B8962E' }}
            className="transition-colors"
          >
            <a href={CONTRACT_EXPLORER} target="_blank" rel="noopener noreferrer" className="block bg-transparent border border-ocean-gray text-smoke font-sans font-bold text-[1rem] tracking-wider py-4 px-10">
              VIEW ON STELLAR ↗
            </a>
          </motion.div>
        </motion.div>

        {/* Proof Ticker */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 0.6 }}
          className="font-mono text-[0.65rem] text-haze-gray flex items-center"
        >
          LAST PROOF VERIFIED · 3 SECONDS AGO · BLOCK #4821047 · 256 BYTES · GROTH16
          <motion.span 
            animate={{ opacity: [1, 0, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
            className="ml-2 inline-block w-1 h-3 bg-haze-gray"
          ></motion.span>
        </motion.div>

      </div>

      {/* Decorative Bottom Rule */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-brass/25"></div>
    </section>
  );
}