import { BookOpen, Sparkles, UserPlus } from 'lucide-react';
import { Link } from 'react-router';
import { Button, Card, PageHeader } from '@vitru/styleguide';
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
      <Card tone="raised">
        <div className={styles.hero}>
          <PageHeader
            title="Assistente para Autores de Ficção"
            description="Escreva livros com compêndio integrado de lore, continuidade de personagens e assistência de inteligência artificial em tempo real."
          />

          <div className={styles.features}>
            <div className={styles.featureItem}>
              <BookOpen className="icon" aria-hidden="true" />
              <h3>Gestão de Livros e Capítulos</h3>
              <p>Estruture suas histórias, organize capítulos e acompanhe contagem de palavras.</p>
            </div>
            <div className={styles.featureItem}>
              <Sparkles className="icon" aria-hidden="true" />
              <h3>Lore e Personagens Conectados</h3>
              <p>
                Mantenha a consistência da narrativa com tooltips automáticos e sidebar de contexto.
              </p>
            </div>
          </div>

          <div className={styles.cta}>
            <Link to="/login">
              <Button variant="primary">
                <UserPlus className="icon icon-sm" aria-hidden="true" />
                Começar a Escrever Gratuitamente
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
