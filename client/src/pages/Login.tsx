import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Wordmark } from '../components/Layout';
import { errorMessage } from '../lib/api';
import { homePathFor, useAuth } from '../lib/auth';

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={homePathFor(user)} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const u = await login(email.trim(), password);
      // Go back to the page that bounced us here, if it belongs to this role's portal.
      const from = (location.state as { from?: string } | null)?.from;
      const home = homePathFor(u);
      navigate(from && from.startsWith(home) ? from : home, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-2xl">
            <Wordmark />
          </div>
          <p className="mt-1 text-sm text-slate-500">Author Support &amp; Communication Portal</p>
        </div>

        <form onSubmit={onSubmit} className="card space-y-4 p-6" noValidate>
          <div>
            <label htmlFor="email" className="label">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="password" className="label">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary w-full" disabled={submitting || !email || !password}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="mt-4 rounded-md border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-600">
          <p className="font-medium text-slate-700">Demo credentials</p>
          <p className="mt-1">Author: any seeded author email (e.g. priya.sharma@email.com) / Author@123</p>
          <p>Admin: admin@bookleaf.test / Admin@123</p>
        </div>
      </div>
    </div>
  );
}
