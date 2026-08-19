import { Home, Palette } from 'lucide-react';
import { Link, Outlet } from 'react-router';
import { AuthProvider, AuthButton, CreditsBadge, useAuth } from '@/features/auth';
import styles from './App.module.css';

const PROJECT_NAME = 'Writer Assistant';

function AppHeader() {
  const { user } = useAuth();

  return (
    <header className={styles.header}>
      <div className={styles.topBar}>
        <Link to="/" className={styles.brand}>
          <img className={styles.mark} src="/favicon.svg" alt="" width="28" height="28" />
          <h1>{PROJECT_NAME}</h1>
        </Link>
        <div className={styles.userBar}>
          {user && <CreditsBadge credits={user.credits} tier={user.tier} />}
          <AuthButton />
        </div>
      </div>
      <nav className={styles.nav} aria-label="Navegação principal">
        <Link to="/">
          <Home className="icon icon-sm" aria-hidden="true" />
          Início
        </Link>
        <Link to="/styleguide">
          <Palette className="icon icon-sm" aria-hidden="true" />
          Styleguide
        </Link>
      </nav>
    </header>
  );
}

export function App() {
  return (
    <AuthProvider>
      <main className={styles.app}>
        <AppHeader />
        <Outlet />
      </main>
    </AuthProvider>
  );
}
