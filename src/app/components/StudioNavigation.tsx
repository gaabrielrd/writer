import { studioDestinations } from '@/features/studio';
import { ChevronDown, House, FolderOpen, Upload, Activity } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '@/features/auth';
import { Button, Dropdown, DropdownItem } from '@/shared/ui';
import styles from './StudioNavigation.module.css';
import { navigationSections, spaces, workspaceLabel } from './workspaceNavigation';

const studioIcons = { home: House, projects: FolderOpen, import: Upload, operations: Activity };

export function StudioNavigation({
  onNavigate,
  presentation = 'sidebar',
}: {
  onNavigate?: () => void;
  presentation?: 'sidebar' | 'menu';
}) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (!user) return null;
  const selected = workspaceLabel(pathname);
  const inStudio = pathname === '/studio' || pathname.startsWith('/studio/');
  if (presentation === 'menu') {
    const CurrentIcon = (spaces.find(({ label }) => label === selected) ?? spaces[0]).Icon;
    return (
      <nav className={styles.publicNav} aria-label="Navegação principal">
        <span className={styles.separator} aria-hidden="true">
          /
        </span>
        <Dropdown
          mode="action"
          label="Espaços do Writer"
          trigger={
            <Button variant="ghost" className={styles.trigger}>
              <CurrentIcon className="icon icon-sm" aria-hidden="true" />
              {selected}
              <ChevronDown className="icon icon-sm" aria-hidden="true" />
            </Button>
          }
        >
          {spaces
            .filter(({ section }) => section !== 'Configurar')
            .map(({ path, label, Icon }) => (
              <DropdownItem key={path} asChild>
                <Link to={path} aria-current={selected === label ? 'page' : undefined}>
                  <Icon className="icon icon-sm" aria-hidden="true" />
                  {label}
                </Link>
              </DropdownItem>
            ))}
        </Dropdown>
      </nav>
    );
  }
  return (
    <nav className={styles.nav} aria-label="Navegação principal">
      {navigationSections.map((section) => (
        <div key={section} className={styles.section} role="group" aria-label={section}>
          <span className={styles.sectionTitle} aria-hidden="true">
            {section}
          </span>
          {spaces
            .filter((space) => space.section === section)
            .map(({ path, label, Icon }) => (
              <div key={path}>
                <Link
                  to={path}
                  aria-current={
                    selected === label && !(path === '/studio' && inStudio) ? 'page' : undefined
                  }
                  data-active={selected === label}
                  onClick={onNavigate}
                  className={styles.link}
                >
                  <Icon className="icon icon-sm" aria-hidden="true" />
                  <span>{label}</span>
                </Link>
                {path === '/studio' && inStudio && (
                  <div className={styles.subnav} role="group" aria-label="Seções do Estúdio">
                    {studioDestinations.map((destination) => {
                      const Icon = studioIcons[destination.id];
                      return (
                        <Link
                          key={destination.id}
                          to={destination.path}
                          className={styles.sublink}
                          aria-current={
                            pathname.replace(/\/$/, '') === destination.path ? 'page' : undefined
                          }
                          onClick={onNavigate}
                        >
                          <Icon className="icon icon-sm" aria-hidden="true" />
                          <span>{destination.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
        </div>
      ))}
    </nav>
  );
}
