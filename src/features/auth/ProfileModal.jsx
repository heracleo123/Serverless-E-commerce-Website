import React, { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Loader2, Mail, MapPin, Plus, Save, ShieldCheck, Trash2, User, X } from 'lucide-react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { APP_CONFIG } from '../../constants/appConstants';

const ADULT_AGE_YEARS = 18;

const getMaximumBirthDate = () => {
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - ADULT_AGE_YEARS);
  return cutoffDate.toISOString().slice(0, 10);
};

const isAdultBirthDate = (value) => {
  if (!value) {
    return true;
  }

  return value <= getMaximumBirthDate();
};

const createEmptyAddress = (index = 1) => ({
  id: `address-${Date.now()}-${index}`,
  label: index === 1 ? 'Primary Address' : `Address ${index}`,
  fullName: '',
  line1: '',
  line2: '',
  city: '',
  province: '',
  postalCode: '',
  country: 'Canada',
});

const normalizeGroups = (groups) => (Array.isArray(groups) ? groups : []);

export default function ProfileModal({ isOpen, onClose, user, onProfileSaved }) {
  const [addresses, setAddresses] = useState([]);
  const [defaultAddressId, setDefaultAddressId] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const email = user?.signInDetails?.loginId || user?.attributes?.email || '';
  const userId = user?.userId || user?.username || '';
  const groups = normalizeGroups(user?.signInUserSession?.accessToken?.payload?.['cognito:groups'] || user?.tokens?.accessToken?.payload?.['cognito:groups']);
  const isAdmin = groups.includes('Admins');
  const maxBirthDate = useMemo(() => getMaximumBirthDate(), []);

  const hasValidAddress = useMemo(
    () => addresses.some((address) => address.fullName && address.line2 && address.line1 && address.city && address.province && address.postalCode),
    [addresses]
  );

  useEffect(() => {
    if (!isOpen || !user) {
      return;
    }

    const loadProfile = async () => {
      try {
        setIsLoading(true);
        setErrorMessage('');
        setSuccessMessage('');

        const session = await fetchAuthSession();
        const token = session.tokens?.idToken?.toString();

        if (!token) {
          throw new Error('No valid session found.');
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

        const nextAddresses = Array.isArray(data.addresses) ? data.addresses : [];

        setAddresses(nextAddresses);
        setDefaultAddressId(data.defaultAddressId || nextAddresses[0]?.id || '');
        setBirthDate(data.birthDate || '');
      } catch (error) {
        console.error('Profile load failed:', error);
        setErrorMessage(error.message || 'Unable to load your saved addresses.');
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, [isOpen, user]);

  if (!isOpen || !user) {
    return null;
  }

  const updateAddress = (addressId, field, value) => {
    setAddresses((current) => current.map((address) => (
      address.id === addressId ? { ...address, [field]: value } : address
    )));
  };

  const addAddress = () => {
    setAddresses((current) => {
      if (current.length >= 5) {
        return current;
      }

      return [...current, createEmptyAddress(current.length + 1)];
    });
  };

  const removeAddress = (addressId) => {
    setAddresses((current) => {
      const next = current.filter((address) => address.id !== addressId);
      if (defaultAddressId === addressId) {
        setDefaultAddressId(next[0]?.id || '');
      }
      return next;
    });
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setErrorMessage('');
      setSuccessMessage('');

      if (!isAdultBirthDate(birthDate)) {
        throw new Error('Users must be at least 18 years old.');
      }

      const filteredAddresses = addresses.filter((address) => (
        address.fullName.trim() && address.line1.trim() && address.city.trim() && address.province.trim() && address.postalCode.trim()
      ));

      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      if (!token) {
        throw new Error('No valid session found.');
      }

      const response = await fetch(`${APP_CONFIG.API_URL}/profile`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          addresses: filteredAddresses,
          defaultAddressId: filteredAddresses.some((address) => address.id === defaultAddressId)
            ? defaultAddressId
            : filteredAddresses[0]?.id || null,
          birthDate: birthDate || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Unable to save profile.');
      }

      setAddresses(data.addresses?.length ? data.addresses : []);
      setDefaultAddressId(data.defaultAddressId || data.addresses?.[0]?.id || '');
      setBirthDate(data.birthDate || '');
      setSuccessMessage('Profile updated.');
      onProfileSaved?.(data);
    } catch (error) {
      console.error('Profile save failed:', error);
      setErrorMessage(error.message || 'Unable to save your addresses.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />

      <div className="relative max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-[2.5rem] border border-zinc-100 bg-white shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="relative bg-zinc-900 p-8 text-white">
          <button
            onClick={onClose}
            className="absolute right-6 top-6 rounded-full p-2 transition-colors hover:bg-white/10"
          >
            <X size={20} />
          </button>

          <div className="mb-4 flex h-20 w-20 rotate-3 items-center justify-center rounded-3xl bg-rose-500 shadow-lg">
            <User size={40} className="-rotate-3 text-white" />
          </div>

          <h2 className="text-3xl font-black uppercase italic tracking-tighter">Account Profile</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {isAdmin ? (
              <span className="flex items-center gap-1 rounded-full bg-rose-500 px-3 py-1 text-[9px] font-black uppercase tracking-widest">
                <ShieldCheck size={10} /> System Admin
              </span>
            ) : null}
            <span className="flex items-center gap-1 rounded-full bg-zinc-700 px-3 py-1 text-[9px] font-black uppercase tracking-widest">
              <BadgeCheck size={10} /> Verified User
            </span>
          </div>
        </div>

        <div className="grid max-h-[calc(92vh-13rem)] gap-0 overflow-y-auto lg:grid-cols-[0.8fr_1.2fr]">
          <aside className="border-b border-zinc-100 bg-zinc-50 p-8 lg:border-b-0 lg:border-r">
            <div className="space-y-4">
              <div className="rounded-2xl border border-zinc-100 bg-white p-4">
                <div className="flex items-center gap-3 text-zinc-500">
                  <Mail size={16} />
                  <span className="text-[9px] font-black uppercase tracking-widest">Email Address</span>
                </div>
                <p className="mt-2 break-all text-sm font-bold text-zinc-900">{email}</p>
              </div>

              <div className="rounded-2xl border border-zinc-100 bg-white p-4">
                <div className="flex items-center gap-3 text-zinc-500">
                  <ShieldCheck size={16} />
                  <span className="text-[9px] font-black uppercase tracking-widest">User ID</span>
                </div>
                <p className="mt-2 truncate text-[10px] font-mono font-bold text-zinc-500">{userId}</p>
              </div>

              <div className="rounded-2xl border border-zinc-100 bg-white p-4">
                <div className="flex items-center gap-3 text-zinc-500">
                  <MapPin size={16} />
                  <span className="text-[9px] font-black uppercase tracking-widest">Address Status</span>
                </div>
                <p className="mt-2 text-sm font-bold text-zinc-900">
                  {hasValidAddress ? 'Default shipping address saved' : 'No address saved'}
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-100 bg-white p-4">
                <div className="flex items-center gap-3 text-zinc-500">
                  <BadgeCheck size={16} />
                  <span className="text-[9px] font-black uppercase tracking-widest">Birthdate</span>
                </div>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(event) => setBirthDate(event.target.value)}
                  max={maxBirthDate}
                  className="mt-3 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-900 outline-none transition focus:border-rose-500"
                />
                <p className="mt-2 text-xs text-zinc-500">Optional, but any saved birthdate must be at least 18 years ago.</p>
              </div>
            </div>
          </aside>

          <section className="p-8">
            <div className="flex items-center justify-between gap-4 border-b border-zinc-100 pb-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-rose-500">Saved Addresses</p>
                <h3 className="mt-2 text-2xl font-black uppercase italic tracking-tighter text-zinc-900">Manage delivery details</h3>
              </div>
              <button
                type="button"
                onClick={addAddress}
                disabled={addresses.length >= 5}
                className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-700 transition hover:border-rose-300 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus size={14} /> Add Address
              </button>
            </div>

            {errorMessage ? <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{errorMessage}</p> : null}
            {successMessage ? <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{successMessage}</p> : null}

            {isLoading ? (
              <div className="flex items-center gap-3 py-16 text-zinc-500">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-sm font-bold">Loading profile...</span>
              </div>
            ) : (
              <div className="mt-6 space-y-5">
                {addresses.length === 0 ? (
                  <div className="rounded-[2rem] border border-dashed border-zinc-200 bg-zinc-50 p-6 text-center">
                    <p className="text-sm font-black text-zinc-900">No address saved.</p>
                    <p className="mt-2 text-sm text-zinc-500">Add an address when you are ready to use checkout delivery details.</p>
                  </div>
                ) : null}
                {addresses.map((address, index) => (
                  <div key={address.id} className="rounded-[2rem] border border-zinc-200 bg-zinc-50 p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="defaultAddress"
                          checked={defaultAddressId === address.id}
                          onChange={() => setDefaultAddressId(address.id)}
                          className="h-4 w-4 accent-rose-500"
                        />
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Default Address</p>
                          <p className="text-sm font-black text-zinc-900">Address {index + 1}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAddress(address.id)}
                        disabled={addresses.length === 1}
                        className="inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 size={14} /> Remove
                      </button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <input value={address.label} onChange={(event) => updateAddress(address.id, 'label', event.target.value)} placeholder="Label" className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-900 outline-none transition focus:border-rose-500" />
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
            )}

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={handleSave}
                disabled={isLoading || isSaving}
                className="inline-flex items-center gap-2 rounded-2xl bg-zinc-900 px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:bg-zinc-400"
              >
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {isSaving ? 'Saving Profile' : 'Save Profile'}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}