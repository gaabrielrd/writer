import type { ReactNode } from 'react';
import { cn } from '../lib/utils';
import styles from './Toolbar.module.css';

export interface ToolbarProps {
  /** Nome acessível da barra, por exemplo "Ferramentas de capítulos". */
  label: string;
  /** Campo de busca, sempre à esquerda. */
  search?: ReactNode;
  /** Filtros da lista, como `FilterChips` ou `Dropdown mode="select"`. */
  filters?: ReactNode;
  /** Resumo curto da lista, como contagem e total de palavras. */
  summary?: ReactNode;
  /** Ações da seção; no máximo uma em variante primária. */
  actions?: ReactNode;
  className?: string;
}

/**
 * Barra de ferramentas de uma seção: busca e filtros à esquerda, resumo e
 * ações à direita. Quebra linha quando falta largura.
 */
export function Toolbar({ label, search, filters, summary, actions, className }: ToolbarProps) {
  return (
    <div className={cn(styles.toolbar, className)} role="group" aria-label={label}>
      {(search || filters) && (
        <div className={styles.start}>
          {search && <div className={styles.search}>{search}</div>}
          {filters}
        </div>
      )}
      {(summary || actions) && (
        <div className={styles.end}>
          {summary && <p className={styles.summary}>{summary}</p>}
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
    </div>
  );
}
