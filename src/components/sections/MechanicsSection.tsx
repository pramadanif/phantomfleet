"use client";

import { SectionDivider } from '../layout/SectionDivider';
import { GameBoardDemo } from '../ui/GameBoardDemo';
import { MechanicCards } from '../ui/MechanicCards';

export function MechanicsSection() {
  return (
    <section id="mechanics" className="py-12">
      <SectionDivider label="02 · HOW THE DECEPTION WORKS" />
      
      <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-[55%_45%] gap-12 items-center">
        <GameBoardDemo />
        <MechanicCards />
      </div>
    </section>
  );
}