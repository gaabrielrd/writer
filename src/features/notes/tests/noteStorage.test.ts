import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadNotes,
  saveNotes,
  addNoteToStorage,
  removeNoteFromStorage,
  loadNotesSnapshot,
  NoteStorageConflictError,
  NoteStorageError,
  noteStorageKeys,
} from '../services/noteStorage';

describe('noteStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('loadNotes', () => {
    it('returns empty array when nothing stored', () => {
      expect(loadNotes()).toEqual([]);
    });

    it('preserves corrupt data and reports the problem', () => {
      localStorage.setItem('notes:list', '{ corrupt json');
      expect(() => loadNotes()).toThrow(NoteStorageError);
      expect(localStorage.getItem('notes:list')).toBe('{ corrupt json');
      expect(localStorage.getItem(noteStorageKeys.backup)).toBe('{ corrupt json');

      localStorage.setItem('notes:list', '{"not": "an array"}');
      expect(() => loadNotes()).toThrow('versão');

      localStorage.setItem('notes:list', '[{"id":"1"}]');
      expect(() => loadNotes()).toThrow('corrompidas');
    });

    it('migrates the legacy array to the versioned envelope', () => {
      const note = { id: '1', title: 'legada', createdAt: 123 };
      localStorage.setItem(noteStorageKeys.primary, JSON.stringify([note]));

      expect(loadNotesSnapshot()).toEqual({ notes: [note], revision: 1 });
      expect(JSON.parse(localStorage.getItem(noteStorageKeys.primary) ?? '')).toEqual({
        version: 1,
        revision: 1,
        notes: [note],
      });
    });
  });

  describe('saveNotes', () => {
    it('saves notes to localStorage', () => {
      const notes = [{ id: '1', title: 'test', createdAt: 123 }];
      expect(saveNotes(notes)).toEqual({ notes, revision: 1 });
      expect(JSON.parse(localStorage.getItem('notes:list') ?? '')).toEqual({
        version: 1,
        revision: 1,
        notes,
      });
    });

    it('detects a stale revision instead of losing another update', () => {
      const initial = saveNotes([{ id: '1', title: 'primeira', createdAt: 1 }]);
      saveNotes([{ id: '2', title: 'segunda', createdAt: 2 }], initial.revision);

      expect(() => saveNotes([], initial.revision)).toThrow(NoteStorageConflictError);
      expect(loadNotes().map((note) => note.id)).toEqual(['2']);
    });

    it('reports write failures instead of pretending success', () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('quota', 'QuotaExceededError');
      });

      expect(() => saveNotes([])).toThrow('Não foi possível salvar');
      spy.mockRestore();
    });
  });

  describe('addNoteToStorage', () => {
    it('adds a note', () => {
      const note = { id: '1', title: 'test', createdAt: 123 };
      addNoteToStorage(note);
      expect(loadNotes()).toEqual([note]);

      const note2 = { id: '2', title: 'test2', createdAt: 124 };
      addNoteToStorage(note2);
      expect(loadNotes()).toEqual([note2, note]);
    });
  });

  describe('removeNoteFromStorage', () => {
    it('removes by id and returns true', () => {
      const note1 = { id: '1', title: 'test1', createdAt: 123 };
      const note2 = { id: '2', title: 'test2', createdAt: 124 };
      saveNotes([note1, note2]);

      const result = removeNoteFromStorage('1');
      expect(result.removed).toBe(true);
      expect(loadNotes()).toEqual([note2]);
    });

    it('returns false for unknown id', () => {
      const result = removeNoteFromStorage('999');
      expect(result.removed).toBe(false);
    });
  });
});
