import React, { useState, useEffect, useRef } from 'react'; // Added useRef
import { ShoppingCart, User, LayoutDashboard, LogOut, ChevronDown, Package } from 'lucide-react';
import logoImg from '../../assets/logo.png';
import { fetchAuthSession } from 'aws-amplify/auth';
import { Link } from 'react-router-dom';


const firstNonEmptyString = (...values) => values.find((value) => String(value || '').trim()) || '';
const joinNameParts = (...parts) => parts.map((part) => String(part || '').trim()).filter(Boolean).join(' ');

export default function NavBar({ cartCount, authUser, profile, onSignOut, onOpenCart, onOpenOrders, onOpenAuth, onOpenProfile}) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false); // Controls the menu
  const dropdownRef = useRef(null); // Helps close the menu if you click outside

  const userEmail = authUser?.signInDetails?.loginId || authUser?.attributes?.email || 'Member';
  const displayName = firstNonEmptyString(
    profile?.displayName,
    joinNameParts(authUser?.attributes?.given_name, authUser?.attributes?.family_name),
    authUser?.attributes?.name,
    userEmail.split('@')[0],
    'Member'
  );

  // Check Admin Status
  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        if (!authUser) { setIsAdmin(false); return; }
        const session = await fetchAuthSession();
        const groups = session.tokens?.accessToken?.payload['cognito:groups'] || [];
        setIsAdmin(groups.includes('Admins'));
      } catch (err) { setIsAdmin(false); }
    };
    checkAdminStatus();
  }, [authUser]);

  // Close dropdown if you click anywhere else on the screen
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <nav className="border-b border-zinc-100 sticky top-0 bg-white/90 backdrop-blur-md z-40 h-20 flex items-center justify-between px-8">
      <Link to="/" className="flex items-center">
        <img src={logoImg} alt="Logo" className="h-10 md:h-12 w-auto object-contain" />
      </Link>

      <div className="flex items-center gap-4">
        {authUser ? (
          <div className="relative" ref={dropdownRef}>
            {/* The Trigger Button */}
            <button 
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-3 bg-zinc-50 hover:bg-zinc-100 px-4 py-2 rounded-full border border-zinc-200 transition-all"
            >
              <div className="w-8 h-8 bg-zinc-900 rounded-full flex items-center justify-center text-white text-[10px] font-black">
                {displayName[0].toUpperCase()}
              </div>
              <span className="hidden md:block text-[10px] font-black uppercase tracking-tight text-zinc-900">
                {displayName}
              </span>
              <ChevronDown size={14} className={`transition-transform duration-300 ${showDropdown ? 'rotate-180' : ''}`} />
            </button>

            {/* The Actual Dropdown Menu */}
            {showDropdown && (
              <div className="absolute right-0 mt-3 w-56 bg-white rounded-2xl shadow-2xl border border-zinc-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="p-4 border-b border-zinc-50">
                  <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Logged in as</p>
                  <p className="text-xs font-black truncate text-zinc-900">{displayName}</p>
                </div>

                <div className="p-2">
                  {/* Account Profile */}
                  <button 
                    onClick={() => { onOpenProfile(); setShowDropdown(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-zinc-600 hover:bg-zinc-50 hover:text-rose-600 rounded-lg transition-colors"
                  >
                    <User size={16} /> My Profile
                  </button>

                  {/* My Orders */}
                  <button 
                    onClick={() => { onOpenOrders(); setShowDropdown(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-zinc-600 hover:bg-zinc-50 hover:text-rose-600 rounded-lg transition-colors"
                  >
                    <Package size={16} /> My Orders
                  </button>

                  {/* Admin Option */}
                  {isAdmin && (
                    <Link 
                      to="/admin"
                      onClick={() => setShowDropdown(false)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors"
                    >
                      <LayoutDashboard size={16} /> Admin Dashboard
                    </Link>
                  )}
                </div>

                {/* Sign Out */}
                <div className="p-2 bg-zinc-50">
                  <button 
                    onClick={onSignOut}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-rose-600 transition-colors"
                  >
                    <LogOut size={16} /> Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <button onClick={onOpenAuth} className="text-[10px] font-black uppercase tracking-widest bg-zinc-900 text-white px-6 py-2.5 rounded-full hover:bg-rose-600">
            Sign In
          </button>
        )}

        {isAdmin ? (
          <Link
            to="/admin"
            className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-white transition hover:bg-rose-600"
          >
            <LayoutDashboard size={18} /> Admin Dashboard
          </Link>
        ) : (
          <button onClick={onOpenCart} className="p-3 bg-zinc-100 rounded-full relative hover:bg-zinc-200">
            <ShoppingCart size={20} className="text-zinc-900" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[9px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-white font-black">
                {cartCount}
              </span>
            )}
          </button>
        )}
      </div>
    </nav>
  );
}