import { PageAssistant } from '@/features/page-assistant';
import { useEffect, useRef, useState } from 'react';
import { Feather, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router';
import { AuthButton, CreditsBadge, useAuth } from '@/features/auth';
import { BookNavigation } from '@/features/books';
import { useAISettings } from '@/features/ai-assistant';
import { CustomThemeSelector } from '@/features/custom-themes';
import { Button, Card, Dialog, useWorkspaceLayout } from '@/shared/ui';
import { StudioNavigation } from './StudioNavigation';
import { workspaceLabel, workspaceSectionLabel } from './workspaceNavigation';
import styles from './AuthenticatedWorkspace.module.css';

export function AuthenticatedWorkspace() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const { expanded, contentWidth } = useWorkspaceLayout();
  const openAISettings = useAISettings();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const [previousPath, setPreviousPath] = useState(pathname);
  if (previousPath !== pathname) {
    setPreviousPath(pathname);
    setDrawerPath(null);
  }
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 761px)');
    const closeOnDesktop = () => {
      if (desktop.matches) setDrawerPath(null);
    };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  const desktopTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (collapsed) desktopTrigger.current?.focus();
  }, [collapsed]);
  const sidebarVisible = !collapsed && !expanded;
  const closeDrawer = () => setDrawerPath(null);

  const navigation = (
    <>
      <StudioNavigation onNavigate={closeDrawer} />
      <Card tone="flat" className={styles.sidebarFooter}>
        <div className={styles.account}>
          <AuthButton
            onOpenAISettings={() => {
              closeDrawer();
              openAISettings();
            }}
          />
        </div>
      </Card>
    </>
  );

  return (
    <div
      className={styles.shell}
      data-writer-workspace
      data-workspace-expanded={expanded}
      data-content-width={contentWidth}
    >
      <a href="#main-content" className={styles.skipLink}>
        Pular para o conteúdo
      </a>
      <aside
        id="writer-sidebar"
        className={styles.sidebar}
        hidden={!sidebarVisible}
        aria-label="Barra lateral do Writer"
      >
        <div className={styles.sidebarHeader}>
          <Link to="/studio" className={styles.brand} aria-label="Writer Assistant Início">
            <Feather className="icon icon-sm" aria-hidden="true" />
            <span>Writer</span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Recolher navegação"
            aria-controls="writer-sidebar"
            aria-expanded={sidebarVisible}
            onClick={() => {
              setCollapsed(true);
            }}
          >
            <PanelLeftClose className="icon icon-sm" aria-hidden="true" />
          </Button>
        </div>
        {navigation}
      </aside>
      <div className={styles.workArea}>
        <header className={styles.toolbar}>
          <Button
            ref={desktopTrigger}
            variant="ghost"
            size="icon"
            className={styles.desktopToggle}
            hidden={sidebarVisible}
            aria-label="Abrir navegação"
            aria-expanded={sidebarVisible}
            aria-controls="writer-sidebar"
            disabled={expanded}
            onClick={() => setCollapsed(!collapsed)}
          >
            <PanelLeftOpen className="icon icon-sm" aria-hidden="true" />
          </Button>
          <Button
            ref={mobileTrigger}
            variant="ghost"
            size="icon"
            className={styles.mobileToggle}
            aria-label="Abrir navegação"
            aria-expanded={drawerPath === pathname}
            aria-controls="writer-mobile-navigation"
            onClick={() => setDrawerPath(pathname)}
          >
            <PanelLeftOpen className="icon icon-sm" aria-hidden="true" />
          </Button>
          <div className={styles.context}>
            <span>{workspaceLabel(pathname)}</span>
            {workspaceSectionLabel(pathname) && (
              <span className={styles.contextSection}>/ {workspaceSectionLabel(pathname)}</span>
            )}
            <BookNavigation />
          </div>
          <div className={styles.headerControls}>
            {user && (
              <CreditsBadge
                credits={user.credits}
                tier={user.tier}
                className={styles.headerControl}
              />
            )}
            <CustomThemeSelector />
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className={styles.main}>
          <Outlet />
        </main>
      </div>
      <PageAssistant />
      <Dialog
        open={drawerPath === pathname}
        onClose={closeDrawer}
        title="Navegação do Writer"
        className={styles.drawer}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          mobileTrigger.current?.focus();
        }}
      >
        <div id="writer-mobile-navigation" className={styles.drawerBody}>
          {navigation}
        </div>
      </Dialog>
    </div>
  );
}
