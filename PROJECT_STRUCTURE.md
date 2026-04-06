# ElectroTech Project Structure

Industry-standard folder organization for a full-stack serverless e-commerce application.

## 📁 Project Organization

```
elec trotech/
├── src/                          # Frontend React application
│   ├── components/               # Reusable UI components
│   ├── pages/                    # Page-level components
│   ├── hooks/                    # Custom React hooks
│   ├── services/                 # API & external services
│   ├── utils/                    # Helper functions
│   ├── constants/                # App constants
│   ├── styles/                   # Global CSS and utilities
│   ├── features/                 # Feature modules
│   ├── assets/                   # Images, fonts, icons
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
│
├── config/                       # Configuration files
│   ├── appConstants.js           # App config & endpoints
│   ├── Products.json             # Product seed data
│   └── README.md
│
├── lambda/                       # Backend serverless functions
│   ├── functions/                # Individual Lambda handlers
│   │   ├── GetProductsHandler.js
│   │   ├── GetOrders.js
│   │   ├── ProcessOrders.js
│   │   ├── StripeWebhook.js
│   │   └── ProductManager.js
│   ├── shared/                   # Shared utilities
│   ├── README.md
│   └── package.json
│
├── terraform/                    # Infrastructure as Code
│   ├── main.tf
│   ├── variables.tf
│   ├── outputs.tf
│   ├── versions.tf
│   ├── terraform.tfvars
│   └── packages/                 # Zipped Lambda functions
│
├── scripts/                      # Build and deployment scripts
│   └── seed-products.js          # Database seeding
│
├── public/                       # Static files
├── ProductImages/                # Product images (uploaded to S3)
│
├── package.json                  # Frontend & shared dependencies
├── vite.config.js                # Vite configuration
├── eslint.config.js              # ESLint configuration
├── tsconfig.json                 # TypeScript configuration (if needed)
├── .gitignore                    # Git ignore rules
├── README.md                     # Project documentation
└── index.html                    # HTML entry point

```

## 📚 Folder Purposes

### `src/` - Frontend Application
The React application and all frontend code.
- **components/** - Reusable UI components (ProductCard, CartDrawer, etc.)
- **pages/** - Page-level components (home, admin, checkout)
- **services/** - API communication and external service integrations
- **hooks/** - Custom React hooks for shared logic
- **utils/** - Utility functions and helpers
- **constants/** - Centralized constants and configuration
- **styles/** - Global CSS and utility classes
- **assets/** - Images, fonts, and static assets

### `config/` - Configuration
Centralized configuration and data files.
- **appConstants.js** - API endpoints, Cognito config, UI strings
- **Products.json** - Product database seed data

### `lambda/` - Backend
Serverless Lambda functions for API endpoints.
- **functions/** - Individual Lambda handler functions
- **shared/** - Shared utilities and middleware (for future modules)

### `terraform/` - Infrastructure
Infrastructure as Code using Terraform.
- **main.tf** - AWS resources definition
- **variables.tf** - Input variables
- **outputs.tf** - Output values
- **versions.tf** - Provider configuration
- **packages/** - Zipped Lambda functions (generated)

### `scripts/` - Automation
Build, deployment, and utility scripts.
- **seed-products.js** - Database seeding script

## 🚀 Getting Started

### Frontend Development
```bash
cd elec trotech
npm install
npm run dev      # Start dev server on http://localhost:5173
```

### Backend Deployment
```bash
cd terraform
terraform plan   # Review infrastructure changes
terraform apply  # Deploy to AWS
```

### Database Seeding
```bash
node scripts/seed-products.js --table Products --file src/Products.json --region us-east-1
```

## 📋 Key Updates

From the old structure:
- ❌ **Removed**: `LambdaHandlers/` at root level
- ✅ **Added**: `lambda/functions/` - proper backend organization
- ❌ **Deprecated**: `src/constants/` holds only appConstants.js
- ✅ **Created**: `config/` folder for all configuration
- ✅ **Created**: `src/services/` for API communication
- ✅ **Updated**: `src/styles/` for centralized styling

## 🔧 Import Patterns

**Configuration imports:**
```javascript
import { APP_CONFIG, CATEGORIES } from '../../config/appConstants';
```

**Service imports:**
```javascript
import { fetchProducts, fetchOrders } from '../services/api';
```

**Component imports:**
```javascript
import { ProductCard } from '../components/ProductCard';
```

## 📚 Additional Documentation

- See `src/README.md` for frontend details
- See `lambda/README.md` for backend function details
- See `config/README.md` for configuration details
- See `terraform/README.md` for infrastructure details
