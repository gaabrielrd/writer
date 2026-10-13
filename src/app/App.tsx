import { Feather } from 'lucide-react';
import { Link, Outlet } from 'react-router';
import { AuthProvider, AuthButton, CreditsBadge, useAuth } from '@/features/auth';
import { BookNavigation } from '@/features/books';
import { ThemeProvider, ThemeToggle } from '@/shared/theme';
import { AISettingsProvider, useAISettings } from '@/features/ai-assistant';
import { WorkspaceLayoutProvider, useWorkspaceLayout } from '@/shared/ui';
import styles from './App.module.css';
import { StudioNavigation } from './components/StudioNavigation';

const PROJECT_NAME = 'Writer Assistant';

function AppHeader() {
  const { user } = useAuth();
  const { expanded } = useWorkspaceLayout();
  const openAISettings = useAISettings();

  return (
    <header className={`${styles.header} glass-surface`} data-workspace-expanded={expanded}>
      <div className={styles.topBar}>
        <div className={styles.leftBar}>
          <Link to="/" className={styles.brand} aria-label="Writer Assistant Início">
            <span className={styles.brandMark}>
              <Feather className="icon" aria-hidden="true" />
            </span>
            <span className={styles.brandText}>{PROJECT_NAME}</span>
          </Link>
          <StudioNavigation />
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

function AppWorkspace() {
  const { expanded } = useWorkspaceLayout();
  return (
    <div className={styles.appBackdrop}>
      <div className={styles.appWrapper} data-workspace-expanded={expanded}>
        <a href="#main-content" className={styles.skipLink}>
          Pular para o conteúdo
        </a>
        <AppHeader />
        <main
          id="main-content"
          tabIndex={-1}
          className={styles.mainContent}
          data-workspace-expanded={expanded}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <WorkspaceLayoutProvider>
          <AISettingsProvider>
            <AppWorkspace />
          </AISettingsProvider>
        </WorkspaceLayoutProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
