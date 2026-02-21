"use client";

export function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center my-20 max-w-4xl mx-auto px-6">
      <div className="flex-grow h-[1px] bg-ocean-gray opacity-30"></div>
      <div className="px-4 font-mono text-[0.7rem] text-brass tracking-[0.3em] uppercase">
        [ {label} ]
      </div>
      <div className="flex-grow h-[1px] bg-ocean-gray opacity-30"></div>
    </div>
  );
}