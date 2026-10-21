import { beforeEach, expect, it, vi } from 'vitest';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { renderRichText } from '@/shared/lib/sanitizeRichText';
import {
  captureWorkHistoryBackup,
  getWorkHistoryBackupSource,
  copyWorkVersionText,
  createWorkVersion,
  deleteWorkVersion,
  getWorkVersionSource,
  listWorkVersions,
  readCompleteWorkVersion,
  readWorkVersion,
  restoreWorkVersion,
} from '../services/workHistoryService';
import { workHistoryHash, type VersionSummary, type VersionTarget } from '../model/workHistory';
const app = vi.hoisted(() => ({ name: 'owner-app' }));
vi.mock('@/shared/lib', () => ({ getFirebaseApp: () => app, renderRichText }));
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn().mockReturnValue({}),
  httpsCallable: vi.fn(),
}));
const call = vi.fn();
const target: VersionTarget = { kind: 'book', id: 'book' };
const resource = { kind: 'chapter' as const, id: 'chapter' };
let version: VersionSummary;
beforeEach(async () => {
  vi.clearAllMocks();
  call.mockReset();
  vi.mocked(httpsCallable).mockReturnValue(call as never);
  version = {
    id: 'version',
    target,
    resource,
    createdAt: 2,
    reason: 'manual',
    label: null,
    wordCount: 2,
    byteLength: new TextEncoder().encode('á😀\n<strong>texto</strong>').byteLength,
    contentHash: await workHistoryHash('á😀\n<strong>texto</strong>'),
    chunkCount: 2,
  };
});
it('chama as sete APIs autenticadas preservando parâmetros e janelas vazias', async () => {
  call.mockResolvedValue({ data: null });
  expect(await getWorkVersionSource({ target, resource })).toBeNull();
  expect(getFunctions).toHaveBeenCalledWith(app, 'us-central1');
  expect(httpsCallable).toHaveBeenLastCalledWith({}, 'getWorkVersionSource');
  await getWorkHistoryBackupSource({ target });
  expect(httpsCallable).toHaveBeenLastCalledWith({}, 'getWorkHistoryBackupSource');
  expect(call).toHaveBeenLastCalledWith({ target });
  const create = {
    target,
    resource,
    operationId: 'manual',
    expectedSourceToken: 'a'.repeat(64),
    label: 'Antes de revisar',
  };
  await createWorkVersion(create);
  expect(call).toHaveBeenLastCalledWith(create);
  call.mockResolvedValue({ data: { items: [], nextCursor: 'next' } });
  expect(await listWorkVersions({ target, cursor: null, limit: 25 })).toEqual({
    items: [],
    nextCursor: 'next',
  });
  await readWorkVersion({ target, versionId: 'version', cursor: 'body-next', limit: 4 });
  expect(call).toHaveBeenLastCalledWith({
    target,
    versionId: 'version',
    cursor: 'body-next',
    limit: 4,
  });
  const restore = {
    target,
    resource,
    versionId: 'version',
    operationId: 'restore',
    expectedSourceToken: 'b'.repeat(64),
  };
  await restoreWorkVersion(restore);
  expect(call).toHaveBeenLastCalledWith(restore);
  await deleteWorkVersion({ target, versionId: 'version', operationId: 'delete' });
  expect(call).toHaveBeenLastCalledWith({ target, versionId: 'version', operationId: 'delete' });
});
it('reconstitui Unicode e HTML exatos somente depois da última janela autorizada', async () => {
  call
    .mockResolvedValueOnce({
      data: { version, chunks: [{ index: 0, content: 'á😀\n' }], nextCursor: 'last' },
    })
    .mockResolvedValueOnce({
      data: {
        version,
        chunks: [{ index: 1, content: '<strong>texto</strong>' }],
        nextCursor: null,
      },
    });
  expect(await readCompleteWorkVersion({ target, versionId: 'version' })).toEqual({
    version,
    content: 'á😀\n<strong>texto</strong>',
  });
  expect(call).toHaveBeenNthCalledWith(2, {
    target,
    versionId: 'version',
    cursor: 'last',
    limit: 4,
  });
});
it.each(['order', 'bytes', 'hash', 'manifest', 'scope', 'count', 'oversize', 'cursor'])(
  'recusa corpo incompleto ou inconsistente por %s, sem devolver preview parcial',
  async (problem) => {
    const first = {
      version,
      chunks: [{ index: 0, content: 'á😀\n' }],
      nextCursor: 'last' as string | null,
    };
    const last = {
      version: { ...version },
      chunks: [{ index: 1, content: '<strong>texto</strong>' }],
      nextCursor: null as string | null,
    };
    if (problem === 'order') last.chunks[0]!.index = 3;
    if (problem === 'bytes') last.version.byteLength++;
    if (problem === 'hash') {
      first.version = { ...version, contentHash: 'f'.repeat(64) };
      last.version = first.version;
    }
    if (problem === 'manifest') last.version.label = 'Alterada';
    if (problem === 'scope')
      first.version = { ...version, target: { kind: 'book', id: 'other-book' } };
    if (problem === 'count') {
      first.version = { ...version, chunkCount: 3 };
      last.version = first.version;
    }
    if (problem === 'oversize') first.chunks[0]!.content = '😀'.repeat(16_385);
    if (problem === 'cursor') last.nextCursor = 'last';
    call.mockResolvedValueOnce({ data: first }).mockResolvedValueOnce({ data: last });
    await expect(readCompleteWorkVersion({ target, versionId: 'version' })).rejects.toThrow(
      'Não foi possível verificar esta versão',
    );
  },
);
it('não devolve nem continua uma leitura cancelada por conta ou seleção', async () => {
  let active = true;
  call.mockImplementationOnce(() => {
    active = false;
    return Promise.resolve({
      data: { version, chunks: [{ index: 0, content: 'á😀\n' }], nextCursor: 'last' },
    });
  });
  expect(await readCompleteWorkVersion({ target, versionId: 'version' }, () => active)).toBeNull();
  expect(call).toHaveBeenCalledTimes(1);
  expect(await readCompleteWorkVersion({ target, versionId: 'version' }, () => false)).toBeNull();
  expect(call).toHaveBeenCalledTimes(1);
});
it('nega toda a leitura se a autorização falha na última janela', async () => {
  call
    .mockResolvedValueOnce({
      data: { version, chunks: [{ index: 0, content: 'á😀\n' }], nextCursor: 'last' },
    })
    .mockRejectedValueOnce(
      Object.assign(new Error('Histórico indisponível'), { code: 'functions/permission-denied' }),
    );
  await expect(readCompleteWorkVersion({ target, versionId: 'version' })).rejects.toThrow(
    'Histórico indisponível',
  );
});
it('preserva falha definitiva e mantém respostas incertas reconhecíveis para o recibo', async () => {
  const conflict = Object.assign(new Error('O texto mudou'), {
    code: 'functions/failed-precondition',
  });
  call
    .mockRejectedValueOnce(conflict)
    .mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'functions/unavailable' }))
    .mockRejectedValueOnce(null);
  await expect(
    createWorkVersion({
      target,
      resource,
      operationId: 'operation',
      expectedSourceToken: 'a'.repeat(64),
    }),
  ).rejects.toBe(conflict);
  await expect(getWorkVersionSource({ target, resource })).rejects.toMatchObject({
    code: 'functions/unavailable',
  });
  await expect(listWorkVersions({ target })).rejects.toMatchObject({
    code: 'functions/unavailable',
  });
});
it('copia texto visível com separação dos blocos sem executar markup', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  await copyWorkVersionText(
    '<p>Primeiro <strong>parágrafo</strong></p><p>Segundo<br>trecho</p><script>alert(1)</script>',
  );
  expect(writeText).toHaveBeenCalledWith('Primeiro parágrafo\nSegundo\ntrecho');
});

