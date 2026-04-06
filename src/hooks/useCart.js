import { useState, useEffect, useCallback } from 'react';

export function useCart(setShowCartDrawer) {
  /* --- 1. Initialize cart from LocalStorage --- */
  // Use a "Lazy Initializer" function inside useState.
  // It checks LocalStorage so that if the user refreshes the page, their items don't disappear.
  const [cart, setCart] = useState(() => {
    const savedCart = localStorage.getItem('electrotech_cart');
    try {
      return savedCart ? JSON.parse(savedCart) : [];
    } catch (e) {
      return []; // Fallback to empty array if JSON is corrupted
    }
  });

  /* --- 2. Sync cart to LocalStorage --- */
  // Every time the 'cart' state changes, this effect automatically updates the browser's storage.
  useEffect(() => {
    localStorage.setItem('electrotech_cart', JSON.stringify(cart));
  }, [cart]);

  // 3. Add to Cart Logic with Stock Check
  const addToCart = useCallback((product) => {
    setCart((prev) => {
      const exists = prev.find((item) => item.productId === product.productId);
      
      if (exists) {
        // VALIDATION: Prevent users from buying more than what is in the stock
        if (exists.qty + 1 > (product.stock ?? 0)) {
          alert(`Cannot add more. Only ${product.stock} units in stock.`);
          return prev;
        }
        // Increment quantity of existing item
        return prev.map((item) =>
          item.productId === product.productId 
            ? { ...item, qty: item.qty + 1 } 
            : item
        );
      }

      // Validation: Check if at least 1 is in stock for new items
      if ((product.stock ?? 0) < 1) {
        alert("This item is currently out of stock.");
        return prev;
      }

      return [...prev, { ...product, qty: 1 }];
    });
    
    // UI FEEDBACK: Automatically open the cart drawer when an item is added
    if (setShowCartDrawer) setShowCartDrawer(true);
  }, [setShowCartDrawer]);

  // 4. Update Quantity Logic (Sync with your specific request)
  const updateQty = useCallback((productId, newQty) => {
    if (newQty < 1) return;  // Prevent negative or zero quantities

    setCart((prev) =>
      prev.map((item) => {
        if (item.productId === productId) {
          // Check against item.stock (passed from the product object)
          if (newQty > (item.stock ?? 0)) {
            console.warn(`Action blocked: Only ${item.stock} items in stock.`);
            return item; 
          }
          return { ...item, qty: newQty };
        }
        return item;
      })
    );
  }, []);

  // 5. Remove from Cart
  const removeFromCart = useCallback((productId) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  }, []);

  // 6. Clear Cart
  const clearCart = useCallback(() => {
    setCart([]);
    localStorage.removeItem('electrotech_cart');
  }, []);

  // 7. Calculate Totals
  // These values recalculate automatically whenever the 'cart' array changes.
  const cartCount = cart.reduce((total, item) => total + item.qty, 0);
  const cartTotal = cart.reduce((total, item) => total + item.price * item.qty, 0);

  return {
    cart,
    setCart, 
    addToCart,
    updateQty, 
    removeFromCart,
    clearCart,
    cartCount,
    cartTotal
  };
}