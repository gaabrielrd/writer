import { BookOpen, Compass, Library, Send } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState, PageHeader, buttonVariants } from '@/shared/ui';
import styles from './FutureSpacePage.module.css';

const content = {
  publications: {
    title: 'Publicações',
    description: 'Edições de livros e aventuras para compartilhar e distribuir.',
    emptyTitle: 'Prepare suas próximas publicações',
    message:
      'Este espaço estará disponível em uma próxima entrega. Você já pode trabalhar nos seus projetos no Estúdio.',
    Icon: Send,
  },
  catalog: {
    title: 'Catálogo',
    description: 'Livros e aventuras de criadores convidados.',
    emptyTitle: 'O catálogo está sendo preparado',
    message:
      'Quando as obras estiverem disponíveis, você poderá conhecer seus criadores, edições e amostras aqui.',
    Icon: Compass,
  },
  library: {
    title: 'Biblioteca',
    description: 'Suas edições adquiridas e materiais de leitura.',
    emptyTitle: 'Suas aquisições terão um lugar aqui',
    message:
      'A biblioteca de edições estará disponível junto das compras. Suas imagens continuam na Biblioteca de Imagens.',
    Icon: Library,
  },
} as const;

export function FutureSpacePage({ space }: { space: keyof typeof content }) {
  const { title, description, emptyTitle, message, Icon } = content[space];
  return (
    <section aria-label={title}>
      <PageHeader title={title} description={description} />
      <EmptyState
        icon={<Icon className="icon" aria-hidden="true" />}
        title={emptyTitle}
        description={message}
        action={
          <Link
            to={space === 'library' ? '/library' : '/studio'}
            className={`${buttonVariants({ variant: 'secondary' })} ${styles.action}`}
          >
            <BookOpen className="icon icon-sm" aria-hidden="true" />
            {space === 'library' ? 'Abrir Biblioteca de Imagens' : 'Abrir Estúdio'}
          </Link>
        }
      />
    </section>
  );
}
