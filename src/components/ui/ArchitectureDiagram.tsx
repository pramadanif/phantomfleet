"use client";

import { motion } from 'motion/react';

export function ArchitectureDiagram() {
  return (
    <div className="w-full overflow-x-auto pb-8">
      <div className="min-w-[800px] flex justify-between items-start relative pt-8">
        
        {/* Column 1: BROWSER */}
        <div className="w-[220px] flex flex-col gap-8 relative z-10">
          <div className="font-sans font-bold text-brass uppercase tracking-wider border-b border-brass pb-2 mb-4">
            [ BROWSER ]
          </div>
          
          <div className="bg-hull border border-ocean-gray p-4">
            <div className="font-sans font-semibold text-chalk mb-2">Place Ships</div>
            <div className="font-mono text-[0.7rem] text-smoke">Commit Layout</div>
          </div>

          <div className="bg-hull border border-ocean-gray p-4">
            <div className="font-sans font-semibold text-chalk mb-2">Fire Shot</div>
            <div className="font-mono text-[0.7rem] text-smoke">Select Coordinate</div>
          </div>

          <div className="bg-hull border border-ocean-gray p-4 mt-12">
            <div className="font-sans font-semibold text-chalk mb-2">Receive Result</div>
            <div className="font-mono text-[0.7rem] text-smoke">Show Proximity Rings</div>
          </div>
        </div>

        {/* Column 2: CIRCOM + SNARKJS */}
        <div className="w-[220px] flex flex-col gap-8 relative z-10 mt-[120px]">
          <div className="font-sans font-bold text-brass uppercase tracking-wider border-b border-brass pb-2 mb-4">
            [ CIRCOM + SNARKJS ]
          </div>
          
          <div className="bg-hull border border-ocean-gray p-4">
            <div className="font-sans font-semibold text-chalk mb-2">Generate Resolve Proof</div>
            <div className="font-mono text-[0.7rem] text-smoke">(~8 seconds)</div>
            <div className="font-mono text-[0.7rem] text-smoke mt-1">Groth16/BN254</div>
          </div>
        </div>

        {/* Column 3: SOROBAN */}
        <div className="w-[220px] flex flex-col gap-8 relative z-10">
          <div className="font-sans font-bold text-brass uppercase tracking-wider border-b border-brass pb-2 mb-4">
            [ SOROBAN ]
          </div>
          
          <div className="bg-hull border border-ocean-gray p-4">
            <div className="font-sans font-semibold text-chalk mb-2">store(Poseidon hash)</div>
            <div className="font-mono text-[0.7rem] text-smoke">On-chain commitment</div>
          </div>

          <div className="bg-hull border border-ocean-gray p-4 mt-[104px]">
            <div className="font-sans font-semibold text-chalk mb-2">fire_shot() + resolve_shot()</div>
            <div className="font-mono text-[0.7rem] text-smoke">update game state</div>
          </div>

          <div className="bg-hull border border-ocean-gray p-4">
            <div className="font-sans font-semibold text-chalk mb-2">emit(hit/miss/proximity)</div>
            <div className="font-mono text-[0.7rem] text-smoke hover:text-brass transition-colors cursor-pointer">Stellar Explorer ↗</div>
          </div>
        </div>

        {/* Connecting Lines (SVG) */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" style={{ minHeight: '400px' }}>
          <defs>
            <marker id="arrow-radar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#3DFF6E" />
            </marker>
            <marker id="arrow-gray" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#3D4F5C" />
            </marker>
          </defs>

          {/* Commit Layout -> store hash */}
          <path d="M 220 120 L 580 120" stroke="#3D4F5C" strokeWidth="1.5" fill="none" markerEnd="url(#arrow-gray)" />
          
          {/* Fire Shot -> Generate Proof */}
          <motion.path 
            d="M 220 230 L 290 230" 
            stroke="#3DFF6E" 
            strokeWidth="1.5" 
            fill="none" 
            markerEnd="url(#arrow-radar)"
            strokeDasharray="4 4"
            animate={{ strokeDashoffset: [0, -8] }}
            transition={{ duration: 0.5, repeat: Infinity, ease: "linear" }}
          />

          {/* Generate Proof -> bn254 */}
          <motion.path 
            d="M 510 260 L 580 260" 
            stroke="#3DFF6E" 
            strokeWidth="1.5" 
            fill="none" 
            markerEnd="url(#arrow-radar)"
            strokeDasharray="4 4"
            animate={{ strokeDashoffset: [0, -8] }}
            transition={{ duration: 0.5, repeat: Infinity, ease: "linear" }}
          />

          {/* emit -> Receive Result */}
          <path d="M 580 370 L 220 370" stroke="#3D4F5C" strokeWidth="1.5" fill="none" markerEnd="url(#arrow-gray)" />
        </svg>

      </div>
    </div>
  );
}