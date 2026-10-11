import { useState, useId } from 'react';
import { Alert, Button } from '@/shared/ui';
import type { PersonaComplement } from '../model/persona';
import { PersonaManager } from './PersonaManager';
import { PersonaBindingDialog } from './PersonaBindingDialog';
import styles from './Personas.module.css';

const tabs = [
  { id: 'chapter', label: 'Capítulo' },
  { id: 'book', label: 'Livro' },
  { id: 'library', label: 'Biblioteca' },
] as const;
export function ChapterPersonaDialog({
  ownerId,
  bookPersonaId,
  complement,
  instruction,
  error,
  onRetry,
  onSaveBook,
  onSaveChapter,
  onClose,
}: {
  ownerId: string;
  bookPersonaId?: string | null;
  complement?: PersonaComplement | null;
  instruction: string;
  error?: string | null;
  onRetry: () => void;
  onSaveBook: (id: string | null) => Promise<void>;
  onSaveChapter: (value: PersonaComplement | null) => Promise<void>;
  onClose: () => void;
}) {
  const [view, setView] = useState<(typeof tabs)[number]['id']>('chapter');
  const id = useId();
  const navigation = (
    <div className={styles.stack}>
      <div
        role="tablist"
        aria-label="Gerenciamento de persona"
        className={`${styles.tabBar} ${styles.modalTabs}`}
      >
        {tabs.map((tab, index) => (
          <button
            type="button"
            role="tab"
            key={tab.id}
            id={`${id}-${tab.id}`}
            aria-selected={view === tab.id}
            tabIndex={view === tab.id ? 0 : -1}
            className={`${styles.tab} ${view === tab.id ? styles.tabActive : ''}`}
            onClick={() => setView(tab.id)}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? tabs.length - 1
                    : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
              setView(tabs[next]!.id);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {error && (
        <Alert variant="danger" title="Configuração de IA indisponível">
          {error}
          <Button variant="secondary" onClick={onRetry}>
            Tentar novamente
          </Button>
        </Alert>
      )}
      {view === 'library' && (
        <details className={styles.summary}>
          <summary>Orientações efetivas</summary>
          <p>{instruction || 'Orientações padrão da operação.'}</p>
        </details>
      )}
    </div>
  );
  return view === 'library' ? (
    <PersonaManager ownerId={ownerId} modal navigation={navigation} onClose={onClose} />
  ) : (
    <PersonaBindingDialog
      key={view}
      ownerId={ownerId}
      mode={view}
      bookPersonaId={bookPersonaId}
      complement={complement}
      navigation={navigation}
      title="Persona"
      onClose={onClose}
      onSave={async (personaId, personaComplement) => {
        if (view === 'book') await onSaveBook(personaId);
        else await onSaveChapter(personaComplement);
      }}
    />
  );
}
