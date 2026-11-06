import { ArrowUpRight, BookOpen, Feather, Sparkles } from 'lucide-react';
import { Link, Navigate } from 'react-router';
import { Card, LoadingState, buttonVariants } from '@/shared/ui';
import { useAuth } from '@/features/auth';
import styles from './HomePage.module.css';

export function HomePage() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState label="Carregando sua sessão..." />;
  if (user) return <Navigate to="/studio" replace />;

  return (
    <div className={styles.landing}>
      <section className={styles.heroHeader} aria-labelledby="home-title">
        <h1 id="home-title" className={styles.heroTitle}>
          Assistente para Autores de <em>Ficção</em>
        </h1>
        <p className={styles.heroDescription}>
          Um lugar para escrever seus capítulos, construir universos e dar continuidade às suas
          ideias.
        </p>
        <Link
          to="/login"
          className={`${buttonVariants({ size: 'lg', variant: 'primary' })} ${styles.ctaButton}`}
        >
          Começar a Escrever Gratuitamente
          <ArrowUpRight className="icon icon-sm" aria-hidden="true" />
        </Link>
      </section>
      <section aria-label="Comece sua história">
        <Card tone="flat" className={styles.creationPanel}>
          <Feather className={`icon ${styles.writingIcon}`} aria-hidden="true" />
          <p className={styles.heroMotto}>
            <span>Organize.</span> <span>Escreva.</span> <span>Imagine.</span>
          </p>
          <div className={styles.panelHeading}>
            <h2>Sua próxima história começa aqui.</h2>
            <p>Do primeiro rascunho ao universo completo.</p>
          </div>
        </Card>
      </section>
      <div className={styles.features}>
        <div className={styles.featureItem}>
          <BookOpen className="icon icon-sm" aria-hidden="true" />
          <div>
            <h3>Gestão de Livros e Capítulos</h3>
            <p>Estruture a narrativa e acompanhe suas palavras.</p>
          </div>
        </div>
        <div className={styles.featureItem}>
          <Sparkles className="icon icon-sm" aria-hidden="true" />
          <div>
            <h3>Lore e Personagens Conectados</h3>
            <p>Mantenha seu universo sempre por perto.</p>
          </div>
        </div>
      </div>
      <p className={styles.footerNote}>Seu texto no centro. Seu universo ao alcance.</p>
    </div>
  );
}
