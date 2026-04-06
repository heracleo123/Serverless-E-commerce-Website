import { useCallback, useEffect, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { APP_CONFIG } from '../constants/appConstants';

export function useProducts() {
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userEmail, setUserEmail] = useState('');

  const fetchProducts = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      let token = null;

      try {
        const session = await fetchAuthSession();
        token = session.tokens?.idToken?.toString();
        setUserEmail(session.tokens?.idToken?.payload?.email || '');
      } catch (e) {
        console.log('Browsing as guest');
      }

      const headers = { 'Content-Type': 'application/json' };

      if (token) {
        headers.Authorization = token;
      }

      const response = await fetch(`${APP_CONFIG.API_URL}/products`, {
        method: 'GET',
        headers,
      });
      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }

      const result = await response.json();

      let productArray = [];
      if (result.body) {
        productArray = typeof result.body === 'string'
          ? JSON.parse(result.body)
          : result.body;
      } else if (Array.isArray(result)) {
        productArray = result;
      }

      const cleanData = productArray.map((item) => ({
        ...item,
        price: Number(item.price) || 0,
        stock: Number(item.stock) || 0,
        reviewCount: Number(item.reviewCount || 0),
        averageRating: Number(item.averageRating || 0),
        category: item.category || 'Uncategorized',
        images: Array.isArray(item.images) && item.images.filter(Boolean).length > 0
          ? item.images.filter(Boolean).slice(0, 5)
          : [item.imageUrl].filter(Boolean),
      }));

      setProducts(cleanData);
    } catch (err) {
      console.error('useProducts Hook Error:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return { products, isLoading, error, userEmail, refreshProducts: fetchProducts };
}