import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import {
  beginAutocompleteApply,
  finishAutocompleteApply,
  readPendingAutocompleteApplies,
} from '../services/autocompleteApplyStorage';
import type { PendingAutocompleteApply } from '../model/atomicAutocomplete';
const scope = { bookId: 'book', chapterId: 'chapter' };
const pointer = (operationId = 'autocomplete-operation-0001'): PendingAutocompleteApply => ({
  version: 1,
  actorId: 'author',
  ...scope,
  operationId,
  requestId: 'autocomplete-request-00001',
  beforeHash: 'a'.repeat(64),
  afterHash: 'b'.repeat(64),
});
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('navigator', {
    locks: { request: (_name: string, work: () => unknown) => Promise.resolve(work()) },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});
describe('autocomplete metadata journal', () => {
  it('retains independently pending operations from multiple sessions without manuscript or credentials', async () => {
    const first = pointer(),
      second = pointer('autocomplete-operation-0002');
    await Promise.all([beginAutocompleteApply(first), beginAutocompleteApply(second)]);
    expect(readPendingAutocompleteApplies('author', scope)).toHaveLength(2);
    expect(readPendingAutocompleteApplies('other', scope)).toEqual([]);
    expect(readPendingAutocompleteApplies('author', { ...scope, chapterId: 'other' })).toEqual([]);
    await finishAutocompleteApply(first);
    expect(readPendingAutocompleteApplies('author', scope)).toEqual([second]);
    const raw = localStorage.getItem(localStorage.key(0)!);
    expect(raw).not.toContain('after":');
    expect(raw).not.toContain('apiKey');
  });
  it('does not replace or delete an uncertain operation with a different fingerprint', async () => {
    const original = pointer();
    await beginAutocompleteApply(original);
    const changed = { ...original, afterHash: 'c'.repeat(64) };
    await expect(beginAutocompleteApply(changed)).rejects.toThrow(/outro conteúdo/);
    await expect(finishAutocompleteApply(changed)).rejects.toThrow(/mudou/);
    expect(readPendingAutocompleteApplies('author', scope)).toEqual([original]);
  });
  it('fails before sending an operation if private metadata cannot be safely persisted', async () => {
    vi.stubGlobal('navigator', {});
    await expect(beginAutocompleteApply(pointer())).rejects.toThrow(/controle necessário/);
    expect(localStorage.length).toBe(0);
  });
  it('preserves corrupt metadata for investigation rather than treating it as no pending write', async () => {
    await beginAutocompleteApply(pointer());
    const name = localStorage.key(0)!;
    localStorage.setItem(name, '{"broken":true}');
    expect(() => readPendingAutocompleteApplies('author', scope)).toThrow(/inválido/);
    expect(localStorage.getItem(name)).toBe('{"broken":true}');
  });
});
