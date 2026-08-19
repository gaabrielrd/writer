import { Plus, Trash2 } from 'lucide-react';
import type { FormEvent } from 'react';
import { Button } from '@vitru/styleguide';
import { useNotes } from '../hooks/useNotes';
import styles from './NoteList.module.css';

export function NoteList() {
  const { notes, title, validationError, storageError, addNote, removeNote, updateTitle } =
    useNotes();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    addNote();
  }

  return (
    <div className={styles.container}>
      {storageError && (
        <p className={styles.storageError} role="alert">
          {storageError}
        </p>
      )}
      <form onSubmit={handleSubmit} className={styles.form}>
        <label className={styles.label} htmlFor="note-title">
          Título da nota
        </label>
        <div className={styles.inputGroup}>
          <input
            id="note-title"
            type="text"
            value={title}
            onChange={(event) => updateTitle(event.target.value)}
            placeholder="Nova nota..."
            className={styles.input}
            aria-invalid={!!validationError}
            aria-describedby={validationError ? 'note-title-error' : undefined}
          />
          <Button type="submit">
            <Plus className="icon icon-sm" aria-hidden="true" />
            Adicionar
          </Button>
        </div>
        <div aria-live="polite">
          {validationError && (
            <p id="note-title-error" className={styles.error}>
              {validationError}
            </p>
          )}
        </div>
      </form>

      <div aria-live="polite">
        {notes.length === 0 ? (
          <p className={styles.emptyState}>Nenhuma nota ainda. Adicione a primeira!</p>
        ) : (
          <ul className={styles.list}>
            {notes.map((note) => (
              <li key={note.id} className={styles.noteItem}>
                <div className={styles.noteContent}>
                  <p className={styles.noteTitle}>{note.title}</p>
                  <p className={styles.noteDate}>{new Date(note.createdAt).toLocaleString()}</p>
                </div>
                <Button
                  variant="danger"
                  onClick={() => removeNote(note.id)}
                  aria-label={`Remover nota: ${note.title}`}
                >
                  <Trash2 className="icon icon-sm" aria-hidden="true" />
                  Remover
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
