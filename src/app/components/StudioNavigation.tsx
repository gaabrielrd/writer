import { BookOpen, ChevronDown, Compass, Globe, Images, Library, Send } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '@/features/auth';
import { Button, Dropdown, DropdownItem } from '@/shared/ui';
import styles from './StudioNavigation.module.css';

const spaces = [
  { path: '/universes', label: 'Universos', Icon: Globe },
  { path: '/studio', label: 'Estúdio', Icon: BookOpen },
  { path: '/publications', label: 'Publicações', Icon: Send },
  { path: '/catalog', label: 'Catálogo', Icon: Compass },
  { path: '/biblioteca', label: 'Biblioteca', Icon: Library },
] as const;

const imageLibrary = { path: '/library', label: 'Biblioteca de Imagens', Icon: Images };

export function StudioNavigation() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (!user) return null;
  const selected =
    pathname === '/library'
      ? imageLibrary
      : (spaces.find(({ path }) => pathname === path || pathname.startsWith(path + '/')) ??
        spaces[1]);
  const SelectedIcon = selected.Icon;

  return (
    <nav className={styles.nav} aria-label="Navegação principal">
      <span className={styles.separator} aria-hidden="true">
        /
      </span>
      <Dropdown
        mode="action"
        label="Espaços do Writer"
        trigger={
          <Button variant="ghost" className={styles.trigger}>
            <SelectedIcon className="icon icon-sm" aria-hidden="true" />
            {selected.label}
            <ChevronDown className="icon icon-sm" aria-hidden="true" />
          </Button>
        }
      >
        {spaces.map(({ path, label, Icon }) => (
          <DropdownItem key={path} asChild>
            <Link to={path} aria-current={selected.path === path ? 'page' : undefined}>
              <Icon className="icon icon-sm" aria-hidden="true" />
              {label}
            </Link>
          </DropdownItem>
        ))}
        <DropdownItem asChild>
          <Link to={imageLibrary.path} aria-current={pathname === '/library' ? 'page' : undefined}>
            <Images className="icon icon-sm" aria-hidden="true" />
            Biblioteca de Imagens
          </Link>
        </DropdownItem>
      </Dropdown>
    </nav>
  );
}
