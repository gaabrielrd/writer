import { describe, expect, it, vi } from 'vitest';
import { clearLocalDraft, readLocalDraft, writeLocalDraft } from '../services/localDraftStorage';
describe('private draft recovery', () => {
  it('isolates owners and chapters and only clears acknowledged content', () => {
    writeLocalDraft('a', 'b', 'c', 'latest');
    expect(readLocalDraft('a', 'b', 'c')?.content).toBe('latest');
    expect(readLocalDraft('other', 'b', 'c')).toBeNull();
    clearLocalDraft('a', 'b', 'c', 'old');
    expect(readLocalDraft('a', 'b', 'c')).not.toBeNull();
    clearLocalDraft('a', 'b', 'c', 'latest');
    expect(readLocalDraft('a', 'b', 'c')).toBeNull();
  });
  it.each(['invalid', 'null', '{"content":4,"updatedAt":1}', '{"content":"x","updatedAt":"bad"}'])(
    'ignores malformed backups without deleting them',
    (raw) => {
      localStorage.setItem('writer:draft:a:b:c', raw);
      expect(readLocalDraft('a', 'b', 'c')).toBeNull();
      expect(localStorage.getItem('writer:draft:a:b:c')).toBe(raw);
    },
  );
  it('handles denied reads', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readLocalDraft('a', 'b', 'c')).toBeNull();
    spy.mockRestore();
  });
});
