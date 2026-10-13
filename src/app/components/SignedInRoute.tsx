import { Fragment, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '@/features/auth';
import { LoadingState } from '@/shared/ui';

export function SignedInRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingState label="Carregando sua sessão..." />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Fragment key={user.uid}>{children}</Fragment>;
}