const backupEpoch = () => ({ schemaVersion: 1, historyRevision: 2, sourceToken: 'd'.repeat(64) });
const bodyPage = (summary: VersionSummary, content = '') => ({
  version: summary,
  chunks: [{ index: 0, content }],
  nextCursor: null,
});
async function emptyVersion(id = 'removed-version'): Promise<VersionSummary> {
  return {
    ...version,
    id,
    resource: { kind: 'chapter', id: 'deleted-chapter' },
    reason: 'before-restore',
    label: 'Anterior à restauração',
    wordCount: 0,
    byteLength: 0,
    contentHash: await workHistoryHash(''),
    chunkCount: 1,
  };
}
function response(data: unknown) {
  return { data };
}

it('captura todas as páginas e corpos exatos, inclusive versão vazia de capítulo removido, sem token no arquivo', async () => {
  const removed = await emptyVersion();
  call
    .mockResolvedValueOnce(response(backupEpoch()))
    .mockResolvedValueOnce(response({ items: [version], nextCursor: 'next-page' }))
    .mockResolvedValueOnce(
      response({ version, chunks: [{ index: 0, content: 'á😀\n' }], nextCursor: 'next-body' }),
    )
    .mockResolvedValueOnce(
      response({
        version,
        chunks: [{ index: 1, content: '<strong>texto</strong>' }],
        nextCursor: null,
      }),
    )
    .mockResolvedValueOnce(response({ items: [removed], nextCursor: null }))
    .mockResolvedValueOnce(response(bodyPage(removed)))
    .mockResolvedValueOnce(response(backupEpoch()));
  const result = await captureWorkHistoryBackup(target);
  expect(result).toEqual({
    schemaVersion: 1,
    versions: [
      { version, content: 'á😀\n<strong>texto</strong>' },
      { version: removed, content: '' },
    ],
  });
  expect(JSON.stringify(result)).not.toContain(backupEpoch().sourceToken);
  expect(call).toHaveBeenCalledTimes(7);
  expect(call).toHaveBeenNthCalledWith(1, { target });
  expect(call).toHaveBeenNthCalledWith(7, { target });
  for (const index of [2, 3, 4, 5, 6])
    expect(call.mock.calls[index - 1]?.[0]).toMatchObject({
      target,
      expectedHistoryToken: backupEpoch().sourceToken,
    });
  expect(call).toHaveBeenNthCalledWith(5, {
    target,
    cursor: 'next-page',
    limit: 50,
    expectedHistoryToken: backupEpoch().sourceToken,
  });
});

