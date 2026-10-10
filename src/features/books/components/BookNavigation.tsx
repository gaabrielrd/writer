import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { BookOpen, ChevronDown, Images } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { Button, Dropdown, DropdownItem } from '@/shared/ui';
import { watchBookTitle } from '../services/bookNavigationService';
import styles from './BookNavigation.module.css';

export function BookNavigation() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const bookId = /^\/books\/([^/]+)(?:\/|$)/.exec(pathname)?.[1];
  const key = `${user?.uid ?? ''}:${bookId ?? ''}`;
  const [title, setTitle] = useState<{ key: string; text: string }>();
  useEffect(() => {
    if (!user || !bookId) return;
    return watchBookTitle(bookId, user.uid, (text) => setTitle({ key, text }));
  }, [bookId, user, key]);
  if (!user) return null;
  const current = title?.key === key ? title.text : '';
  const imageLibrarySelected = pathname === '/library';
  const SelectedIcon = imageLibrarySelected ? Images : BookOpen;
  return (
    <nav className={styles.nav} aria-label="Navegação principal">
      <span className={styles.separator} aria-hidden="true">
        /
      </span>
      <Dropdown
        label="Suas bibliotecas"
        trigger={
          <Button variant="ghost">
            <SelectedIcon className="icon icon-sm" aria-hidden="true" />
            {imageLibrarySelected ? 'Biblioteca de Imagens' : 'Meus Livros'}
            <ChevronDown className="icon icon-sm" aria-hidden="true" />
          </Button>
        }
      >
        <DropdownItem asChild>
          <Link to="/" aria-current={pathname === '/' ? 'page' : undefined}>
            <BookOpen className="icon icon-sm" aria-hidden="true" />
            Meus Livros
          </Link>
        </DropdownItem>
        <DropdownItem asChild>
          <Link to="/library" aria-current={pathname === '/library' ? 'page' : undefined}>
            <Images className="icon icon-sm" aria-hidden="true" />
            Biblioteca de Imagens
          </Link>
        </DropdownItem>
      </Dropdown>
      {current && (
        <>
          <span aria-hidden="true">/</span>
          <span className={styles.title} title={current} aria-current="page">
            {current}
          </span>
        </>
      )}
    </nav>
  );
}
