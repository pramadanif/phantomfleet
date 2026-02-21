"use client";

export function BeforeAfterPanel() {
  return (
    <div className="flex flex-col gap-6">
      {/* BEFORE Panel */}
      <div className="bg-hull border-l-[3px] border-signal-red p-6">
        <div className="font-sans font-bold text-haze-gray tracking-wider mb-3">BEFORE PROTOCOL 25</div>
        <div className="h-[1px] w-full bg-ocean-gray/50 mb-4"></div>
        <div className="font-mono text-[0.8rem] text-haze-gray space-y-2 mb-4">
          <div className="flex justify-between">
            <span>BN254 pairing:</span>
            <span>WASM emulation</span>
          </div>
          <div className="flex justify-between">
            <span>Verification cost:</span>
            <span>PROHIBITIVE</span>
          </div>
          <div className="flex justify-between">
            <span>ZK gaming status:</span>
            <span>THEORETICALLY POSSIBLE</span>
          </div>
        </div>
        <div className="h-[1px] w-full bg-ocean-gray/50 mb-4"></div>
        <div className="font-mono text-signal-red text-[0.8rem]">✕ NOT FEASIBLE</div>
      </div>

      {/* AFTER Panel */}
      <div className="bg-deck-green/30 border-l-[3px] border-radar p-6 shadow-[-4px_0_12px_rgba(61,255,110,0.1)]">
        <div className="font-sans font-bold text-chalk tracking-wider mb-3 flex items-center gap-3">
          STELLAR PROTOCOL 25
          <span className="flex items-center gap-1.5 text-radar text-[0.65rem] font-mono tracking-normal">
            <span className="w-1.5 h-1.5 rounded-full bg-radar inline-block"></span>
            ACTIVE
          </span>
        </div>
        <div className="h-[1px] w-full bg-radar/30 mb-4"></div>
        <div className="font-mono text-[0.8rem] text-chalk space-y-2 mb-4">
          <div className="flex justify-between">
            <span>BN254 pairing:</span>
            <span className="text-radar">NATIVE PRECOMPILE</span>
          </div>
          <div className="flex justify-between">
            <span>Verification cost:</span>
            <span className="text-radar">CONSTANT</span>
          </div>
          <div className="flex justify-between">
            <span>ZK gaming status:</span>
            <span className="text-radar">DEPLOYED & PLAYABLE</span>
          </div>
        </div>
        <div className="h-[1px] w-full bg-radar/30 mb-4"></div>
        <div className="font-mono text-radar text-[0.8rem]">✓ PHANTOM FLEET</div>
      </div>

      {/* Code Snippet */}
      <div className="bg-hull border-l-[3px] border-brass p-4 mt-2">
        <pre className="font-mono text-[0.7rem] text-radar overflow-x-auto">
<code className="text-haze-gray">// The line that changed everything
// Soroban Protocol 25 — BN254 native precompile</code>
<br/>
env.crypto().bn254_pairing_check(proof, public_inputs)
<br/>
<code className="text-haze-gray">// Single host function. Constant cost. Zero trust.</code>
        </pre>
      </div>
    </div>
  );
}