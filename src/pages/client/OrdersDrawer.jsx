import { useEffect, useMemo, useState } from 'react';
import { Calendar, Loader2, Mail, Package, Send, Truck, X } from 'lucide-react';

const formatCurrency = (value) => new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
}).format(Number(value || 0));

export default function OrdersDrawer({ isOpen, onClose, orders = [], isLoading = false, error = '', onResend, resendInFlightId = '' }) {
  const [emailByOrder, setEmailByOrder] = useState({});

  const normalizedOrders = useMemo(
    () => orders.map((order) => ({
      ...order,
      trackingNumber: order.trackingNumber || `ET-${String(order.orderId || 'ORDER').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(-12).padStart(12, '0')}`
    })),
    [orders]
  );

  useEffect(() => {
    const nextEmails = {};
    normalizedOrders.forEach((order) => {
      nextEmails[`${order.orderId}:${order.createdAt}`] = order.email || '';
    });
    setEmailByOrder(nextEmails);
  }, [normalizedOrders]);

  // 1. EXIT CLAUSE
  // If the drawer isn't active, we return null to save browser resources.
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex justify-end">
      {/* 2. BACKGROUND DIMMING (BACKDROP) 
          Uses 'backdrop-blur-sm' to give that modern, premium UI feel. */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" 
        onClick={onClose} 
      />
      
      {/* 3. SLIDING PANEL
          Uses Tailwind's 'animate-in' to smoothly slide from the right side of the screen. */}
      <div className="relative w-screen max-w-md bg-zinc-50 h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-500">
        
        {/* --- HEADER --- */}
        <div className="p-6 border-b bg-white flex justify-between items-center">
          <div>
            <h2 className="text-xl font-black uppercase italic tracking-tighter text-zinc-900">My Orders</h2>
            <p className="text-[9px] text-rose-500 font-bold tracking-widest uppercase">ElectroTech History</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
          >
            <X size={20} className="text-zinc-400" />
          </button>
        </div>

        {/* --- ORDERS LIST AREA --- */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Loader2 className="animate-spin text-rose-500" size={28} />
              <p className="mt-4 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Loading Orders</p>
            </div>
          ) : error ? (
            <div className="rounded-3xl border border-rose-100 bg-rose-50 p-6 text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-600">{error}</p>
            </div>
          ) : normalizedOrders.length === 0 ? (
            <div className="text-center py-32">
              <Package className="mx-auto text-zinc-200 mb-4" size={64} strokeWidth={1} />
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">No orders found</p>
            </div>
          ) : (
            /* 5. DYNAMIC RENDERING: Maps through each order from the database */
            normalizedOrders.map((order) => (
              <div 
                key={`${order.orderId}:${order.createdAt}`} 
                className="bg-white p-5 rounded-3xl shadow-sm border border-zinc-100 group hover:border-rose-200 transition-all duration-300"
              >
                {/* --- ORDER METADATA --- */}
                <div className="flex justify-between items-start mb-4">
                  <div>
                    {/* Status Badge: Defaults to 'PROCESSED' if not explicitly set */}
                    <span className="inline-block px-2 py-0.5 rounded-full bg-rose-50 text-[8px] font-black text-rose-600 uppercase tracking-widest mb-1">
                      {order.status || 'PROCESSED'}
                    </span>
                    {/* Order ID Sanitization: Removes the 'STRIPE-' prefix for a cleaner UI */}
                    <h3 className="text-[10px] font-bold text-zinc-400 block uppercase tracking-tight">
                      #{order.orderId.replace('STRIPE-', '')}
                    </h3>
                  </div>
                  <span className="text-lg font-black text-zinc-900 tracking-tighter">{formatCurrency(order.total)}</span>
                </div>

                <div className="rounded-2xl bg-zinc-50 p-4 mb-4 border border-zinc-100">
                  <div className="flex items-center gap-2 text-zinc-500 mb-3">
                    <Truck size={14} />
                    <span className="text-[10px] font-black uppercase tracking-[0.18em]">Tracking Number</span>
                  </div>
                  <p className="text-sm font-black tracking-[0.12em] text-zinc-900">{order.trackingNumber}</p>
                </div>
                
                {/* 6. NESTED ITEM ITERATION
                    Iterates through the 'items' array within each order object. */}
                <div className="space-y-2 mb-4">
                  {(order.items || []).map((item, idx) => (
                    <div key={idx} className="flex justify-between text-[11px] text-zinc-600 font-medium">
                      <span className="flex gap-2">
                        <span className="font-bold text-zinc-400">{item.qty}x</span> 
                        <span className="truncate max-w-[180px]">{item.name}</span>
                      </span>
                      <span className="font-bold text-zinc-900">{formatCurrency(item.price)}</span>
                    </div>
                  ))}
                </div>

                {/* --- FOOTER INFO --- */}
                <div className="pt-4 border-t border-zinc-50 flex justify-between items-center">
                  <div className="flex items-center gap-1.5 text-zinc-400">
                    <Calendar size={12} strokeWidth={2.5} />
                    <span className="text-[10px] font-bold uppercase tracking-tight">
                      {/* 7. DATE FORMATTING: Converts the ISO timestamp to a readable local date */}
                      {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'Recent'}
                    </span>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                  <div className="flex items-center gap-2 text-zinc-500">
                    <Mail size={14} />
                    <span className="text-[10px] font-black uppercase tracking-[0.18em]">Resend Receipt</span>
                  </div>
                  <p className="mt-2 text-[11px] text-zinc-500">Send the order confirmation, receipt, order number, and tracking number to another email.</p>
                  <div className="mt-3 flex gap-2">
                    <input
                      type="email"
                      value={emailByOrder[`${order.orderId}:${order.createdAt}`] || ''}
                      onChange={(event) => setEmailByOrder((current) => ({
                        ...current,
                        [`${order.orderId}:${order.createdAt}`]: event.target.value
                      }))}
                      placeholder="customer@example.com"
                      className="flex-1 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-xs font-medium text-zinc-700 outline-none transition focus:border-rose-400"
                    />
                    <button
                      type="button"
                      onClick={() => onResend?.(order, emailByOrder[`${order.orderId}:${order.createdAt}`] || '')}
                      disabled={!emailByOrder[`${order.orderId}:${order.createdAt}`] || resendInFlightId === `${order.orderId}:${order.createdAt}`}
                      className="inline-flex items-center gap-2 rounded-2xl bg-zinc-900 px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:bg-zinc-300"
                    >
                      {resendInFlightId === `${order.orderId}:${order.createdAt}` ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      {resendInFlightId === `${order.orderId}:${order.createdAt}` ? 'Sending' : 'Resend'}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}