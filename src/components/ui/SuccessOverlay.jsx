import React from 'react';
import { CheckCircle2 } from 'lucide-react';

export default function SuccessOverlay({ isVisible, onClose }) {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop with high blur for that premium feel */}
      <div 
        className="absolute inset-0 bg-zinc-900/90 backdrop-blur-md animate-in fade-in duration-500" 
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative bg-white rounded-[2.5rem] p-10 max-w-md w-full text-center shadow-2xl animate-in zoom-in duration-300 border border-zinc-100">
        <div className="w-24 h-24 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-8 ring-8 ring-emerald-50/50">
          <CheckCircle2 size={52} strokeWidth={2.5} />
        </div>

        <h2 className="text-4xl font-black uppercase italic tracking-tighter text-zinc-900 mb-3">
          Order Confirmed
        </h2>
        
        <div className="h-1.5 w-12 bg-rose-500 mx-auto mb-6" />

        <p className="text-zinc-500 text-sm leading-relaxed mb-10 font-medium">
          Your payment was successful. We've sent a confirmation email and your high-performance gear is being prepped for dispatch.
        </p>

        <button 
          onClick={onClose}
          className="w-full bg-zinc-900 text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-rose-600 transition-all active:scale-[0.98] shadow-lg shadow-zinc-200"
        >
          Return to Store
        </button>
        
        <p className="mt-6 text-[10px] font-bold text-zinc-300 uppercase tracking-[0.2em]">
          ElectroTech Secure Checkout
        </p>
      </div>
    </div>
  );
}