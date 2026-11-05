import { useOnboarding, interestLabels } from '@/features/onboarding';
import { useState, type ReactNode } from 'react';
import { studioDestinations } from '@/features/studio';
import {
  ChevronDown,
  House,
  FolderOpen,
  Upload,
  Activity,
  BookOpen,
  ScrollText,
  Dices,
  Grid2X2,
  ChevronsUp,
} from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '@/features/auth';
import { Button, Dropdown, DropdownItem, Tooltip } from '@/shared/ui';
import styles from './StudioNavigation.module.css';
import { navigationSections, spaces, workspaceLabel } from './workspaceNavigation';

const studioIcons = { home: House, projects: FolderOpen, import: Upload, operations: Activity };
const interestIcons = { book: BookOpen, adventure: ScrollText, campaign: Dices };

function NavigationHint({
  compact,
  label,
  children,
}: {
  compact: boolean;
  label: string;
  children: ReactNode;
}) {
  return compact ? (
    <Tooltip content={label} side="right">
      {children}
    </Tooltip>
  ) : (
    children
  );
}

export function StudioNavigation({
  onNavigate,
  presentation = 'sidebar',
  compact = false,
}: {
  onNavigate?: () => void;
  presentation?: 'sidebar' | 'menu';
  compact?: boolean;
}) {
  const { user } = useAuth();
  const onboarding = useOnboarding();
  const [showAll, setShowAll] = useState(false);
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
    <nav
      data-writer-tour="navigation"
      data-compact={compact}
      className={styles.nav}
      aria-label="Navegação principal"
    >
      {navigationSections
        .filter(
          (section) =>
            section !== 'Explorar' ||
            showAll ||
            spaces.some((space) => space.section === section && pathname.startsWith(space.path)),
        )
        .map((section) => (
          <div key={section} className={styles.section} role="group" aria-label={section}>
            <span className={styles.sectionTitle} aria-hidden="true">
              {section}
            </span>
            {spaces
              .filter((space) => space.section === section)
              .map(({ path, label, Icon }) => (
                <div key={path}>
                  <NavigationHint compact={compact} label={label}>
                    <Link
                      to={path}
                      aria-label={label}
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
                  </NavigationHint>
                  {path === '/studio' && inStudio && (
                    <div className={styles.subnav} role="group" aria-label="Seções do Estúdio">
                      {onboarding?.profile?.interests.map((interest) => {
                        const Icon = interestIcons[interest];
                        return (
                          <NavigationHint
                            key={interest}
                            compact={compact}
                            label={interestLabels[interest]}
                          >
                            <Link
                              to={`/studio/projects?kind=${interest}`}
                              aria-label={interestLabels[interest]}
                              className={styles.sublink}
                              onClick={onNavigate}
                            >
                              <Icon className="icon icon-sm" aria-hidden="true" />
                              <span>{interestLabels[interest]}</span>
                            </Link>
                          </NavigationHint>
                        );
                      })}
                      {studioDestinations.map((destination) => {
                        const Icon = studioIcons[destination.id];
                        return (
                          <NavigationHint
                            key={destination.id}
                            compact={compact}
                            label={destination.label}
                          >
                            <Link
                              to={destination.path}
                              aria-label={destination.label}
                              className={styles.sublink}
                              aria-current={
                                pathname.replace(/\/$/, '') === destination.path
                                  ? 'page'
                                  : undefined
                              }
                              onClick={onNavigate}
                            >
                              <Icon className="icon icon-sm" aria-hidden="true" />
                              <span>{destination.label}</span>
                            </Link>
                          </NavigationHint>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
          </div>
        ))}
      <NavigationHint
        compact={compact}
        label={showAll ? 'Recolher ferramentas' : 'Todas as ferramentas'}
      >
        <Button
          className={styles.toolsToggle}
          variant="ghost"
          aria-label={showAll ? 'Recolher ferramentas' : 'Todas as ferramentas'}
          aria-expanded={showAll}
          onClick={() => setShowAll((old) => !old)}
        >
          {showAll ? (
            <ChevronsUp className="icon icon-sm" aria-hidden="true" />
          ) : (
            <Grid2X2 className="icon icon-sm" aria-hidden="true" />
          )}
          <span>{showAll ? 'Recolher ferramentas' : 'Todas as ferramentas'}</span>
        </Button>
      </NavigationHint>
    </nav>
  );
}
