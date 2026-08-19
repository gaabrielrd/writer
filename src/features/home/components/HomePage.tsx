import { BookOpen, Sparkles, UserPlus } from 'lucide-react';
import { Link } from 'react-router';
import { Button, Card } from '@/shared/ui';
import { useAuth } from '@/features/auth';
import { BookList } from '@/features/books';
import styles from './HomePage.module.css';

export function HomePage() {
  const { user, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (user) {
    return <BookList authorId={user.uid} />;
  }

  return (
    <div className={styles.landing}>
      <Card className={styles.heroCard}>
        <div className={styles.heroContent}>
          <div className={styles.heroHeader}>
            <h1 className={styles.heroTitle}>Assistente para Autores de Ficção</h1>
            <p className={styles.heroDescription}>
              Escreva livros com compêndio integrado de lore, continuidade de personagens e
              assistência de inteligência artificial em tempo real.
            </p>
          </div>

          <div className={styles.features}>
            <div className={styles.featureItem}>
              <div className={styles.featureIcon}>
                <BookOpen className="icon" aria-hidden="true" />
              </div>
              <h3 className={styles.featureTitle}>Gestão de Livros e Capítulos</h3>
              <p className={styles.featureText}>
                Estruture suas histórias, organize capítulos e acompanhe a contagem de palavras com
                facilidade.
              </p>
            </div>

            <div className={styles.featureItem}>
              <div className={styles.featureIcon}>
                <Sparkles className="icon" aria-hidden="true" />
              </div>
              <h3 className={styles.featureTitle}>Lore e Personagens Conectados</h3>
              <p className={styles.featureText}>
                Mantenha a consistência da narrativa com tooltips automáticos e sidebar de contexto
                inteligente.
              </p>
            </div>
          </div>

          <div className={styles.cta}>
            <Link to="/login">
              <Button size="lg" variant="primary" className={styles.ctaButton}>
                <UserPlus className="icon icon-sm" aria-hidden="true" />
                <span>Começar a Escrever Gratuitamente</span>
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
