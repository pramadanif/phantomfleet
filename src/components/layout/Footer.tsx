"use client";

export function Footer() {
  return (
    <footer className="bg-hull border-t border-brass/25 py-8 px-6 md:px-12">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="font-mono text-[0.65rem] text-haze-gray">
          PHANTOM FLEET · STELLAR PROTOCOL 25
        </div>
        <div className="font-mono text-[0.6rem] text-haze-gray tracking-wider italic text-center">
          ALL MOVES PROVEN. ALL PROOFS VERIFIED. NO TRUST REQUIRED.
        </div>
        <div className="font-mono text-[0.65rem] text-haze-gray">
          TESTNET ONLY · 2025
        </div>
      </div>
    </footer>
  );
}