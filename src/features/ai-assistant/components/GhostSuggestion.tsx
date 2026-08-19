import { Sparkles, X, Check } from 'lucide-react';
import { Button } from '@vitru/styleguide';
import styles from './GhostSuggestion.module.css';

export interface GhostSuggestionProps {
  suggestion: string;
  onAccept: () => void;
  onDiscard: () => void;
  isUsingBYOK?: boolean;
}

export function GhostSuggestion({
  suggestion,
  onAccept,
  onDiscard,
  isUsingBYOK = false,
}: GhostSuggestionProps) {
  if (!suggestion) return null;

  return (
    <div
      className={styles.wrapper}
      role="status"
      aria-label="Sugestão de IA para continuação do texto"
    >
      <Sparkles className={`icon icon-sm ${styles.icon}`} aria-hidden="true" />
      <span className={styles.text}>{suggestion}</span>
      <div className={styles.actions}>
        <span className={styles.keyHint} title="Pressione Tab no teclado">
          Tab
        </span>
        <Button
          variant="primary"
          onClick={onAccept}
          title={isUsingBYOK ? 'Inserir sugestão' : 'Inserir sugestão (-1 crédito)'}
          aria-label="Aceitar sugestão"
        >
          <Check className="icon icon-sm" aria-hidden="true" />
          Aceitar
        </Button>
        <Button
          variant="secondary"
          onClick={onDiscard}
          title="Descartar sugestão (Esc)"
          aria-label="Descartar sugestão"
        >
          <X className="icon icon-sm" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
