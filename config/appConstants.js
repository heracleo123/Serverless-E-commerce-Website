export const APP_CONFIG = {
  NAME: 'ElectroTech',
  SUFFIX: ' Store',
  YEAR: 2026,
  DEVELOPER: 'WJL', 
  
  // Pull from .env if available, otherwise use your current values as fallback
  API_URL: import.meta.env.VITE_API_URL || 'https://wf0kabz6g9.execute-api.us-east-1.amazonaws.com/prod',
  CDN_URL: import.meta.env.VITE_CDN_URL || 'https://d38dfkkkqrdh6x.cloudfront.net',
  
  // Cognito Configuration
  COGNITO: {
    REGION: import.meta.env.VITE_COGNITO_REGION || 'us-east-1',
    USER_POOL_ID: import.meta.env.VITE_COGNITO_USER_POOL_ID || 'us-east-1_77jG2yxFe',
    USER_POOL_CLIENT_ID: import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID || '12pv8a5bgego6i9lgdgi9es7r',
    DOMAIN: import.meta.env.VITE_COGNITO_DOMAIN || 'cognito-idp.us-east-1.amazonaws.com/us-east-1_77jG2yxFe',
  },
};

export const CATEGORIES = [
  'All',
  'Laptops',
  'Mobile Phones',
  'Accessories',
];

export const UI_STRINGS = {
  HERO_TITLE: 'Best Deals',
  HERO_SUBTITLE: 'High-performance electronics',
  FOOTER_TEXT: 'Developed by Daemon Hunters',
  SECURE_PAYMENT: 'Secure Checkout via Stripe',
  EMPTY_CART: 'Your cart is empty. Start shopping!',
};

export const COLORS = {
  PRIMARY: "#e11d48",
  PRIMARY_HOVER: "#be123c",
};