it('catálogo vazio também exige confirmação final e não fabrica versões', async () => {
  call
    .mockResolvedValueOnce(response(backupEpoch()))
    .mockResolvedValueOnce(response({ items: [], nextCursor: null }))
    .mockResolvedValueOnce(response(backupEpoch()));
  expect(await captureWorkHistoryBackup(target)).toEqual({ schemaVersion: 1, versions: [] });
  expect(call).toHaveBeenCalledTimes(3);
});

it.each(['token', 'revision'])(
  'mudança final de %s descarta captura inteira em vez de devolver seleção antiga',
  async (field) => {
    const changed = {
      ...backupEpoch(),
      ...(field === 'token' ? { sourceToken: 'e'.repeat(64) } : { historyRevision: 3 }),
    };
    call
      .mockResolvedValueOnce(response(backupEpoch()))
      .mockResolvedValueOnce(response({ items: [], nextCursor: null }))
      .mockResolvedValueOnce(response(changed));
    await expect(captureWorkHistoryBackup(target)).rejects.toThrow('histórico completo');
  },
);

it.each([1, 2, 3, 4])(
  'invalidação após I/O %s não devolve nem persiste captura parcial',
  async (step) => {
    const removed = await emptyVersion();
    let current = true,
      index = 0;
    const data = [
      backupEpoch(),
      { items: [removed], nextCursor: null },
      bodyPage(removed),
      backupEpoch(),
    ];
    call.mockImplementation(() => {
      index++;
      if (index === step) current = false;
      return Promise.resolve(response(data[index - 1]));
    });
    expect(await captureWorkHistoryBackup(target, () => current)).toBeNull();
    expect(call).toHaveBeenCalledTimes(step);
  },
);

it('captura já invalidada não inicia RPC', async () => {
  expect(await captureWorkHistoryBackup(target, () => false)).toBeNull();
  expect(call).not.toHaveBeenCalled();
});

it('revogação entre catálogo e corpo rejeita sem fallback para texto parcial', async () => {
  call
    .mockResolvedValueOnce(response(backupEpoch()))
    .mockResolvedValueOnce(response({ items: [version], nextCursor: null }))
    .mockRejectedValueOnce(
      Object.assign(new Error('Projeto indisponível'), { code: 'functions/not-found' }),
    );
  await expect(captureWorkHistoryBackup(target)).rejects.toMatchObject({
    code: 'functions/not-found',
  });
  expect(call).toHaveBeenCalledTimes(3);
});

it.each([
  'duplicate',
  'cursor',
  'body-summary',
  'body-extra',
  'scope',
  'extra-page',
  'source',
  'resource',
])('não aceita manifesto de backup inconsistente: %s', async (problem) => {
  const removed = await emptyVersion();
  if (problem === 'source') {
    call.mockResolvedValueOnce(response({ ...backupEpoch(), historyRevision: null }));
  } else {
    call.mockResolvedValueOnce(response(backupEpoch()));
    if (problem === 'extra-page') {
      call.mockResolvedValueOnce(response({ items: [], nextCursor: null, hidden: 'não exportar' }));
    } else {
      const summary = {
        ...removed,
        ...(problem === 'scope' ? { target: { kind: 'book', id: 'other' } } : {}),
        ...(problem === 'resource' ? { resource: { kind: 'block', id: 'block' } } : {}),
      };
      call.mockResolvedValueOnce(
        response({
          items: problem === 'duplicate' ? [summary, summary] : [summary],
          nextCursor: problem === 'cursor' ? 'same-page' : null,
        }),
      );
      const read = {
        ...removed,
        ...(problem === 'body-summary' ? { label: 'metadado diferente' } : {}),
        ...(problem === 'body-extra' ? { secret: 'campo não contratado' } : {}),
      };
      call.mockResolvedValueOnce(response(bodyPage(read)));
      if (problem === 'cursor')
        call.mockResolvedValueOnce(response({ items: [], nextCursor: 'same-page' }));
    }
  }
  await expect(captureWorkHistoryBackup(target)).rejects.toThrow('histórico completo');
});
