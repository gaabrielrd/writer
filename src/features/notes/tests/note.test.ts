import { describe, it, expect } from 'vitest';
import { createNote, parseNote, validateTitle } from '../model/note';

describe('Note Model', () => {
  describe('createNote', () => {
    it('creates a valid note', () => {
      const note = createNote('My Note');
      expect(note.id).toBeDefined();
      expect(typeof note.id).toBe('string');
      expect(note.title).toBe('My Note');
      expect(note.createdAt).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('validateTitle', () => {
    it('trims whitespace', () => {
      expect(validateTitle('  test  ')).toBe('test');
    });

    it('throws on empty string', () => {
      expect(() => validateTitle('')).toThrow('título da nota é obrigatório');
      expect(() => validateTitle('   ')).toThrow('título da nota é obrigatório');
    });
  });

  describe('parseNote', () => {
    it('accepts a valid persisted note', () => {
      expect(parseNote({ id: '1', title: 'Nota', createdAt: 123 })).toEqual({
        id: '1',
        title: 'Nota',
        createdAt: 123,
      });
    });

    it('rejects invalid persisted notes', () => {
      expect(parseNote({ id: '1', title: '', createdAt: 123 })).toBeNull();
      expect(parseNote({ id: '1', title: 'Nota', createdAt: 'ontem' })).toBeNull();
    });
  });
});
