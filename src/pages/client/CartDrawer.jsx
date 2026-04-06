import React from 'react';
import { X, Plus, Minus, Trash2, ShoppingBag, Lock } from 'lucide-react';
import { Authenticator } from '@aws-amplify/ui-react';
import Checkout from './Checkout';

const formatCurrency = (value) => new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
}).format(Number(value || 0));

// Added onUpdateQty to the props
export default function CartDrawer({ isOpen, onClose, cart, onRemove, onUpdateQty, onClearCart, user }) {
  // 1. CONDITIONAL RENDERING: Ensure the component doesn't render if it's closed
  if (!isOpen) return null;

  // 2. LIVE CALCULATION: Recalculates the total price every time the cart state changes
  const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* 3. BACKDROP: Dims the background and allows 'Click-to-Close' functionality */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="absolute inset-y-0 right-0 max-w-full flex">
        <div className="w-screen max-w-lg bg-white shadow-2xl flex flex-col">
          
          {/* HEADER */}
          <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShoppingBag size={20} className="text-rose-500" />
              <h2 className="text-sm font-black uppercase tracking-tighter">Your Cart</h2>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>

          {/* --- ITEM LIST --- */}
          <div className="flex-1 overflow-y-auto p-6">
            {cart.length === 0 ? (
              /* EMPTY STATE: Visual for an empty cart */
              <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                <ShoppingBag size={48} className="mb-4" />
                <p className="text-[10px] font-black uppercase">Your cart is empty</p>
              </div>
            ) : (
              <div className="space-y-8">
                {cart.map((item) => (
                  <div key={item.productId} className="flex items-start gap-4 group">
                    <img src={item.imageUrl} alt={item.name} className="w-20 h-20 object-cover rounded-lg bg-zinc-50 border border-zinc-100" />
                    
                    <div className="flex-1 min-w-0">
                      <h4 className="text-[11px] font-black uppercase leading-tight truncate">{item.name}</h4>
                      <p className="text-[10px] text-rose-500 font-black mt-1">{formatCurrency(item.price)}</p>
                      
                      {/* 4. QUANTITY CONTROLS WITH VALIDATION logic */}
                        <div className="flex items-center gap-4 mt-3">
                          <div className="flex items-center bg-zinc-100 rounded-full p-1 border border-zinc-200">
                            {/* Decrement: Disabled if quantity is 1 */}
                            <button 
                              onClick={() => onUpdateQty(item.productId, item.qty - 1)}
                              disabled={item.qty <= 1}
                              className="p-1 hover:bg-white hover:text-rose-500 rounded-full transition-all disabled:opacity-20"
                            >
                              <Minus size={12} />
                            </button>
                            
                            <span className="text-[10px] font-black w-8 text-center tabular-nums">
                              {item.qty}
                            </span>
                            
                            {/* Increment: Disabled if requested qty exceeds the stock from DynamoDB */}
                            <button 
                              onClick={() => onUpdateQty(item.productId, item.qty + 1)}
                              disabled={item.qty >= (item.stock || 0)}
                              className={`p-1 rounded-full transition-all ${
                                item.qty >= (item.stock || 0) 
                                  ? "opacity-20 cursor-not-allowed" 
                                  : "hover:bg-white hover:text-rose-500"
                              }`}
                            > 
                              <Plus size={12} />
                            </button>
                          </div>

                          <button 
                            onClick={() => onRemove(item.productId)} 
                            className="text-zinc-300 hover:text-rose-600 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        {/* 5. STOCK INDICATOR: Real-time inventory warning */}
                        {item.qty >= (item.stock || 0) && (
                          <p className="text-[8px] font-black text-rose-500 uppercase mt-1 animate-pulse">
                            Max Stock Reached
                          </p>
                        )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* --- FOOTER & CHECKOUT GATE --- */}
          {cart.length > 0 && (
            <div className="p-6 border-t border-zinc-100 bg-zinc-50/50">
              <div className="flex justify-between mb-6">
                <span className="font-bold text-zinc-400 uppercase text-[10px] tracking-widest">Items Subtotal</span>
                <span className="font-black text-xl tracking-tighter">{formatCurrency(total)}</span>
              </div>
              
              {/* 6. SECURITY GATE: Only shows the Checkout button if the user is signed in */}
              {user ? (
                <Checkout 
                  cart={cart} 
                  userId={user?.userId}
                  userEmail={user?.signInDetails?.loginId || user?.attributes?.email}
                  onProceed={onClose}
                  onClearCart={onClearCart} 
                  onSuccess={(orderId) => {
                    onClose(); // Close drawer on successful order
                  }}
                />
              ) : (
                /* 7. IN-DRAWER AUTH: Inline login prompt to reduce friction */
                <div className="space-y-4">
                    <div className="flex items-center justify-center gap-2 py-3 bg-rose-50 rounded-lg text-rose-600 border border-rose-100">
                        <Lock size={12} />
                        <span className="text-[9px] font-black uppercase tracking-widest italic">Authorization Required for Checkout</span>
                    </div>
                    <div className="amplify-auth-compact">
                      <Authenticator>
                          {({ signOut, user }) => (
                              <div className="pt-2 text-center">
                                  <p className="text-[10px] font-black uppercase text-zinc-400">Identity Verified</p>
                              </div>
                          )}
                      </Authenticator>
                    </div>
                </div>
              )}
              
              <p className="text-center text-[9px] text-zinc-400 mt-6 font-bold uppercase tracking-[0.3em] opacity-50">
                Encrypted Transaction via Stripe
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}