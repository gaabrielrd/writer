import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  editorChatOperationKey,
  readEditorChatOperation,
  compareEditorChatOperation,
  reserveEditorChatOperation,
  handoffEditorChatOperation,
  cancelEditorChatOperation,
  forgetEditorChatOperation,
  assertEditorChatOperation,
  subscribeEditorChatOperation,
  EditorChatStorageError,
} from '../services/editorChatOperationStorage';
import { requestFor, rowFor, scope, hash } from './editorChatTestFixtures';
import type { EditorChatOperationRow } from '../model/editorChat';

let locked = false;
let lockCalls = 0;
function locks() {
  lockCalls = 0;
  let tail: Promise<unknown> = Promise.resolve();
  const request = vi.fn((_key: string, callback: () => unknown) => {
    lockCalls++;
    const run = tail.then(() => {
      locked = true;
      try {
        const result = callback();
        expect(result).not.toBeInstanceOf(Promise);
        return result;
      } finally {
        locked = false;
      }
    });
    tail = run.catch(() => undefined);
    return run;
  });
  vi.stubGlobal('navigator', { locks: { request } });
  return request;
}
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  localStorage.clear();
  locks();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const check = () => undefined;
async function row(): Promise<EditorChatOperationRow> {
  return rowFor(await requestFor('prepareContext'));
}

