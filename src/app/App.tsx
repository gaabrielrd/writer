import { Home } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router';
import { AuthProvider, AuthButton, CreditsBadge, useAuth } from '@/features/auth';
import { ThemeProvider, ThemeToggle } from '@/shared/theme';
import styles from './App.module.css';

const PROJECT_NAME = 'Writer Assistant';

function AppHeader() {
  const { user } = useAuth();
  const location = useLocation();

  return (
    <header className={styles.header}>
      <div className={styles.topBar}>
        <Link to="/" className={styles.brand} aria-label="Writer Assistant Início">
          <span className={styles.brandText}>{PROJECT_NAME}</span>
        </Link>
        <div className={styles.userBar}>
          {user && <CreditsBadge credits={user.credits} tier={user.tier} />}
          <ThemeToggle />
          <AuthButton />
        </div>
      </div>
      {user && (
        <nav className={styles.nav} aria-label="Navegação principal">
          <Link
            to="/"
            className={location.pathname === '/' ? styles.navLinkActive : styles.navLink}
          >
            <Home className="icon icon-sm" aria-hidden="true" />
            <span>Meus Livros</span>
          </Link>
        </nav>
      )}
    </header>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] transition-colors selection:bg-[hsl(var(--primary))]/20">
          <div className={styles.appWrapper}>
            <AppHeader />
            <main className={styles.mainContent}>
              <Outlet />
            </main>
          </div>
        </div>
      </AuthProvider>
    </ThemeProvider>
  );
}
