import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Lock, MapPin, Tag } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { APP_CONFIG } from '../../constants/appConstants';
import { useCart } from '../../hooks/useCart';
import ProfileModal from '../../features/auth/ProfileModal.jsx';

const HST_RATE = 0.13;
const formatCurrency = (value) => new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
}).format(Number(value || 0));

export default function CheckoutReview() {
  const navigate = useNavigate();
  const { user, authStatus } = useAuthenticator((context) => [context.user, context.authStatus]);
  const { cart } = useCart();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [profile, setProfile] = useState(null);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoState, setPromoState] = useState({ status: 'idle', message: '', promo: null });

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + (Number(item.price) * item.qty), 0), [cart]);

  const discountAmount = useMemo(() => {
    const promo = promoState.promo;
    if (!promo) {
      return 0;
    }

    const applicableSubtotal = cart.reduce((sum, item) => {
      if (promo.targetType === 'category' && item.category !== promo.targetValue) {
        return sum;
      }
      if (promo.targetType === 'product' && item.productId !== promo.targetValue) {
        return sum;
      }
      return sum + (Number(item.price) * item.qty);
    }, 0);

    if (applicableSubtotal <= 0) {
      return 0;
    }

    const rawDiscount = promo.discountType === 'amount'
      ? Number(promo.discountValue || 0)
      : applicableSubtotal * (Number(promo.discountValue || 0) / 100);

    return Math.min(applicableSubtotal, rawDiscount);
  }, [cart, promoState.promo]);

  const discountedSubtotal = useMemo(() => Math.max(0, subtotal - discountAmount), [subtotal, discountAmount]);
  const tax = useMemo(() => discountedSubtotal * HST_RATE, [discountedSubtotal]);
  const orderTotal = useMemo(() => discountedSubtotal + tax, [discountedSubtotal, tax]);
  const addresses = profile?.addresses || [];
  const selectedAddress = addresses.find((address) => address.id === selectedAddressId) || addresses[0] || null;
  const selectedAddressName = selectedAddress ? `${selectedAddress.line2 || ''} ${selectedAddress.fullName || ''}`.trim() : '';

  useEffect(() => {
    if (!user) {
      return;
    }

    const loadProfile = async () => {
      try {
        setIsLoadingProfile(true);
        const session = await fetchAuthSession();
        const token = session.tokens?.idToken?.toString();

        if (!token) {
          throw new Error('No valid authentication token found.');
        }

        const response = await fetch(`${APP_CONFIG.API_URL}/profile`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Unable to load profile.');
        }

        setProfile(data);
        setSelectedAddressId(data.defaultAddressId || data.addresses?.[0]?.id || '');
      } catch (error) {
        console.error('Profile fetch failed:', error);
      } finally {
        setIsLoadingProfile(false);
      }
    };

    loadProfile();
  }, [user]);

  const handleApplyPromo = async () => {
    const normalizedCode = promoCode.trim().toUpperCase();
    if (!normalizedCode) {
      setPromoState({ status: 'error', message: 'Enter a promo code first.', promo: null });
      return;
    }

    try {
      setPromoState({ status: 'loading', message: '', promo: null });

      const response = await fetch(`${APP_CONFIG.API_URL}/promos?code=${encodeURIComponent(normalizedCode)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Promo code not found.');
      }

      setPromoState({ status: 'success', message: `${normalizedCode} applied successfully.`, promo: data });
      setPromoCode(normalizedCode);
    } catch (error) {
      setPromoState({ status: 'error', message: error.message || 'Unable to apply promo code.', promo: null });
    }
  };

  const handleSecureCheckout = async () => {
    if (!user) {
      alert('Please sign in to complete your purchase.');
      navigate('/');
      return;
    }

    if (!selectedAddress) {
      setShowProfileModal(true);
      return;
    }

    try {
      setIsRedirecting(true);

      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      if (!token) {
        throw new Error('No valid authentication token found.');
      }

      const response = await fetch(`${APP_CONFIG.API_URL}/process-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          items: cart.map((item) => ({
            productId: item.productId,
            name: item.name,
            category: item.category,
            price: Number(item.price),
            qty: item.qty,
            imageUrl: item.imageUrl,
          })),
          promoCode: promoState.promo ? promoCode : '',
          shippingAddress: selectedAddress,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || `Checkout failed with status ${response.status}`);
      }

      if (!data.url) {
        throw new Error('No checkout URL received from server.');
      }

      window.location.href = data.url;
    } catch (error) {
      console.error('Checkout error:', error);
      alert(error.message || 'Checkout failed. Please try again.');
    } finally {
      setIsRedirecting(false);
    }
  };

  if (cart.length === 0) {
    return (
      <div className="min-h-screen bg-zinc-50 px-6 py-16">
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-zinc-200 bg-white p-10 text-center shadow-xl">
          <h1 className="text-3xl font-black uppercase italic tracking-tighter text-zinc-900">Your cart is empty</h1>
          <p className="mt-3 text-sm font-medium text-zinc-500">Add products to your cart before proceeding to checkout.</p>
          <Link to="/" className="mt-8 inline-flex items-center gap-2 rounded-full bg-zinc-900 px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white transition hover:bg-rose-600">
            <ArrowLeft size={16} />
            Back To Store
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <Link to="/" className="mb-8 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 transition hover:text-rose-600">
          <ArrowLeft size={16} />
          Continue Shopping
        </Link>

        <div className="grid gap-8 lg:grid-cols-[1.5fr_0.95fr]">
          <section className="space-y-8">
            <div className="rounded-[2rem] border border-zinc-200 bg-white p-8 shadow-xl">
              <div className="border-b border-zinc-100 pb-6">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-rose-500">Review Order</p>
                <h1 className="mt-2 text-4xl font-black uppercase italic tracking-tighter text-zinc-900">Proceed to checkout</h1>
                <p className="mt-3 text-sm font-medium text-zinc-500">Confirm your delivery address, apply promos, and review the final total before continuing to Stripe.</p>
              </div>

              <div className="mt-8 space-y-5">
                {cart.map((item) => (
                  <div key={item.productId} className="flex gap-4 rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                    <img src={item.imageUrl} alt={item.name} className="h-24 w-24 rounded-xl border border-zinc-200 bg-white object-cover" />
                    <div className="flex flex-1 items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-500">{item.brand || item.category}</p>
                        <h2 className="mt-1 text-lg font-black text-zinc-900">{item.name}</h2>
                        <p className="mt-2 text-xs font-bold uppercase tracking-[0.15em] text-zinc-500">Quantity: {item.qty}</p>
                      </div>
                      <p className="text-lg font-black tracking-tighter text-zinc-900">{formatCurrency(Number(item.price) * item.qty)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-zinc-200 bg-white p-8 shadow-xl">
              <div className="flex items-center justify-between gap-4 border-b border-zinc-100 pb-5">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-rose-500">Delivery</p>
                  <h2 className="mt-2 text-2xl font-black uppercase italic tracking-tighter text-zinc-900">Shipping address</h2>
                </div>
                <button type="button" onClick={() => setShowProfileModal(true)} className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 transition hover:text-rose-600">Manage Addresses</button>
              </div>

              {isLoadingProfile ? (
                <div className="mt-6 flex items-center gap-3 text-zinc-500">
                  <Loader2 size={18} className="animate-spin" />
                  <span className="text-sm font-bold">Loading saved addresses...</span>
                </div>
              ) : addresses.length === 0 ? (
                <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
                  <p className="text-sm font-bold">No address saved.</p>
                  <p className="mt-2 text-sm">Add an address now to continue with checkout.</p>
                  <button type="button" onClick={() => setShowProfileModal(true)} className="mt-4 rounded-2xl bg-zinc-900 px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-white transition hover:bg-rose-600">Open Address Manager</button>
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  <div className="flex flex-wrap gap-3">
                    {addresses.map((address) => (
                      <button
                        key={address.id}
                        type="button"
                        onClick={() => setSelectedAddressId(address.id)}
                        className={`rounded-2xl border px-4 py-3 text-left transition ${selectedAddressId === address.id ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-zinc-300'}`}
                      >
                        <p className="text-[10px] font-black uppercase tracking-[0.18em]">{address.label || 'Address'}</p>
                        <p className="mt-1 text-sm font-bold">{`${address.line2 || ''} ${address.fullName || ''}`.trim() || 'Address holder'}</p>
                      </button>
                    ))}
                  </div>

                  {selectedAddress ? (
                    <div className="rounded-3xl border border-zinc-100 bg-zinc-50 p-5">
                      <div className="flex items-center gap-2 text-zinc-500">
                        <MapPin size={16} />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em]">Selected Address</span>
                      </div>
                      <div className="mt-3 text-sm font-medium text-zinc-700">
                        <p className="font-black text-zinc-900">{selectedAddressName}</p>
                        <p>{selectedAddress.line1}</p>
                        <p>{selectedAddress.city}, {selectedAddress.province} {selectedAddress.postalCode}</p>
                        <p>{selectedAddress.country}</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </section>

          <aside className="rounded-[2rem] border border-zinc-200 bg-white p-8 shadow-xl lg:sticky lg:top-10 lg:h-fit">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-400">Order Summary</p>
            <div className="mt-6 space-y-4 border-b border-zinc-100 pb-6">
              <div className="flex items-center justify-between text-sm font-bold text-zinc-600">
                <span>Items Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {promoState.promo ? (
                <div className="flex items-center justify-between text-sm font-bold text-emerald-600">
                  <span>Promo Discount</span>
                  <span>-{formatCurrency(discountAmount)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between text-sm font-bold text-zinc-600">
                <span>GST/HST (13%)</span>
                <span>{formatCurrency(tax)}</span>
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-zinc-100 bg-zinc-50 p-4">
              <div className="flex items-center gap-2 text-zinc-500">
                <Tag size={16} />
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">Promo Code</span>
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  value={promoCode}
                  onChange={(event) => {
                    setPromoCode(event.target.value.toUpperCase());
                    if (promoState.status !== 'loading') {
                      setPromoState({ status: 'idle', message: '', promo: null });
                    }
                  }}
                  placeholder="Enter code"
                  className="flex-1 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-xs font-medium text-zinc-700 outline-none transition focus:border-rose-400"
                />
                <button
                  type="button"
                  onClick={handleApplyPromo}
                  disabled={promoState.status === 'loading'}
                  className="rounded-2xl bg-zinc-900 px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:bg-zinc-400"
                >
                  {promoState.status === 'loading' ? 'Applying' : 'Apply'}
                </button>
              </div>
              {promoState.message ? <p className={`mt-3 text-xs font-bold ${promoState.status === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>{promoState.message}</p> : null}
            </div>

            <div className="mt-6 flex items-center justify-between">
              <span className="text-sm font-black uppercase tracking-[0.2em] text-zinc-500">Order Total</span>
              <span className="text-3xl font-black italic tracking-tighter text-zinc-900">{formatCurrency(orderTotal)}</span>
            </div>

            <button
              onClick={handleSecureCheckout}
              disabled={isRedirecting || authStatus === 'configuring' || !selectedAddress}
              className="mt-8 flex w-full items-center justify-center gap-3 rounded-2xl bg-zinc-900 px-4 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:bg-zinc-400"
            >
              {isRedirecting ? <Loader2 size={18} className="animate-spin" /> : <Lock size={18} />}
              {isRedirecting ? 'Connecting To Stripe...' : 'Secure Checkout'}
            </button>

            <p className="mt-4 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Taxes shown here are included in the final Stripe charge.</p>
          </aside>
        </div>
      </div>
      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        user={user}
        onProfileSaved={(nextProfile) => {
          setProfile(nextProfile);
          setSelectedAddressId(nextProfile.defaultAddressId || nextProfile.addresses?.[0]?.id || '');
          setShowProfileModal(false);
        }}
      />
    </div>
  );
}