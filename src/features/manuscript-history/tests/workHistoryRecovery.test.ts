import { afterEach, expect, it, vi } from 'vitest';
import {
  clearPendingWorkHistoryOperation,
  readPendingWorkHistoryOperation,
  writePendingWorkHistoryOperation,
} from '../services/workHistoryRecovery';
import type { PendingWorkHistoryOperation, VersionTarget } from '../model/workHistory';
const target: VersionTarget = { kind: 'book', id: 'book' };
const pending: PendingWorkHistoryOperation = {
  kind: 'restore',
  input: {
    target,
    resource: { kind: 'chapter', id: 'chapter' },
    versionId: 'version',
    operationId: 'stable',
    expectedSourceToken: 'a'.repeat(64),
  },
};
afterEach(() => vi.restoreAllMocks());
it('preserva somente o pedido estável por conta, projeto e recurso', () => {
  writePendingWorkHistoryOperation('owner', pending);
  expect(readPendingWorkHistoryOperation('owner', target, pending.input.resource)).toEqual(pending);
  expect(readPendingWorkHistoryOperation('other-owner', target)).toBeNull();
  expect(readPendingWorkHistoryOperation('owner', { ...target, id: 'other-book' })).toBeNull();
  expect(
    readPendingWorkHistoryOperation('owner', target, { kind: 'scene', id: 'chapter' }),
  ).toBeNull();
  expect(localStorage.getItem(localStorage.key(0)!)).not.toContain('content');
  clearPendingWorkHistoryOperation('owner', pending);
  expect(readPendingWorkHistoryOperation('owner', target)).toBeNull();
});
it('não apaga um pedido novo ao limpar a confirmação antiga da mesma origem', () => {
  writePendingWorkHistoryOperation('owner', pending);
  writePendingWorkHistoryOperation('owner', {
    ...pending,
    input: { ...pending.input, operationId: 'newer' },
  });
  clearPendingWorkHistoryOperation('owner', pending);
  expect(readPendingWorkHistoryOperation('owner', target)?.input.operationId).toBe('newer');
});
it('remove campos arbitrários do recibo e recusa payload inválido', () => {
  writePendingWorkHistoryOperation('owner', {
    ...pending,
    input: { ...pending.input, content: 'texto que não deve persistir' },
  } as PendingWorkHistoryOperation);
  expect(localStorage.getItem(localStorage.key(0)!)).not.toContain('texto que não deve persistir');
  expect(() =>
    writePendingWorkHistoryOperation('owner', {
      ...pending,
      input: { ...pending.input, expectedSourceToken: 'invalid' },
    }),
  ).toThrow('preservar o pedido');
  localStorage.setItem(localStorage.key(0)!, '{broken');
  expect(readPendingWorkHistoryOperation('owner', target)).toBeNull();
});
it('erro de armazenamento impede preservar recibo antes da chamada de mutação', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Storage unavailable');
  });
  expect(() => writePendingWorkHistoryOperation('owner', pending)).toThrow('Storage unavailable');
});

it('registro danificado de outra origem não oculta um recibo válido do recurso solicitado', () => {
  writePendingWorkHistoryOperation('owner', pending);
  localStorage.setItem(localStorage.key(0)!, '{broken');
  const other: PendingWorkHistoryOperation = {
    ...pending,
    input: {
      ...pending.input,
      resource: { kind: 'chapter', id: 'chapter-y' },
      operationId: 'stable-y',
    },
  };
  writePendingWorkHistoryOperation('owner', other);
  expect(
    readPendingWorkHistoryOperation('owner', target, { kind: 'chapter', id: 'chapter-y' }),
  ).toEqual(other);
});
