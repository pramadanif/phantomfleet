"use client";

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { soundEngine } from '../../utils/soundEngine';

export function NavBar() {
  const [scrolled, setScrolled] = useState(false);
  const [isMuted, setIsMuted] = useState(!soundEngine.isEnabled());

  const toggleMute = () => {
    soundEngine.toggle();
    setIsMuted(!soundEngine.isEnabled());
    if (soundEngine.isEnabled()) {
      soundEngine.play('ui_click');
    }
  };

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
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled
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

        <div className="flex items-center gap-4">
          <button
            onClick={toggleMute}
            className="text-brass/70 hover:text-brass transition-colors p-2"
            title={isMuted ? "Unmute Sound" : "Mute Sound"}
          >
            {isMuted ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 5L6 9H2v6h4l5 4V5z"></path>
                <line x1="23" y1="9" x2="17" y2="15"></line>
                <line x1="17" y1="9" x2="23" y2="15"></line>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
            )}
          </button>

          <button className="border border-brass text-brass bg-transparent hover:bg-brass hover:text-abyss font-sans font-bold text-[0.8rem] tracking-wider py-2 px-5 transition-all">
            LAUNCH GAME →
          </button>
        </div>
      </div>
    </motion.nav>
  );
}