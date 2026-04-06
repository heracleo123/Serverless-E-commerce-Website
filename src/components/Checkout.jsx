import React, { useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { Loader2, CreditCard } from 'lucide-react';
import { APP_CONFIG } from '../constants/appConstants';

const Checkout = ({ cart, userId, onClearCart }) => {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleCheckout = async () => {
  setIsProcessing(true);
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();

    const response = await fetch(`${APP_CONFIG.API_URL}/process-order`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: userId || "Anonymous",
        items: cart
      })
    });

    const result = await response.json();
    
    // THIS ALERT WILL TELL US EVERYTHING
    alert("Server Response: " + JSON.stringify(result));

    if (result.url) {
      window.location.href = result.url;
    } else {
      console.error("Missing URL in result:", result);
    }
  } catch (err) {
    alert("Error: " + err.message);
  } finally {
    setIsProcessing(false);
  }
};

  return (
    <button
      onClick={handleCheckout}
      disabled={isProcessing || cart.length === 0}
      className="w-full bg-zinc-900 text-white py-4 rounded-xl font-black uppercase text-xs tracking-[0.2em] flex items-center justify-center gap-3 disabled:bg-zinc-200 disabled:text-zinc-400 transition-all hover:bg-rose-600 active:scale-[0.98]"
    >
      {isProcessing ? (
        <>
          <Loader2 className="animate-spin" size={18} />
          <span className="animate-pulse">Connecting to Stripe...</span>
        </>
      ) : (
        <>
          <CreditCard size={18} />
          Proceed to Purchase
        </>
      )}
    </button>
  );
};

export default Checkout;