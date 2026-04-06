import React, { useState, useMemo, useEffect } from 'react';

/* --- 1. COMPONENT & HOOK IMPORTS --- */
// Import libraries
import { Loader2, AlertCircle } from 'lucide-react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { fetchAuthSession } from 'aws-amplify/auth';

// LAYOUT & UI
import NavBar from '../../components/layout/NavBar.jsx'; 
import Footer from '../../components/layout/Footer.jsx';
import AuthModal from '../../features/auth/AuthModal.jsx';
import ProfileModal from '../../features/auth/ProfileModal.jsx';
import SuccessOverlay from '../../components/ui/SuccessOverlay.jsx';

// FEATURE COMPONENTS (Same folder or neighbor folder)
import ProductModal from "./ProductModal.jsx";
import ProductCard from "./ProductCard.jsx";
import CartDrawer from "./CartDrawer.jsx";
import OrdersDrawer from "./OrdersDrawer.jsx";
import FeaturedCarousel from './FeaturedCarousel.jsx';

// HOOKS & CONSTANTS
import { useProducts } from '../../hooks/useProducts.js';
import { useCart } from '../../hooks/useCart.js';
import { APP_CONFIG, CATEGORIES, UI_STRINGS } from '../../constants/appConstants.js';

export default function Home() {
  /* --- 2. GLOBAL AUTHENTICATION --- */
  // Accesses the Cognito user state. 'authUser' tells us if the user is logged in.
  const { user: authUser, signOut: amplifySignOut} = useAuthenticator((context) => [context.user]);
  
  /* --- 3. UI STATE MANAGEMENT --- */
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showCartDrawer, setShowCartDrawer] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showOrdersDrawer, setShowOrdersDrawer] = useState(false);
  const [orders, setOrders] = useState([]);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [, setProfile] = useState(null);
  const [ordersError, setOrdersError] = useState('');
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [isResendingOrder, setIsResendingOrder] = useState('');
  const { products, isLoading, error, refreshProducts } = useProducts();
  const { cart, addToCart, removeFromCart, updateQty, clearCart, cartCount } = useCart(setShowCartDrawer);  

  /* --- 4. STRIPE SUCCESS DETECTION (POST-PAYMENT) --- */
  useEffect(() => {
    // Check the URL for '?success=true' redirected from Stripe
    const query = new URLSearchParams(window.location.search);
    if (query.get('success') === 'true') {
      clearCart();  // Wipe the local cart state
      setShowSuccess(true); // Trigger the "Payment Received" visual overlay
      setShowCartDrawer(false); 
      // Clean up the URL so the success message doesn't reappear on refresh
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [clearCart]);

  useEffect(() => {
    const loadProfile = async () => {
      if (!authUser) {
        setProfile(null);
        return;
      }

      try {
        const session = await fetchAuthSession();
        const token = session.tokens?.idToken?.toString();

        if (!token) {
          return;
        }

        const response = await fetch(`${APP_CONFIG.API_URL}/profile`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || 'Unable to load profile.');
        }

        setProfile(data);

      } catch (error) {
        console.error('Profile bootstrap failed:', error);
      }
    };

    loadProfile();
  }, [authUser]);

  /* --- 5. AUTHORIZED DATA FETCHING --- */
  const fetchOrders = async () => {
    // Security: If not logged in, prompt the AuthModal
    if (!authUser) return setShowAuthModal(true);

    try {
      setIsLoadingOrders(true);
      setOrdersError('');
      // Retrieve the fresh from the current Cognito session
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      if (!token) {
        console.error("No valid session found");
        return setShowAuthModal(true);
      }

      // Secure API Call: Passing the Bearer Token to the Lambda via API Gateway
      const res = await fetch(`${APP_CONFIG.API_URL}/orders`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) {
        if (res.status === 401) alert("Session expired. Please log in again.");
        throw new Error(`Server error: ${res.status}`);
      }

      const data = await res.json();
      const parsedOrders = Array.isArray(data)
        ? data
        : Array.isArray(data.body)
          ? data.body
          : typeof data.body === 'string'
            ? JSON.parse(data.body)
            : [];

      setOrders(parsedOrders || []);
      setShowOrdersDrawer(true);
    } catch (err) {
      console.error("Order fetch failed:", err);
      setOrdersError('Unable to load your orders right now.');
      setShowOrdersDrawer(true);
    } finally {
      setIsLoadingOrders(false);
    }
  };

  const handleResendOrderConfirmation = async (order, targetEmail) => {
    try {
      setIsResendingOrder(`${order.orderId}:${order.createdAt}`);
      setOrdersError('');

      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      if (!token) {
        throw new Error('No valid session found');
      }

      const res = await fetch(`${APP_CONFIG.API_URL}/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orderId: order.orderId,
          createdAt: order.createdAt,
          targetEmail
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || `Server error: ${res.status}`);
      }

      alert(data.message || 'Confirmation resent successfully.');
    } catch (err) {
      console.error('Order resend failed:', err);
      alert(err.message || 'Unable to resend the order confirmation right now.');
    } finally {
      setIsResendingOrder('');
    }
  };
  
  const handleOpenProductModal = (productId) => {
    const product = products.find(p => p.productId === productId);
    if (product) setSelectedProduct(product);
  };

  useEffect(() => {
    if (!selectedProduct) {
      return;
    }

    const latestProduct = products.find((product) => product.productId === selectedProduct.productId);
    if (latestProduct) {
      setSelectedProduct(latestProduct);
    }
  }, [products, selectedProduct]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => (
      (activeCategory.toLowerCase() === 'all' || p.category === activeCategory) &&
      p.name?.toLowerCase().includes(searchQuery.toLowerCase())
    ));
  }, [products, activeCategory, searchQuery]);

  // Create the featured list
  const featuredProducts = useMemo(() => {
    if (!products) return [];
    const featured = products.filter(p => 
      p.isFeatured === true || 
      p.isFeatured === "true" ||
      p.isFeatured === 1
    );
    return featured.length > 0 ? featured : products.slice(0, 5);
  }, [products]);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <SuccessOverlay isVisible={showSuccess} onClose={() => setShowSuccess(false)} />

      <NavBar 
        cartCount={cartCount}
        authUser={authUser}
        onSignOut={amplifySignOut}
        onOpenCart={() => setShowCartDrawer(true)}
        onOpenOrders={fetchOrders}
        onOpenAuth={() => setShowAuthModal(true)}
        onOpenProfile={() => setShowProfileModal(true)}

      />

      <main className="max-w-7xl mx-auto px-6 py-12 w-full flex-grow">
        <header className="mb-12">
          <h1 className="text-5xl md:text-7xl font-black uppercase italic tracking-tighter text-zinc-900">
            {UI_STRINGS.HERO_TITLE}
          </h1>
          <p className="text-zinc-400 text-xs border-l-4 border-rose-500 pl-4 uppercase tracking-[0.3em] font-bold mt-6">
            {UI_STRINGS.HERO_SUBTITLE}
          </p>
          
        </header>
        
        {featuredProducts.length > 0 && (
          <div className="mb-16 rounded-3xl overflow-hidden shadow-2xl">
            <FeaturedCarousel ads={featuredProducts} onShopNow={handleOpenProductModal} />
          </div>
        )}
        
        <div className="flex flex-wrap gap-3 mb-12">
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className={`px-6 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-full transition-all border-2 
              ${activeCategory === cat ? 'bg-zinc-900 text-white border-zinc-900' : 'text-zinc-400 border-zinc-100 hover:border-zinc-300'}`}>
              {cat}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center py-32 gap-4">
            <Loader2 className="animate-spin text-rose-500" size={32} />
            <p className="text-[10px] font-black uppercase text-zinc-300 tracking-[0.2em]">Syncing Systems...</p>
          </div>
        ) : error ? (
          <div className="text-center py-20 bg-zinc-50 rounded-3xl border border-dashed border-zinc-200">
            <AlertCircle className="text-rose-500 mx-auto mb-4" size={40} />
            <h2 className="text-sm font-black uppercase">Uplink Failed</h2>
            <button onClick={() => window.location.reload()} className="mt-4 text-[10px] font-black text-rose-500 underline">RETRY</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-12">
            {filteredProducts.map(product => (
              <ProductCard key={product.productId} product={product} onSelect={setSelectedProduct} onAdd={addToCart} />
            ))}
          </div>
        )}
      </main>

      {/* MODALS & DRAWERS */}
      <ProductModal
        product={selectedProduct}
        user={authUser}
        onClose={() => setSelectedProduct(null)}
        onAdd={addToCart}
        onReviewCreated={refreshProducts}
      />
      <CartDrawer isOpen={showCartDrawer} cart={cart} user={authUser} onClose={() => setShowCartDrawer(false)} onRemove={removeFromCart} onClearCart={clearCart} onUpdateQty={updateQty}  />
      <OrdersDrawer
        isOpen={showOrdersDrawer}
        onClose={() => setShowOrdersDrawer(false)}
        orders={orders}
        isLoading={isLoadingOrders}
        error={ordersError}
        onResend={handleResendOrderConfirmation}
        resendInFlightId={isResendingOrder}
      />
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        user={authUser}
        onProfileSaved={(nextProfile) => {
          setProfile(nextProfile);
          setShowProfileModal(false);
        }}
      />

      <Footer />
    </div>
  );
}