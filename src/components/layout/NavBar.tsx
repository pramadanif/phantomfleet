"use client";

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';

export function NavBar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <motion.nav 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled 
          ? 'bg-abyss/88 backdrop-blur-[14px] border-b border-brass/40' 
          : 'bg-transparent border-b border-brass/0'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="font-display text-brass text-[1.1rem] tracking-widest leading-none">
            PHANTOM FLEET
          </span>
          <span className="font-mono text-haze-gray text-[0.6rem] mt-1 tracking-widest">
            CLASSIFIED · ZK NAVAL COMBAT
          </span>
        </div>

        <div className="hidden md:flex items-center gap-8">
          {['MISSION', 'MECHANICS', 'PROTOCOL', 'DEPLOY'].map((item) => (
            <a 
              key={item} 
              href={`#${item.toLowerCase()}`}
              className="font-mono text-[0.7rem] uppercase text-smoke hover:text-brass transition-colors relative group"
            >
              {item}
              <span className="absolute -bottom-1 left-0 w-0 h-[1px] bg-brass transition-all group-hover:w-full"></span>
            </a>
          ))}
        </div>

        <div>
          <button className="border border-brass text-brass bg-transparent hover:bg-brass hover:text-abyss font-sans font-bold text-[0.8rem] tracking-wider py-2 px-5 transition-all">
            LAUNCH GAME →
          </button>
        </div>
      </div>
    </motion.nav>
  );
}