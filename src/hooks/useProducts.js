import { useState, useEffect } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { APP_CONFIG } from '../constants/appConstants';

export function useProducts() {
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setIsLoading(true);
        setError(null);

        let token = null;

        try {
          const session = await fetchAuthSession();
          token = session.tokens?.idToken?.toString(); 
          setUserEmail(session.tokens?.idToken?.payload?.email || '');
        } catch (e) {
          // Silent fail - we just stay as a guest
          console.log("Browsing as guest");
        }

        const headers = { 'Content-Type': 'application/json' };

        if (token) {
          // Try removing 'Bearer ' and just send the raw token string
          headers['Authorization'] = token; 
        }

        const response = await fetch(`${APP_CONFIG.API_URL}/products`, {
          method: 'GET',
          headers: headers 
        });
        if (!response.ok) {
          throw new Error(`Server responded with status: ${response.status}`);
        }

        const result = await response.json();
        
        // 4. Extract and normalize the data
        let productArray = [];
        if (result.body) {
          productArray = typeof result.body === 'string' 
            ? JSON.parse(result.body) 
            : result.body;
        } else if (Array.isArray(result)) {
          productArray = result;
        }

        const cleanData = productArray.map(item => ({
          ...item, // Dynamic mapping to include isHero and other new fields
          price: Number(item.price) || 0,
          category: item.category || 'Uncategorized',
          images: Array.isArray(item.images) && item.images.filter(Boolean).length > 0
            ? item.images.filter(Boolean).slice(0, 5)
            : [item.imageUrl].filter(Boolean)
        }));

        setProducts(cleanData);
      } catch (err) {
        console.error("useProducts Hook Error:", err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProducts();
  }, []);

  return { products, isLoading, error, userEmail };
}