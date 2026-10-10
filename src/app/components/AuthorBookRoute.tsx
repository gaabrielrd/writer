import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation, useParams } from 'react-router';
import { useAuth } from '@/features/auth';
import { getBook } from '@/features/books';
import { LoadingState, ErrorState, Button } from '@/shared/ui';

/** Authorization is enforced again by Firestore; this boundary keeps author UI private. */
export function AuthorBookRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { bookId } = useParams();
  const location = useLocation();
  const [access, setAccess] = useState<{ key: string; state: 'allowed' | 'denied' | 'error' }>();
  const [attempt, setAttempt] = useState(0);
  const key = `${user?.uid ?? ''}:${bookId ?? ''}`;

  useEffect(() => {
    let active = true;
    if (loading || !user || !bookId) return;
    void getBook(bookId).then(
      (book) => {
        if (active) setAccess({ key, state: book?.authorId === user.uid ? 'allowed' : 'denied' });
      },
      (error: unknown) => {
        if (!active) return;
        const denied =
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'permission-denied';
        setAccess({ key, state: denied ? 'denied' : 'error' });
      },
    );
    return () => {
      active = false;
    };
  }, [user, bookId, key, attempt, loading]);

  if (loading) return <LoadingState label="Verificando sessão..." />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!bookId || (access?.key === key && access.state === 'denied'))
    return <Navigate to="/" replace />;
  if (access?.key !== key) return <LoadingState label="Verificando acesso à obra..." />;
  if (access.state === 'error')
    return (
      <ErrorState
        title="Não foi possível verificar seu acesso"
        description="Confira sua conexão e tente novamente."
        action={<Button onClick={() => setAttempt((value) => value + 1)}>Tentar novamente</Button>}
      />
    );
  return children;
}
