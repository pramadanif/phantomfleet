"use client";

export function ScanlineOverlay() {
  return (
    <div 
      className="fixed inset-0 z-[9998] pointer-events-none opacity-[0.02]"
      style={{
        backgroundImage: 'repeating-linear-gradient(to bottom, transparent, transparent 2px, #000 2px, #000 4px)'
      }}
    />
  );
}