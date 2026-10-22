import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { homePathFor, useAuth } from '../lib/auth';
import type { Role } from '../lib/types';
import { Spinner } from './ui';

/** Renders children only for a logged-in user with the given role. */
export function ProtectedRoute({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  // Logged in with the wrong role: send them to their own portal.
  if (user.role !== role) return <Navigate to={homePathFor(user)} replace />;
  return <>{children}</>;
}
