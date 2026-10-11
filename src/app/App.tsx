import { Feather } from 'lucide-react';
import { Link, Outlet } from 'react-router';
import { AuthProvider, AuthButton, CreditsBadge, useAuth } from '@/features/auth';
import { BookNavigation } from '@/features/books';
import { ThemeProvider, ThemeToggle } from '@/shared/theme';
import { AISettingsProvider, useAISettings } from '@/features/ai-assistant';
import styles from './App.module.css';

const PROJECT_NAME = 'Writer Assistant';

function AppHeader() {
  const { user } = useAuth();
  const openAISettings = useAISettings();

  return (
    <header className={`${styles.header} glass-surface`}>
      <div className={styles.topBar}>
        <div className={styles.leftBar}>
          <Link to="/" className={styles.brand} aria-label="Writer Assistant Início">
            <span className={styles.brandMark}>
              <Feather className="icon" aria-hidden="true" />
            </span>
            <span className={styles.brandText}>{PROJECT_NAME}</span>
          </Link>
          <BookNavigation />
        </div>
        <div className={styles.userBar}>
          {user && <CreditsBadge credits={user.credits} tier={user.tier} />}
          <ThemeToggle />
          <AuthButton onOpenAISettings={openAISettings} />
        </div>
      </div>
    </header>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AISettingsProvider>
          <div className={styles.appBackdrop}>
            <div className={styles.appWrapper}>
              <a href="#main-content" className={styles.skipLink}>
                Pular para o conteúdo
              </a>
              <AppHeader />
              <main id="main-content" tabIndex={-1} className={styles.mainContent}>
                <Outlet />
              </main>
            </div>
          </div>
        </AISettingsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
