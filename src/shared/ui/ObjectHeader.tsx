import type { ReactNode } from 'react';
import { cn } from '../lib/utils';
import styles from './ObjectHeader.module.css';

export interface ObjectHeaderProps {
  title: string;
  /** Tipo do objeto e contexto curto, por exemplo "Livro · Fantasia literária". */
  kind?: ReactNode;
  /** Capa ou miniatura do objeto. */
  media?: ReactNode;
  /** Estado, contagens e datas em uma linha, normalmente `Badge`s. */
  meta?: ReactNode;
  /** Sinopse ou descrição curta. */
  description?: ReactNode;
  /** A única ação em variante primária do cabeçalho. */
  primaryAction?: ReactNode;
  /** Até duas ações secundárias. */
  secondaryActions?: ReactNode;
  /**
   * Menu "…" (`Dropdown mode="action"`) com as ações restantes. Exclusão,
   * backup e exportação ficam aqui, nunca como botões visíveis.
   */
  menu?: ReactNode;
  /** Nível do título; use 2 somente quando o cabeçalho estiver dentro de outra página. */
  headingLevel?: 1 | 2;
  className?: string;
}

/**
 * Cabeçalho de uma página de objeto (livro, aventura, campanha, universo).
 * Para páginas de coleção, use `PageHeader`.
 */
export function ObjectHeader({
  title,
  kind,
  media,
  meta,
  description,
  primaryAction,
  secondaryActions,
  menu,
  headingLevel = 1,
  className,
}: ObjectHeaderProps) {
  const hasActions = Boolean(primaryAction || secondaryActions || menu);
  const Heading = headingLevel === 2 ? 'h2' : 'h1';
  return (
    <header className={cn(styles.header, className)} data-slot="object-header">
      {media && <div className={styles.media}>{media}</div>}
      <div className={styles.body}>
        {kind && <p className={styles.kind}>{kind}</p>}
        <Heading className={styles.title}>{title}</Heading>
        {meta && <div className={styles.meta}>{meta}</div>}
        {description && <div className={styles.description}>{description}</div>}
      </div>
      {hasActions && (
        <div className={styles.actions} role="group" aria-label={`Ações de ${title}`}>
          {secondaryActions}
          {menu}
          {primaryAction}
        </div>
      )}
    </header>
  );
}
