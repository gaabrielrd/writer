import { useEffect, useState } from 'react';
import { createNote, validateTitle } from '../model/note';
import type { Note } from '../model/note';
import {
  NoteStorageConflictError,
  NoteStorageError,
  addNoteToStorage,
  loadNotesSnapshot,
  noteStorageKeys,
  removeNoteFromStorage,
} from '../services/noteStorage';

interface NotesState {
  notes: Note[];
  revision: number;
  storageError: string | null;
}

function loadInitialState(): NotesState {
  try {
    return { ...loadNotesSnapshot(), storageError: null };
  } catch (error) {
    return {
      notes: [],
      revision: 0,
      storageError: error instanceof Error ? error.message : 'Não foi possível carregar as notas.',
    };
  }
}

export function useNotes() {
  const [state, setState] = useState<NotesState>(loadInitialState);
  const [title, setTitle] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  function applySnapshot(notes: Note[], revision: number) {
    setState({ notes, revision, storageError: null });
  }

  function reportStorageError(error: unknown) {
    if (!(error instanceof Error)) return;

    if (error instanceof NoteStorageConflictError) {
      try {
        const snapshot = loadNotesSnapshot();
        setState({ ...snapshot, storageError: error.message });
        return;
      } catch (refreshError) {
        if (refreshError instanceof Error) {
          setState((current) => ({ ...current, storageError: refreshError.message }));
          return;
        }
      }
    }

    setState((current) => ({ ...current, storageError: error.message }));
  }

  useEffect(() => {
    function synchronize(event: StorageEvent) {
      if (event.key !== noteStorageKeys.primary) return;
      try {
        const snapshot = loadNotesSnapshot();
        applySnapshot(snapshot.notes, snapshot.revision);
      } catch (error) {
        reportStorageError(error);
      }
    }

    window.addEventListener('storage', synchronize);
    return () => window.removeEventListener('storage', synchronize);
  }, []);

  function addNote() {
    try {
      const note = createNote(title);
      const snapshot = addNoteToStorage(note, state.revision);
      applySnapshot(snapshot.notes, snapshot.revision);
      setTitle('');
      setValidationError(null);
    } catch (error) {
      if (error instanceof NoteStorageError) {
        reportStorageError(error);
      } else if (error instanceof Error) {
        setValidationError(error.message);
      }
    }
  }

  function removeNote(id: string) {
    try {
      const result = removeNoteFromStorage(id, state.revision);
      applySnapshot(result.snapshot.notes, result.snapshot.revision);
    } catch (error) {
      reportStorageError(error);
    }
  }

  function updateTitle(value: string) {
    setTitle(value);
    if (!validationError) return;

    try {
      validateTitle(value);
      setValidationError(null);
    } catch {
      // Mantém o erro enquanto o valor continuar inválido.
    }
  }

  return {
    notes: state.notes,
    title,
    validationError,
    storageError: state.storageError,
    addNote,
    removeNote,
    updateTitle,
  };
}
