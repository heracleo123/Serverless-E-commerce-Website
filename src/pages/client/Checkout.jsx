import React from 'react';
import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Checkout({ cart, userId, onProceed }) {
  const navigate = useNavigate();

  const handleCheckout = () => {
    if (!userId) {
      alert("Please sign in to complete your purchase.");
      return;
    }

    onProceed?.();
    navigate('/checkout');
  };

  return (
    <button
      onClick={handleCheckout}
      disabled={cart.length === 0}
      className="w-full bg-zinc-900 text-white py-4 rounded-xl font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-rose-600 transition-all disabled:opacity-50"
    >
      <>
        <ArrowRight size={18} />
        Proceed To Checkout
      </>
    </button>
  );
}