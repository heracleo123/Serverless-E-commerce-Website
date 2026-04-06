import { APP_CONFIG } from '../constants/appConstants';

/**
 * API Service
 * Centralized API communication layer for all frontend requests
 */

const API_BASE_URL = APP_CONFIG.API_URL;

/**
 * Fetch products from API
 */
export const fetchProducts = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/products`);
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch products:', error);
    throw error;
  }
};

/**
 * Fetch user orders
 */
export const fetchOrders = async (token) => {
  try {
    const response = await fetch(`${API_BASE_URL}/orders`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch orders:', error);
    throw error;
  }
};

/**
 * Create a new order
 */
export const createOrder = async (orderData, token) => {
  try {
    const response = await fetch(`${API_BASE_URL}/process-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(orderData),
    });
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to create order:', error);
    throw error;
  }
};

export default {
  fetchProducts,
  fetchOrders,
  createOrder,
};
