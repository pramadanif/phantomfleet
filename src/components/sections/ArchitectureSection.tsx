"use client";

import { SectionDivider } from '../layout/SectionDivider';
import { ArchitectureDiagram } from '../ui/ArchitectureDiagram';
import { motion } from 'motion/react';

export function ArchitectureSection() {
  return (
    <section className="py-24 relative">
      <div
        className="absolute inset-0 -z-10 opacity-10"
        style={{ backgroundImage: 'linear-gradient(rgba(184,150,46,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(184,150,46,0.2) 1px, transparent 1px)', backgroundSize: '40px 40px' }}
      ></div>

      <SectionDivider label="04 · CLASSIFIED SCHEMATICS" />

      <motion.div
        initial={{ opacity: 0, y: 32 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as any }}
        viewport={{ once: true, margin: "-80px" }}
        className="max-w-5xl mx-auto px-6"
      >
        <ArchitectureDiagram />

        <div className="flex flex-wrap justify-center gap-4 mt-12">
          {['POSEIDON HASH · COMMITMENT SCHEME', 'GROTH16 · PROOF SYSTEM', 'BN254 · STELLAR NATIVE'].map((pill, i) => (
            <div key={i} className="bg-hull border border-brass px-4 py-2 font-mono text-[0.65rem] text-brass">
              [ {pill} ]
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}