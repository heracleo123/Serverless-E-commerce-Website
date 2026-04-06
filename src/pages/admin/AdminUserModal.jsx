import { useEffect, useState } from 'react';
import { Loader2, Mail, MapPin, Save, ShoppingBag, User, X } from 'lucide-react';

const createEmptyAddress = (index = 1) => ({
  id: `address-${Date.now()}-${index}`,
  label: `Address ${index}`,
  fullName: '',
  line1: '',
  line2: '',
  city: '',
  province: '',
  postalCode: '',
  country: 'Canada',
});

const formatCurrency = (value) => new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
}).format(Number(value || 0));

export default function AdminUserModal({ isOpen, user, detail, isLoading, isSaving, onClose, onSave }) {
  const [draft, setDraft] = useState({
    email: '',
    username: '',
    photoUrl: '',
    birthDate: '',
    addresses: [],
    defaultAddressId: '',
  });

  useEffect(() => {
    if (!detail?.profile) {
      return;
    }

    setDraft({
      email: detail.profile.email || user?.email || '',
      username: detail.profile.username || '',
      photoUrl: detail.profile.photoUrl || '',
      birthDate: detail.profile.birthDate || '',
      addresses: Array.isArray(detail.profile.addresses) ? detail.profile.addresses : [],
      defaultAddressId: detail.profile.defaultAddressId || detail.profile.addresses?.[0]?.id || '',
    });
  }, [detail, user]);

  if (!isOpen) {
    return null;
  }

  const updateAddress = (addressId, field, value) => {
    setDraft((current) => ({
      ...current,
      addresses: current.addresses.map((address) => (
        address.id === addressId ? { ...address, [field]: value } : address
      )),
    }));
  };

  const addAddress = () => {
    setDraft((current) => ({
      ...current,
      addresses: [...current.addresses, createEmptyAddress(current.addresses.length + 1)],
    }));
  };

  const removeAddress = (addressId) => {
    setDraft((current) => {
      const nextAddresses = current.addresses.filter((address) => address.id !== addressId);
      return {
        ...current,
        addresses: nextAddresses,
        defaultAddressId: current.defaultAddressId === addressId ? nextAddresses[0]?.id || '' : current.defaultAddressId,
      };
    });
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-[2.5rem] bg-white shadow-2xl">
        <div className="flex items-start justify-between bg-zinc-900 p-8 text-white">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-rose-400">Customer Profile</p>
            <h2 className="mt-2 text-3xl font-black uppercase italic tracking-tighter">{user?.email || user?.username}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 transition hover:bg-white/10">
            <X size={20} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-3 p-10 text-zinc-500">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm font-bold">Loading customer details...</span>
          </div>
        ) : (
          <div className="grid max-h-[calc(92vh-8rem)] gap-0 overflow-y-auto lg:grid-cols-[0.9fr_1.1fr]">
            <aside className="border-b border-zinc-100 bg-zinc-50 p-8 lg:border-b-0 lg:border-r">
              <div className="space-y-4">
                <div className="rounded-2xl border border-zinc-100 bg-white p-4">
                  <div className="flex items-center gap-3 text-zinc-500">
                    <Mail size={16} />
                    <span className="text-[9px] font-black uppercase tracking-widest">Email</span>
                  </div>
                  <input
                    value={draft.email}
                    onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
                    className="mt-3 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-900 outline-none transition focus:border-rose-500"
                  />
                </div>

                <div className="rounded-2xl border border-zinc-100 bg-white p-4">
                  <div className="flex items-center gap-3 text-zinc-500">
                    <User size={16} />
                    <span className="text-[9px] font-black uppercase tracking-widest">Public Username</span>
                  </div>
                  <input
                    value={draft.username}
                    onChange={(event) => setDraft((current) => ({ ...current, username: event.target.value.toLowerCase() }))}
                    className="mt-3 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-900 outline-none transition focus:border-rose-500"
                  />
                  <p className="mt-2 text-xs text-zinc-500">This single unique name is what customers see on reviews and profile details.</p>
                </div>

                <div className="rounded-2xl border border-zinc-100 bg-white p-4">
                  <div className="flex items-center gap-3 text-zinc-500">
                    <MapPin size={16} />
                    <span className="text-[9px] font-black uppercase tracking-widest">Birthdate</span>
                  </div>
                  <input
                    type="date"
                    value={draft.birthDate}
                    onChange={(event) => setDraft((current) => ({ ...current, birthDate: event.target.value }))}
                    className="mt-3 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-900 outline-none transition focus:border-rose-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => onSave?.(draft)}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-2xl bg-zinc-900 px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:bg-zinc-400"
                >
                  {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {isSaving ? 'Saving Profile' : 'Save Customer Profile'}
                </button>
              </div>
            </aside>

            <section className="p-8">
              <div className="flex items-center justify-between gap-4 border-b border-zinc-100 pb-5">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-rose-500">Saved Addresses</p>
                  <h3 className="mt-2 text-2xl font-black uppercase italic tracking-tighter text-zinc-900">Customer shipping details</h3>
                </div>
                <button
                  type="button"
                  onClick={addAddress}
                  disabled={draft.addresses.length >= 5}
                  className="rounded-2xl border border-zinc-200 px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-700 transition hover:border-rose-300 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add Address
                </button>
              </div>

              <div className="mt-6 space-y-5">
                {draft.addresses.length === 0 ? (
                  <div className="rounded-[2rem] border border-dashed border-zinc-200 bg-zinc-50 p-6 text-center text-sm text-zinc-500">
                    No address saved for this customer yet.
                  </div>
                ) : draft.addresses.map((address, index) => (
                  <div key={address.id} className="rounded-[2rem] border border-zinc-200 bg-zinc-50 p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="adminDefaultAddress"
                          checked={draft.defaultAddressId === address.id}
                          onChange={() => setDraft((current) => ({ ...current, defaultAddressId: address.id }))}
                          className="h-4 w-4 accent-rose-500"
                        />
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Default Address</p>
                          <p className="text-sm font-black text-zinc-900">Address {index + 1}</p>
                        </div>
                      </div>
                      <button type="button" onClick={() => removeAddress(address.id)} className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-600">
                        Remove
                      </button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <input value={address.line2} onChange={(event) => updateAddress(address.id, 'line2', event.target.value)} placeholder="First name" className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-900 outline-none transition focus:border-rose-500" />
                      <input value={address.fullName} onChange={(event) => updateAddress(address.id, 'fullName', event.target.value)} placeholder="Last name" className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-900 outline-none transition focus:border-rose-500" />
                      <input value={address.line1} onChange={(event) => updateAddress(address.id, 'line1', event.target.value)} placeholder="Street address" className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-900 outline-none transition focus:border-rose-500 md:col-span-2" />
                      <input value={address.city} onChange={(event) => updateAddress(address.id, 'city', event.target.value)} placeholder="City" className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-900 outline-none transition focus:border-rose-500" />
                      <input value={address.province} onChange={(event) => updateAddress(address.id, 'province', event.target.value)} placeholder="Province" className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-900 outline-none transition focus:border-rose-500" />
                      <input value={address.postalCode} onChange={(event) => updateAddress(address.id, 'postalCode', event.target.value)} placeholder="Postal code" className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-900 outline-none transition focus:border-rose-500" />
                      <input value={address.country} onChange={(event) => updateAddress(address.id, 'country', event.target.value)} placeholder="Country" className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-900 outline-none transition focus:border-rose-500" />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-10 border-t border-zinc-100 pt-6">
                <div className="flex items-center gap-3">
                  <ShoppingBag size={18} className="text-rose-500" />
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-rose-500">Order History</p>
                    <h3 className="mt-1 text-2xl font-black uppercase italic tracking-tighter text-zinc-900">Customer orders</h3>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  {(detail?.orders || []).length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-500">
                      No orders found for this customer.
                    </div>
                  ) : (detail?.orders || []).map((order) => (
                    <div key={`${order.orderId}:${order.createdAt}`} className="rounded-3xl border border-zinc-100 bg-zinc-50 p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">{order.orderId}</p>
                          <p className="mt-2 text-sm font-black text-zinc-900">{order.status}</p>
                          <p className="mt-1 text-xs text-zinc-500">{order.createdAt ? new Date(order.createdAt).toLocaleString() : 'Recent'}</p>
                          {order.trackingNumber ? (
                            <p className="mt-2 text-[11px] font-black uppercase tracking-[0.16em] text-rose-600">Tracking {order.trackingNumber}</p>
                          ) : null}
                        </div>
                        <p className="text-lg font-black text-zinc-900">{formatCurrency(order.total)}</p>
                      </div>
                      <div className="mt-4 space-y-2 text-sm text-zinc-600">
                        {(order.items || []).map((item, index) => (
                          <div key={`${item.productId || item.name}-${index}`} className="flex items-center justify-between gap-4">
                            <span>{item.qty} x {item.name}</span>
                            <span className="font-bold text-zinc-900">{formatCurrency(item.price)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}