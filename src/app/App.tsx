import { CircleCheck, Home, Palette } from 'lucide-react';
import { Link, Outlet } from 'react-router';
import styles from './App.module.css';

const PROJECT_NAME = 'Writer Assistant';

export function App() {
  return (
    <main className={styles.app}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <img className={styles.mark} src="/favicon.svg" alt="" width="28" height="28" />
          <h1>{PROJECT_NAME}</h1>
        </div>
        <p className={styles.status}>
          <CircleCheck className="icon" aria-hidden="true" />O projeto está pronto para sua primeira
          feature.
        </p>
        <nav className={styles.nav} aria-label="Navegação principal">
          <Link to="/">
            <Home className="icon icon-sm" aria-hidden="true" />
            Início
          </Link>
          <Link to="/styleguide">
            <Palette className="icon icon-sm" aria-hidden="true" />
            Styleguide
          </Link>
        </nav>
      </header>

      <Outlet />
    </main>
  );
}
