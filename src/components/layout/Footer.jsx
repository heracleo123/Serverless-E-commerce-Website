import React from 'react';
import { APP_CONFIG, UI_STRINGS } from '../../constants/appConstants';

export default function Footer() {
  return (
    <footer className="border-t border-zinc-100 py-16 bg-zinc-50/50 mt-20">
      <div className="max-w-7xl mx-auto px-8 flex flex-col md:flex-row justify-between items-center gap-8">
        
        {/* Brand Section */}
        <div className="flex flex-col items-center md:items-start">
          <span className="text-2xl font-black italic tracking-tighter uppercase text-zinc-900">
            {APP_CONFIG.NAME}
            <span className="text-rose-500">.</span>
          </span>
          <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-2">
            {UI_STRINGS.FOOTER_TEXT}
          </p>
        </div>

        {/* Copyright & Info Section */}
        <div className="text-center md:text-right">
          <p className="text-[10px] font-black uppercase text-zinc-900 tracking-widest">
            © {APP_CONFIG.YEAR} {APP_CONFIG.DEVELOPER}
          </p>
          <p className="text-[9px] text-zinc-400 font-bold mt-1 uppercase tracking-tighter">
            {UI_STRINGS.SECURE_PAYMENT}
          </p>
        </div>
        
      </div>
    </footer>
  );
}