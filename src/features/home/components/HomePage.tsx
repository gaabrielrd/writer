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
          Assistente para Autores de Ficção
        </h1>
        <p className={styles.heroDescription}>
          Um lugar para escrever seus capítulos, construir universos e dar continuidade às suas
          ideias.
        </p>
        <p className={styles.heroMotto}>Organize. Escreva. Imagine.</p>
      </section>
      <section aria-label="Comece sua história">
        <Card tone="flat" className={styles.creationPanel}>
          <div className={styles.panelHeading}>
            <span className={styles.writingIcon}>
              <Feather className="icon" aria-hidden="true" />
            </span>
            <div>
              <h2>Sua próxima história começa aqui.</h2>
              <p>Do primeiro rascunho ao universo completo.</p>
            </div>
          </div>
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
          <div className={styles.cta}>
            <Link
              to="/login"
              className={`${buttonVariants({ size: 'md', variant: 'primary' })} ${styles.ctaButton}`}
            >
              Começar a Escrever Gratuitamente
              <ArrowUpRight className="icon icon-sm" aria-hidden="true" />
            </Link>
          </div>
        </Card>
      </section>
      <p className={styles.footerNote}>Seu texto no centro. Seu universo ao alcance.</p>
    </div>
  );
}