describe('metadata-only editorChat operation journal', () => {
  it('persists before returning, reads after reload, and uses only a synchronous local lock', async () => {
    const value = await row();
    await reserveEditorChatOperation(value, check);
    expect(locked).toBe(false);
    expect(readEditorChatOperation('user', scope)).toEqual(value);
    const text = localStorage.getItem(editorChatOperationKey('user', scope))!;
    for (const word of [
      'prompt',
      'after',
      'lore',
      'persona',
      'instruction',
      'answer',
      'capture',
      'byokInput',
    ])
      expect(text).not.toContain('"' + word + '"');
    const other = { ...scope, target: { ...scope.target, id: 'other' } };
    expect(readEditorChatOperation('user', other)).toBeNull();
    expect(readEditorChatOperation('other-user', scope)).toBeNull();
  });
  it('allows only one concurrent reservation without replacing an existing intent', async () => {
    const first = await row();
    const second = { ...first, operationId: 'second', contextId: 'second', requestHash: hash('b') };
    const results = await Promise.allSettled([
      reserveEditorChatOperation(first, check),
      reserveEditorChatOperation(second, check),
    ]);
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    expect(readEditorChatOperation('user', scope)).toEqual(first);
  });
  it('compares the entire row and preserves another update, including its incarnation', async () => {
    const first = await row();
    await reserveEditorChatOperation(first, check);
    const second = { ...first, state: 'uncertain' as const, localGeneration: 1 };
    await compareEditorChatOperation('user', scope, first, second, check);
    await expect(
      compareEditorChatOperation(
        'user',
        scope,
        first,
        { ...first, state: 'settled', localGeneration: 1 },
        check,
      ),
    ).rejects.toMatchObject({ reason: 'conflict' });
    expect(() => assertEditorChatOperation(first, check)).toThrow(EditorChatStorageError);
    await expect(
      compareEditorChatOperation(
        'user',
        scope,
        second,
        { ...second, resourceToken: hash('c'), localGeneration: 2 },
        check,
      ),
    ).rejects.toMatchObject({ reason: 'invalid-transition' });
    expect(readEditorChatOperation('user', scope)).toEqual(second);
  });
  it('persists cancellation monotonically without changing the original operation or hash', async () => {
    const first = await row();
    await reserveEditorChatOperation(first, check);
    const canceled = await cancelEditorChatOperation(first, check);
    expect(canceled).toMatchObject({
      intent: 'cancel',
      operationId: first.operationId,
      requestHash: first.requestHash,
      action: first.action,
      localGeneration: 1,
    });
    expect(readEditorChatOperation('user', scope)).toEqual(canceled);
    await expect(
      compareEditorChatOperation(
        'user',
        scope,
        canceled,
        { ...canceled!, intent: 'observe', localGeneration: 2 },
        check,
      ),
    ).rejects.toMatchObject({ reason: 'invalid-transition' });
    await expect(forgetEditorChatOperation(canceled!, check)).rejects.toMatchObject({
      reason: 'invalid-transition',
    });
    const settled = { ...canceled!, state: 'settled' as const, localGeneration: 2 };
    await compareEditorChatOperation('user', scope, canceled, settled, check);
    await forgetEditorChatOperation(settled, check);
    expect(readEditorChatOperation('user', scope)).toBeNull();
  });
  it('does not erase another settled snapshot through a stale forget', async () => {
    const first = await row();
    await reserveEditorChatOperation(first, check);
    const settled = { ...first, state: 'settled' as const, localGeneration: 1 };
    await compareEditorChatOperation('user', scope, first, settled, check);
    const latest = { ...settled, localGeneration: 2 };
    await compareEditorChatOperation('user', scope, settled, latest, check);
    await expect(forgetEditorChatOperation(settled, check)).rejects.toMatchObject({
      reason: 'conflict',
    });
    expect(readEditorChatOperation('user', scope)).toEqual(latest);
  });
  it.each(['{bad', '{"schemaVersion":99}', '{"prompt":"private"}'])(
    'retains corrupt, future or plaintext rows instead of overwriting them (%s)',
    async (raw) => {
      const key = editorChatOperationKey('user', scope);
      localStorage.setItem(key, raw);
      expect(() => readEditorChatOperation('user', scope)).toThrow(EditorChatStorageError);
      await expect(reserveEditorChatOperation(await row(), check)).rejects.toMatchObject({
        reason: 'corrupt',
      });
      expect(localStorage.getItem(key)).toBe(raw);
    },
  );
  it('rejects a null resource outside the approved adventure root persona operation', async () => {
    const value = await row();
    const invalid = {
      ...value,
      target: { kind: 'adventure' as const, id: 'adventure' },
      resource: null,
    };
    await expect(reserveEditorChatOperation(invalid, check)).rejects.toThrow();
    expect(localStorage.length).toBe(0);
  });
  it('rejects a row belonging to another owner or scope', async () => {
    const value = await row();
    localStorage.setItem(
      editorChatOperationKey('user', scope),
      JSON.stringify({ ...value, ownerId: 'other' }),
    );
    expect(() => readEditorChatOperation('user', scope)).toThrow(EditorChatStorageError);
    expect(readEditorChatOperation('other', scope)).toBeNull();
  });
  it('fails closed without Web Locks while keeping inspection available', async () => {
    const value = await row();
    vi.stubGlobal('navigator', {});
    expect(readEditorChatOperation('user', scope)).toBeNull();
    await expect(reserveEditorChatOperation(value, check)).rejects.toMatchObject({
      reason: 'locks-unavailable',
    });
  });
  it('does not claim persistence on quota failure or an unconfirmed write', async () => {
    const value = await row();
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('quota');
    });
    await expect(reserveEditorChatOperation(value, check)).rejects.toMatchObject({
      reason: 'unavailable',
    });
    expect(readEditorChatOperation('user', scope)).toBeNull();
    set.mockImplementationOnce(() => undefined);
    await expect(reserveEditorChatOperation(value, check)).rejects.toMatchObject({
      reason: 'conflict',
    });
    expect(readEditorChatOperation('user', scope)).toBeNull();
  });
  it('reports blocked storage access without deleting the persisted intent', async () => {
    const value = await row();
    await reserveEditorChatOperation(value, check);
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementationOnce(() => {
      throw new Error('denied');
    });
    expect(() => readEditorChatOperation('user', scope)).toThrow(EditorChatStorageError);
    get.mockRestore();
    expect(readEditorChatOperation('user', scope)).toEqual(value);
  });
  it('does not write after the host loses ownership while waiting for the lock', async () => {
    const value = await row();
    let active = true;
    const promise = reserveEditorChatOperation(value, () => {
      if (!active) throw new Error('stale');
    });
    active = false;
    await expect(promise).rejects.toThrow('stale');
    expect(readEditorChatOperation('user', scope)).toBeNull();
  });
  it('rejects generation overflow and immutable-operation changes', async () => {
    const first = await row();
    await reserveEditorChatOperation(first, check);
    await expect(
      compareEditorChatOperation(
        'user',
        scope,
        first,
        { ...first, requestHash: hash('b'), localGeneration: 1 },
        check,
      ),
    ).rejects.toMatchObject({ reason: 'invalid-transition' });
    const max = { ...first, localGeneration: Number.MAX_SAFE_INTEGER };
    localStorage.setItem(editorChatOperationKey('user', scope), JSON.stringify(max));
    await expect(cancelEditorChatOperation(max, check)).rejects.toThrow();
    expect(readEditorChatOperation('user', scope)).toEqual(max);
  });
  it('notifies only the matching scope and releases listeners', async () => {
    const listener = vi.fn();
    const stop = subscribeEditorChatOperation('user', scope, listener);
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' }));
    expect(listener).not.toHaveBeenCalled();
    await reserveEditorChatOperation(await row(), check);
    expect(listener).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    window.dispatchEvent(
      new StorageEvent('storage', { key: editorChatOperationKey('user', scope) }),
    );
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('atomic settled operation handoff', () => {
  async function settled() {
    const first = await row();
    await reserveEditorChatOperation(first, check);
    const done = { ...first, state: 'settled' as const, localGeneration: 1 };
    await compareEditorChatOperation('user', scope, first, done, check);
    return done;
  }
  function next(first: EditorChatOperationRow) {
    return {
      ...first,
      operationId: 'new-operation',
      state: 'pending' as const,
      intent: 'observe' as const,
      requestHash: hash('b'),
      localGeneration: 0,
    };
  }
  it('replaces settled metadata under one lock without a remove/reserve gap', async () => {
    const first = await settled();
    const candidate = next(first);
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    const before = lockCalls;
    await handoffEditorChatOperation(first, candidate, check);
    expect(lockCalls - before).toBe(1);
    expect(remove).not.toHaveBeenCalled();
    expect(readEditorChatOperation('user', scope)).toEqual(candidate);
  });
  it('preserves the settled row if quota prevents persistence', async () => {
    const first = await settled();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    await expect(handoffEditorChatOperation(first, next(first), check)).rejects.toMatchObject({
      reason: 'unavailable',
    });
    expect(readEditorChatOperation('user', scope)).toEqual(first);
  });
  it('allows only one tab to hand off the same complete snapshot', async () => {
    const first = await settled();
    const a = next(first);
    const b = { ...a, operationId: 'other-operation', requestHash: hash('c') };
    const result = await Promise.allSettled([
      handoffEditorChatOperation(first, a, check),
      handoffEditorChatOperation(first, b, check),
    ]);
    expect(result.map((entry) => entry.status)).toEqual(['fulfilled', 'rejected']);
    expect(readEditorChatOperation('user', scope)).toEqual(a);
  });
  it('refuses reopening the same operation or changing actor/scope', async () => {
    const first = await settled();
    for (const candidate of [
      { ...next(first), operationId: first.operationId },
      { ...next(first), ownerId: 'another-user' },
      { ...next(first), target: { ...scope.target, id: 'other-book' } },
      { ...next(first), state: 'uncertain' as const },
      { ...next(first), intent: 'cancel' as const },
    ])
      await expect(
        handoffEditorChatOperation(first, candidate as EditorChatOperationRow, check),
      ).rejects.toThrow();
    expect(readEditorChatOperation('user', scope)).toEqual(first);
  });
});
