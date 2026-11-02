import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '@/features/auth';
import { watchBookTitle } from '../services/bookNavigationService';
import styles from './BookNavigation.module.css';

export function BookNavigation() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const bookId =
    pathname === '/books/new/assisted'
      ? undefined
      : /^\/books\/([^/]+)(?:\/|$)/.exec(pathname)?.[1];
  const key = `${user?.uid ?? ''}:${bookId ?? ''}`;
  const [title, setTitle] = useState<{ key: string; text: string }>();
  useEffect(() => {
    if (!user || !bookId) return;
    let active = true;
    const stop = watchBookTitle(bookId, user.uid, (text) => {
      if (active) setTitle({ key, text });
    });
    return () => {
      active = false;
      stop();
    };
  }, [bookId, user, key]);
  const current = title?.key === key ? title.text : '';
  if (!user || !bookId || !current) return null;
  return (
    <span className={styles.nav} aria-label="Livro atual">
      <span className={styles.separator} aria-hidden="true">
        /
      </span>
      <span className={styles.title} title={current} aria-current="page">
        {current}
      </span>
    </span>
  );
}
