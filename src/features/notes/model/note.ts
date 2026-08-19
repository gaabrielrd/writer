export interface Note {
  id: string;
  title: string;
  createdAt: number;
}

export type NoteValidationErrorCode = 'NOTE_TITLE_REQUIRED';

export class NoteValidationError extends Error {
  public readonly code: NoteValidationErrorCode;

  public constructor(code: NoteValidationErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'NoteValidationError';
  }
}

export function parseNote(value: unknown): Note | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== 'string' ||
    candidate.id.length === 0 ||
    typeof candidate.title !== 'string' ||
    typeof candidate.createdAt !== 'number' ||
    !Number.isFinite(candidate.createdAt)
  ) {
    return null;
  }

  try {
    const title = validateTitle(candidate.title);
    return { id: candidate.id, title, createdAt: candidate.createdAt };
  } catch {
    return null;
  }
}

export function validateTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new NoteValidationError('NOTE_TITLE_REQUIRED', 'O título da nota é obrigatório.');
  }
  return trimmed;
}

export function createNote(title: string): Note {
  const validTitle = validateTitle(title);
  return {
    id: crypto.randomUUID(),
    title: validTitle,
    createdAt: Date.now(),
  };
}
