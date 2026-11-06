import { beforeEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  beginLiteraryOperation,
  finishLiteraryOperation,
  listLiteraryPendingOperations,
  withLiteraryRecovery,
} from './literaryRecoveryStorage';
beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  vi.stubGlobal('crypto', webcrypto);
});
const request = () => ({
  operationId: 'editorial-operation-0001',
  expectedRevision: 0,
  contract: { premise: 'Texto privado' },
});
it('preserva metadata antes da RPC e encerra somente após confirmação', async () => {
  const send = vi.fn(() => {
    expect(listLiteraryPendingOperations('author', 'book')).toHaveLength(1);
    return Promise.resolve({ revision: 1 });
  });
  await expect(
    withLiteraryRecovery('author', 'book', 'contract', 'current', request(), send),
  ).resolves.toEqual({ revision: 1 });
  expect(send).toHaveBeenCalledTimes(1);
  expect(listLiteraryPendingOperations('author', 'book')).toEqual([]);
});
it('não persiste prosa nem mistura contas e livros', async () => {
  await beginLiteraryOperation('author', 'book', 'contract', 'current', request());
  expect(listLiteraryPendingOperations('author', 'book')).toHaveLength(1);
  expect(listLiteraryPendingOperations('other', 'book')).toEqual([]);
  expect(listLiteraryPendingOperations('author', 'other')).toEqual([]);
  expect(localStorage.getItem(localStorage.key(0)!)).not.toContain('Texto privado');
});
it('recusa reusar o mesmo ID com outro conteúdo e conserva acompanhamento divergente', async () => {
  const entry = await beginLiteraryOperation('author', 'book', 'contract', 'current', request());
  await expect(
    beginLiteraryOperation('author', 'book', 'contract', 'current', {
      ...request(),
      expectedRevision: 1,
    }),
  ).rejects.toThrow();
  expect(() => finishLiteraryOperation({ ...entry, expectedRevision: 1 })).toThrow();
  expect(listLiteraryPendingOperations('author', 'book')).toHaveLength(1);
});
it('resposta incerta conserva pedido; rejeição definitiva permite correção', async () => {
  await expect(
    withLiteraryRecovery('author', 'book', 'contract', 'current', request(), () =>
      Promise.reject(new Error('rede')),
    ),
  ).rejects.toThrow();
  expect(listLiteraryPendingOperations('author', 'book')).toHaveLength(1);
  await expect(
    withLiteraryRecovery('author', 'book', 'contract', 'current', request(), () =>
      Promise.reject(
        Object.assign(new Error('conflito'), { code: 'functions/failed-precondition' }),
      ),
    ),
  ).rejects.toThrow();
  expect(listLiteraryPendingOperations('author', 'book')).toEqual([]);
});
it('não envia sem confirmar persistência local', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('indisponível');
  });
  const send = vi.fn();
  await expect(
    withLiteraryRecovery('author', 'book', 'contract', 'current', request(), send),
  ).rejects.toThrow();
  expect(send).not.toHaveBeenCalled();
});
