import { useAuthenticator } from '@aws-amplify/ui-react';
import { Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchAuthSession, signIn } from 'aws-amplify/auth';

export default function AuthModal({ isOpen, onClose }) {
  const { authStatus } = useAuthenticator((context) => [context.authStatus]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const verifyToken = async () => {
      if (authStatus === 'authenticated' && isOpen) {
        try {
          await fetchAuthSession();
          onClose();
        } catch (err) {
          console.error("Auth session failed:", err);
        }
      }
    };

    verifyToken();
  }, [authStatus, isOpen, onClose]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const result = await signIn({
        username: email.trim(),
        password,
        options: {
          authFlowType: 'USER_PASSWORD_AUTH',
        },
      });

      if (result.isSignedIn) {
        await fetchAuthSession({ forceRefresh: true });
        window.location.reload();
        return;
      }

      setErrorMessage('Sign-in is incomplete. Please try again.');
    } catch (error) {
      console.error('Sign-in failed:', error);
      setErrorMessage('Invalid username or password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-zinc-900/90 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal Card */}
      <div className="relative bg-white rounded-[2rem] p-8 shadow-2xl animate-in zoom-in duration-300 min-width: max-content;">
        {/* Close Button: Allows user to exit the login flow without signing in */}
        <button onClick={onClose} className="absolute top-6 right-6 text-zinc-400 hover:text-black">
          <X size={20} />
        </button>

        <div className="mb-6">
          <h2 className="text-2xl font-black uppercase italic tracking-tighter">ElectroTech Access Portal</h2>
          <p className="text-[10px] text-rose-500 font-bold uppercase tracking-[0.2em]">Secure Gateway</p>
        </div>

        <form onSubmit={handleSubmit} className="w-[min(26rem,80vw)] space-y-4">
          <div>
            <label htmlFor="email" className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-900 outline-none transition focus:border-rose-500"
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-900 outline-none transition focus:border-rose-500"
              autoComplete="current-password"
              required
            />
          </div>

          {errorMessage ? (
            <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {errorMessage}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
            {isSubmitting ? 'Signing In' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}