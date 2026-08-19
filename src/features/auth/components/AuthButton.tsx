import { LogIn, LogOut, User } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/shared/ui';
import { useAuth } from '../hooks/useAuth';
import styles from './AuthButton.module.css';

export function AuthButton() {
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className={styles.container}>
        <span className={styles.name}>Carregando...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <Link to="/login">
        <Button variant="secondary">
          <LogIn className="icon icon-sm" aria-hidden="true" />
          Entrar
        </Button>
      </Link>
    );
  }

  const displayName = user.displayName || user.email || 'Autor';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className={styles.container}>
      <div className={styles.profile} title={user.email ?? displayName}>
        {user.photoUrl ? (
          <img src={user.photoUrl} alt={`Foto de ${displayName}`} className={styles.avatar} />
        ) : (
          <span className={styles.avatarFallback}>
            {initial || <User className="icon icon-sm" aria-hidden="true" />}
          </span>
        )}
        <span className={styles.name}>{displayName}</span>
      </div>
      <Button
        variant="secondary"
        onClick={() => {
          void signOut();
        }}
        title="Encerrar sessão"
      >
        <LogOut className="icon icon-sm" aria-hidden="true" />
        Sair
      </Button>
    </div>
  );
}
