import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => {
  const auth: { currentUser: { uid: string } | null } = { currentUser: { uid: 'author' } };
  return {
    auth,
    call: vi.fn<(name: string, input: Record<string, unknown>) => Promise<{ data: unknown }>>(),
    hash: vi.fn<(content: string) => Promise<string>>(),
  };
});
vi.mock('@/shared/lib', () => ({ auth: mocks.auth, getFirebaseApp: () => ({}) }));
vi.mock('@/features/ai-assistant', () => ({ chatDocumentHash: mocks.hash }));
vi.mock('firebase/functions', () => ({
  getFunctions: () => ({}),
  httpsCallable: (_functions: unknown, name: string) => (input: Record<string, unknown>) =>
    mocks.call(name, input),
}));
import {
  createServerLegacyChapter,
  saveServerLegacyChapter,
  deleteServerLegacyChapters,
  prepareServerBookWordCount,
} from '../services/legacyChapterService';
const sha = (content: string) => createHash('sha256').update(content).digest('hex');
beforeEach(() => {
  mocks.auth.currentUser = { uid: 'author' };
  mocks.call.mockReset();
  mocks.hash.mockReset().mockImplementation((content) => Promise.resolve(sha(content)));
});
describe('escritores legados do manuscrito verificado', () => {
  it('não usa a confirmação incerta para sobrescrever uma edição posterior de outro dispositivo', async () => {
    let stored = 'A';
    let pendingReceipt = '';
    mocks.call.mockImplementation((_name, input) => {
      if (pendingReceipt === input.operationId && stored !== 'B')
        return Promise.reject(
          Object.assign(new Error('alterado em outro dispositivo'), {
            code: 'functions/failed-precondition',
          }),
        );
      if (input.expectedContentHash !== sha(stored))
        return Promise.reject(
          Object.assign(new Error('conflito'), { code: 'functions/failed-precondition' }),
        );
      pendingReceipt = String(input.operationId);
      stored = String(input.content);
      return Promise.reject(
        Object.assign(new Error('resposta perdida'), { code: 'functions/unavailable' }),
      );
    });
    const base = {
      bookId: 'other-device',
      chapterId: 'chapter',
      expectedContent: 'A',
      expectedOwnerId: 'author',
    };
    await expect(saveServerLegacyChapter({ ...base, content: 'B' })).rejects.toThrow(
      'resposta perdida',
    );
    stored = 'Texto de outro dispositivo';
    await expect(saveServerLegacyChapter({ ...base, content: 'C' })).rejects.toThrow(
      'alterado em outro dispositivo',
    );
    expect(stored).toBe('Texto de outro dispositivo');
    expect(mocks.call.mock.calls.map((call) => call[1].content)).toEqual(['B', 'B']);
  });

  it('não confirma para a nova conta uma resposta que chegou após a troca de usuário', async () => {
    mocks.call.mockImplementation((_name, input) => {
      mocks.auth.currentUser = { uid: 'other' };
      return Promise.resolve({ data: { content: input.content, wordCount: 1, updatedAt: 200 } });
    });
    await expect(
      saveServerLegacyChapter({
        bookId: 'late-response',
        chapterId: 'chapter',
        content: 'B',
        expectedContent: 'A',
        expectedOwnerId: 'author',
      }),
    ).rejects.toThrow('A conta mudou');
    expect(mocks.call).toHaveBeenCalledTimes(1);
  });

  it('confirma o salvamento aplicado com resposta incerta antes de salvar a próxima edição', async () => {
    let stored = 'A';
    const receipts = new Map<string, { content: string; wordCount: number; updatedAt: number }>();
    mocks.call.mockImplementation((_name, input) => {
      const id = input.operationId,
        content = input.content;
      if (typeof id !== 'string' || typeof content !== 'string') throw new Error('Pedido inválido');
      const previous = receipts.get(id);
      if (previous) return Promise.resolve({ data: previous });
      if (input.expectedContentHash !== sha(stored))
        return Promise.reject(
          Object.assign(new Error('conflito'), { code: 'functions/failed-precondition' }),
        );
      stored = content;
      const result = { content, wordCount: 1, updatedAt: 200 };
      receipts.set(id, result);
      if (content === 'B')
        return Promise.reject(
          Object.assign(new Error('resposta perdida'), { code: 'functions/unavailable' }),
        );
      return Promise.resolve({ data: result });
    });
    const base = {
      bookId: 'uncertain-evolution',
      chapterId: 'chapter',
      expectedContent: 'A',
      expectedOwnerId: 'author',
    };
    await expect(saveServerLegacyChapter({ ...base, content: 'B' })).rejects.toThrow(
      'resposta perdida',
    );
    await expect(saveServerLegacyChapter({ ...base, content: 'C' })).resolves.toMatchObject({
      content: 'C',
    });
    expect(stored).toBe('C');
    expect(mocks.call.mock.calls.map((call) => call[1].content)).toEqual(['B', 'B', 'C']);
    expect(mocks.call.mock.calls[0]![1]).toEqual(mocks.call.mock.calls[1]![1]);
    expect(mocks.call.mock.calls[2]![1].expectedContentHash).toBe(sha('B'));
  });

  it('conserva a base observada ao confirmar duas respostas incertas e nunca procura uma base remota para sobrescrever', async () => {
    let stored = 'A';
    const receipts = new Map<string, { content: string; wordCount: number; updatedAt: number }>();
    mocks.call.mockImplementation((_name, input) => {
      const id = input.operationId,
        content = input.content;
      if (typeof id !== 'string' || typeof content !== 'string') throw new Error('Pedido inválido');
      const previous = receipts.get(id);
      if (previous) return Promise.resolve({ data: previous });
      if (input.expectedContentHash !== sha(stored))
        return Promise.reject(
          Object.assign(new Error('conflito'), { code: 'functions/failed-precondition' }),
        );
      stored = content;
      const result = { content, wordCount: 1, updatedAt: 200 };
      receipts.set(id, result);
      return content === 'D'
        ? Promise.resolve({ data: result })
        : Promise.reject(
            Object.assign(new Error('resposta perdida'), { code: 'functions/unavailable' }),
          );
    });
    const base = {
      bookId: 'uncertain-chain',
      chapterId: 'chapter',
      expectedContent: 'A',
      expectedOwnerId: 'author',
    };
    await expect(saveServerLegacyChapter({ ...base, content: 'B' })).rejects.toThrow(
      'resposta perdida',
    );
    await expect(saveServerLegacyChapter({ ...base, content: 'C' })).rejects.toThrow(
      'resposta perdida',
    );
    await expect(saveServerLegacyChapter({ ...base, content: 'D' })).resolves.toMatchObject({
      content: 'D',
    });
    expect(stored).toBe('D');
    expect(mocks.call.mock.calls.map((call) => call[1].content)).toEqual(['B', 'B', 'C', 'C', 'D']);
    expect(mocks.call.mock.calls.map((call) => call[1].expectedContentHash)).toEqual([
      sha('A'),
      sha('A'),
      sha('B'),
      sha('B'),
      sha('C'),
    ]);
  });

  it('repete criação incerta com o mesmo recibo e permite uma criação igual após confirmação', async () => {
    mocks.call
      .mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'functions/unavailable' }))
      .mockResolvedValue({ data: { id: 'confirmed', content: 'Prosa' } });
    const input = { title: 'Capítulo', content: 'Prosa' };
    await expect(createServerLegacyChapter('create-retry', input)).rejects.toThrow('offline');
    await expect(createServerLegacyChapter('create-retry', input)).resolves.toEqual({
      id: 'confirmed',
      content: 'Prosa',
    });
    const first = mocks.call.mock.calls[0]![1];
    const retry = mocks.call.mock.calls[1]![1];
    expect(first.operationId).toEqual(retry.operationId);
    await createServerLegacyChapter('create-retry', input);
    expect(mocks.call.mock.calls[2]![1].operationId).not.toEqual(first.operationId);
  });
  it('usa o recibo capturado pela importação e não o persiste como campo do capítulo', async () => {
    mocks.call.mockResolvedValue({ data: { id: 'imported' } });
    await createServerLegacyChapter('import', { title: 'Importado', creationId: 'import-receipt' });
    expect(mocks.call).toHaveBeenCalledWith('createLegacyChapter', {
      bookId: 'import',
      input: { title: 'Importado' },
      operationId: 'import-receipt',
    });
  });
  it('envia hash da base carregada e metadados no mesmo pedido, sem conteúdo da base ou conta no payload', async () => {
    mocks.call.mockResolvedValue({
      data: { content: 'Ar<strong>tu</strong>r', wordCount: 1, updatedAt: 200 },
    });
    await expect(
      saveServerLegacyChapter({
        bookId: 'save',
        chapterId: 'chapter',
        content: 'Ar<strong>tu</strong>r',
        expectedContent: 'Base original',
        expectedOwnerId: 'author',
        patch: { title: 'Novo título' },
      }),
    ).resolves.toMatchObject({ wordCount: 1 });
    const payload = mocks.call.mock.calls[0]![1];
    expect(payload).toMatchObject({
      expectedContentHash: sha('Base original'),
      patch: { title: 'Novo título' },
    });
    expect(payload).not.toHaveProperty('expectedContent');
    expect(payload).not.toHaveProperty('expectedOwnerId');
    expect(payload).not.toHaveProperty('wordCount');
  });
  it('preserva o recibo de salvamento incerto com a mesma base e não busca uma base nova', async () => {
    mocks.call
      .mockRejectedValueOnce(
        Object.assign(new Error('timeout'), { code: 'functions/deadline-exceeded' }),
      )
      .mockResolvedValueOnce({ data: { content: 'Texto novo', wordCount: 2, updatedAt: 200 } });
    const request = {
      bookId: 'save-retry',
      chapterId: 'chapter',
      content: 'Texto novo',
      expectedContent: 'Original',
    };
    await expect(saveServerLegacyChapter(request)).rejects.toThrow('timeout');
    await saveServerLegacyChapter(request);
    expect(mocks.call.mock.calls[0]![1]).toEqual(mocks.call.mock.calls[1]![1]);
  });
  it('recusa o flush de outra conta antes de enviar qualquer alteração', async () => {
    mocks.auth.currentUser = { uid: 'other' };
    await expect(
      saveServerLegacyChapter({
        bookId: 'private',
        chapterId: 'chapter',
        content: 'Local',
        expectedContent: 'Base',
        expectedOwnerId: 'author',
      }),
    ).rejects.toThrow('A conta mudou');
    expect(mocks.call).not.toHaveBeenCalled();
  });
  it('recusa a troca de conta durante o cálculo do hash', async () => {
    let finish!: (hash: string) => void;
    mocks.hash.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const request = saveServerLegacyChapter({
      bookId: 'changed',
      chapterId: 'chapter',
      content: 'Local',
      expectedContent: 'Base',
      expectedOwnerId: 'author',
    });
    mocks.auth.currentUser = { uid: 'other' };
    finish(sha('Base'));
    await expect(request).rejects.toThrow('A conta mudou');
    expect(mocks.call).not.toHaveBeenCalled();
  });
  it('mantém o checkpoint de preparação em chamadas limitadas sem somar uma página incompleta', async () => {
    mocks.call
      .mockResolvedValueOnce({ data: { complete: false, wordCount: null } })
      .mockResolvedValueOnce({ data: { complete: true, wordCount: 9 } });
    await expect(prepareServerBookWordCount('count')).resolves.toBe(9);
    expect(mocks.call.mock.calls[0]![0]).toBe('prepareWorkWordCount');
    expect(mocks.call.mock.calls[0]![1]).toEqual(mocks.call.mock.calls[1]![1]);
    expect(mocks.call.mock.calls[0]![1]).toMatchObject({
      target: { kind: 'book', id: 'count' },
      limit: 25,
    });
  });
  it('remove somente identidades e versões observadas no pedido confirmado', async () => {
    mocks.call.mockResolvedValue({ data: { deleted: 1 } });
    await expect(
      deleteServerLegacyChapters('delete', [{ id: 'chapter', expectedUpdatedAt: 10 }]),
    ).resolves.toEqual({ deleted: 1 });
    expect(mocks.call.mock.calls[0]).toEqual([
      'deleteLegacyChapters',
      expect.objectContaining({
        bookId: 'delete',
        chapters: [{ id: 'chapter', expectedUpdatedAt: 10 }],
      }),
    ]);
  });
});
