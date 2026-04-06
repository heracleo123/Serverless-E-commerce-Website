import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { fetchAuthSession } from 'aws-amplify/auth';

export default function ProtectedRoute({ children }) {
  const { authStatus } = useAuthenticator((context) => [context.authStatus]);
  const [isAdmin, setIsAdmin] = useState(null); // Use null for "loading" state
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const session = await fetchAuthSession();
        // Check both tokens for the groups claim
        const groups = session.tokens?.accessToken?.payload?.['cognito:groups'] || 
                       session.tokens?.idToken?.payload?.['cognito:groups'] || 
                       [];
        
        setIsAdmin(groups.includes('Admins'));
      } catch (err) {
        console.error("Session check failed:", err);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    if (authStatus === 'authenticated') {
      checkAccess();
    } else if (authStatus === 'unauthenticated') {
      setIsAdmin(false);
      setLoading(false);
    }
  }, [authStatus]);

  // Show a loader while we are verifying the session
  if (authStatus === 'configuring' || loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-rose-600"></div>
      </div>
    );
  }

  // Final Gate
  if (authStatus !== 'authenticated' || isAdmin === false) {
    return <Navigate to="/" replace />;
  }

  return children;
}