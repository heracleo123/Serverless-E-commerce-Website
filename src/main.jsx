import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import App from './App.jsx'

// 1. Import the Amplify Library AND the Provider
import { Amplify } from 'aws-amplify'
import { Authenticator } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css';
import { APP_CONFIG } from './constants/appConstants'

// 2. Configure with specific AWS details
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: APP_CONFIG.COGNITO.USER_POOL_ID,
      userPoolClientId: APP_CONFIG.COGNITO.USER_POOL_CLIENT_ID,
      loginWith: {
        email: true,
      },
    },
  },
  API: {
    REST: {
      ElectroTechAPI: {
        endpoint: APP_CONFIG.API_URL,
        region: APP_CONFIG.COGNITO.REGION
      }
    }
  }
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Wrap App here so useAuthenticator works everywhere */}
    <Authenticator.Provider>
      <App />
    </Authenticator.Provider>
  </StrictMode>,
)
