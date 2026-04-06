import React, { useEffect } from 'react';
import { CheckCircle, XCircle, X, AlertCircle } from 'lucide-react';

export default function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000); 
    return () => clearTimeout(timer);
  }, [onClose]);

  // Palette: White, Red (Rose-600), Black (Zinc-950), Gray (Zinc-400/500)
  const styles = {
    success: "bg-zinc-950 border-zinc-800 text-white",
    error: "bg-red-600 border-red-700 text-white",
    warning: "bg-white border-zinc-200 text-zinc-900" // Optional third style using the White/Gray
  };

  const icons = {
    success: <CheckCircle size={18} className="text-red-500" />,
    error: <XCircle size={18} className="text-white" />,
    warning: <AlertCircle size={18} className="text-red-600" />
  };

  return (
    <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[200] animate-in slide-in-from-top-10 fade-in duration-300">
      <div className={`flex items-center gap-4 px-6 py-4 rounded-xl border shadow-[0_20px_50px_rgba(0,0,0,0.3)] ${styles[type]}`}>
        {icons[type]}
        
        <span className="text-[10px] font-black uppercase tracking-[0.2em] leading-none mt-0.5">
          {message}
        </span>

        <div className="w-[1px] h-4 bg-white/20 ml-2" />

        <button 
          onClick={onClose} 
          className="p-1 hover:bg-white/10 rounded-full transition-colors"
        >
          <X size={14} className={type === 'warning' ? 'text-zinc-400' : 'text-white/50'} />
        </button>
      </div>
    </div>
  );
}