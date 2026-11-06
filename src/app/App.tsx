import { PageAssistant } from '@/features/page-assistant';
import { OnboardingProvider } from '@/features/onboarding';
import { Feather } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router';
import { AuthProvider, AuthButton, CreditsBadge, useAuth } from '@/features/auth';
import { BookNavigation } from '@/features/books';
import { ThemeProvider } from '@/shared/theme';
import { TypographyProvider } from '@/shared/typography';
import { AISettingsProvider, useAISettings } from '@/features/ai-assistant';
import { WorkspaceLayoutProvider, useWorkspaceLayout } from '@/shared/ui';
import styles from './App.module.css';
import { StudioNavigation } from './components/StudioNavigation';
import { AuthenticatedWorkspace } from './components/AuthenticatedWorkspace';

import { CustomThemesProvider, CustomThemeSelector } from '@/features/custom-themes';

const PROJECT_NAME = 'Writer Assistant';

function AppHeader() {
  const { user } = useAuth();
  const { expanded } = useWorkspaceLayout();
  const openAISettings = useAISettings();

  return (
    <header className={styles.header} data-workspace-expanded={expanded}>
      <div className={styles.topBar}>
        <div className={styles.leftBar}>
          <Link to="/" className={styles.brand} aria-label="Writer Assistant Início">
            <span className={styles.brandMark}>
              <Feather className="icon" aria-hidden="true" />
            </span>
            <span className={styles.brandText}>{PROJECT_NAME}</span>
          </Link>
          <StudioNavigation presentation="menu" />
          <BookNavigation />
        </div>
        <div className={styles.userBar}>
          {user && <CreditsBadge credits={user.credits} tier={user.tier} />}
          <CustomThemeSelector />
          <AuthButton onOpenAISettings={openAISettings} />
        </div>
      </div>
    </header>
  );
}

function ThemeWorkspace() {
  const { user } = useAuth();
  return (
    <TypographyProvider uid={user?.uid ?? null}>
      <CustomThemesProvider uid={user?.uid ?? null}>
        <OnboardingProvider key={user?.uid ?? 'anonymous'}>
          <AppWorkspace />
          <PageAssistant />
        </OnboardingProvider>
      </CustomThemesProvider>
    </TypographyProvider>
  );
}

function AppWorkspace() {
  const { expanded } = useWorkspaceLayout();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const privateArea =
    user && pathname !== '/' && pathname !== '/login' && !pathname.startsWith('/read/');
  if (privateArea) {
    return <AuthenticatedWorkspace key={user.uid} />;
  }
  return (
    <div className={styles.appBackdrop} data-public-home={pathname === '/'}>
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
            <ThemeWorkspace />
          </AISettingsProvider>
        </WorkspaceLayoutProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
