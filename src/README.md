# Frontend Source Code

React application for the ElectroTech e-commerce platform.

## Structure

```
src/
├── components/        # Reusable UI components
│   ├── AuthModal.jsx
│   ├── CartDrawer.jsx
│   ├── Checkout.jsx
│   ├── OrdersDrawer.jsx
│   ├── ProductCard.jsx
│   └── ProductModal.jsx
├── pages/            # Page-level components
├── hooks/            # Custom React hooks
├── services/         # API and external service calls
│   └── api.js        # Centralized API communication
├── utils/            # Utility functions and helpers
├── constants/        # Application constants
├── styles/           # Global styles and CSS
│   └── index.css
├── assets/           # Images, fonts, icons
├── features/         # Feature-based modules (if applicable)
├── App.jsx           # Root component
├── main.jsx          # React application entry point
└── index.css         # Global styles (imported in main.jsx)
```

## Key Files

- **App.jsx** - Main application component and routing
- **main.jsx** - Entry point that mounts the React app
- **services/api.js** - Centralized API service for all backend communication

## Import Paths

When importing files in this folder structure:

```javascript
// Import from services
import { fetchProducts, fetchOrders } from '../services/api';

// Import from config
import { APP_CONFIG, CATEGORIES } from '../../config/appConstants';

// Import from hooks
import { useCustomHook } from '../hooks/useCustomHook';

// Import from utils
import { helperFunction } from '../utils/helpers';
```

## Running the App

```bash
npm run dev        # Start development server
npm run build      # Build for production
npm run preview    # Preview production build
```
