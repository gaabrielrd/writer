import { parseNote } from '../model/note';
import type { Note } from '../model/note';

const STORAGE_KEY = 'notes:list';
const BACKUP_KEY = 'notes:list:backup';
const SCHEMA_VERSION = 1;

export interface NotesSnapshot {
  notes: Note[];
  revision: number;
}

interface NotesEnvelope {
  version: typeof SCHEMA_VERSION;
  revision: number;
  notes: Note[];
}

export type NoteStorageErrorCode =
  | 'NOTE_STORAGE_READ_FAILED'
  | 'NOTE_STORAGE_WRITE_FAILED'
  | 'NOTE_STORAGE_INVALID_DATA'
  | 'NOTE_STORAGE_CONFLICT';

export class NoteStorageError extends Error {
  public readonly code: NoteStorageErrorCode;

  public constructor(code: NoteStorageErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = 'NoteStorageError';
  }
}

export class NoteStorageConflictError extends NoteStorageError {
  public constructor() {
    super(
      'NOTE_STORAGE_CONFLICT',
      'As notas foram alteradas em outra aba. A lista foi atualizada; tente novamente.',
    );
    this.name = 'NoteStorageConflictError';
  }
}

function parseNotes(values: unknown[]): Note[] {
  const notes = values.map(parseNote);
  if (notes.some((note) => note === null)) {
    throw new NoteStorageError(
      'NOTE_STORAGE_INVALID_DATA',
      'Uma ou mais notas salvas estão corrompidas.',
    );
  }
  return notes as Note[];
}

function preserveInvalidData(raw: string): void {
  try {
    if (localStorage.getItem(BACKUP_KEY) === null) {
      localStorage.setItem(BACKUP_KEY, raw);
    }
  } catch {
    // O dado original permanece na chave principal mesmo se o backup falhar.
  }
}

function writeEnvelope(notes: Note[], revision: number): NotesSnapshot {
  const envelope: NotesEnvelope = { version: SCHEMA_VERSION, revision, notes };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch (error) {
    throw new NoteStorageError('NOTE_STORAGE_WRITE_FAILED', 'Não foi possível salvar as notas.', {
      cause: error,
    });
  }
  return { notes, revision };
}

export function loadNotesSnapshot(): NotesSnapshot {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    throw new NoteStorageError(
      'NOTE_STORAGE_READ_FAILED',
      'Não foi possível ler as notas salvas.',
      { cause: error },
    );
  }
  if (!raw) return { notes: [], revision: 0 };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return writeEnvelope(parseNotes(parsed), 1);
    }
    if (typeof parsed !== 'object' || parsed === null) {
      throw new NoteStorageError(
        'NOTE_STORAGE_INVALID_DATA',
        'Os dados salvos de notas estão em um formato inválido.',
      );
    }

    const envelope = parsed as Record<string, unknown>;
    if (
      envelope.version !== SCHEMA_VERSION ||
      typeof envelope.revision !== 'number' ||
      !Number.isInteger(envelope.revision) ||
      envelope.revision < 0 ||
      !Array.isArray(envelope.notes)
    ) {
      throw new NoteStorageError(
        'NOTE_STORAGE_INVALID_DATA',
        'A versão dos dados de notas não é compatível com esta aplicação.',
      );
    }
    return { notes: parseNotes(envelope.notes), revision: envelope.revision };
  } catch (error) {
    preserveInvalidData(raw);
    if (error instanceof NoteStorageError) throw error;
    throw new NoteStorageError(
      'NOTE_STORAGE_INVALID_DATA',
      'O conteúdo salvo de notas está corrompido.',
      { cause: error },
    );
  }
}

export function loadNotes(): Note[] {
  return loadNotesSnapshot().notes;
}

export function saveNotes(notes: Note[], expectedRevision?: number): NotesSnapshot {
  const current = loadNotesSnapshot();
  if (expectedRevision !== undefined && current.revision !== expectedRevision) {
    throw new NoteStorageConflictError();
  }
  return writeEnvelope(notes, current.revision + 1);
}

export function addNoteToStorage(note: Note, expectedRevision?: number): NotesSnapshot {
  const current = loadNotesSnapshot();
  if (expectedRevision !== undefined && current.revision !== expectedRevision) {
    throw new NoteStorageConflictError();
  }
  return writeEnvelope([note, ...current.notes], current.revision + 1);
}

export function removeNoteFromStorage(
  id: string,
  expectedRevision?: number,
): { removed: boolean; snapshot: NotesSnapshot } {
  const current = loadNotesSnapshot();
  if (expectedRevision !== undefined && current.revision !== expectedRevision) {
    throw new NoteStorageConflictError();
  }
  const notes = current.notes.filter((note) => note.id !== id);
  if (notes.length === current.notes.length) {
    return { removed: false, snapshot: current };
  }
  return { removed: true, snapshot: writeEnvelope(notes, current.revision + 1) };
}

export const noteStorageKeys = { primary: STORAGE_KEY, backup: BACKUP_KEY } as const;
