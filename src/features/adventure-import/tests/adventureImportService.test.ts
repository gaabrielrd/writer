import { beforeEach, expect, it, vi } from 'vitest';
import * as rpc from '../services/adventureImportCallables';
import * as keyRpc from '../services/adventureImportKeyClient';
import {
  createAdventureImportSession,
  listValidatedAdventureImports,
} from '../services/adventureImportService';
import * as recovery from '../services/adventureImportRecovery';
import {
  installImportRecoveryHarness,
  installImportServer,
  uid,
  id,
  review,
  deferred,
} from './importTestHelpers';
vi.mock('../services/adventureImportCallables');
vi.mock('../services/adventureImportKeyClient');
let harness: ReturnType<typeof installImportRecoveryHarness>,
  server: Awaited<ReturnType<typeof installImportServer>>;
beforeEach(async () => {
  vi.resetAllMocks();
  harness = installImportRecoveryHarness();
  server = await installImportServer();
});
const session = () => createAdventureImportSession(uid, () => {}, vi.fn());
it('confirma revisão, protege, envia em ordem, materializa e ativa somente ao final', async () => {
  const p = await session().start(review, id);
  expect(p?.state).toBe('activated');
  expect(server.contents).toEqual(review.sections.map((s) => s.content));
  expect(rpc.appendAdventureImportSection).toHaveBeenCalledTimes(2);
  expect(rpc.advanceAdventureImport).toHaveBeenCalledTimes(2);
  expect(rpc.activateAdventureImport).toHaveBeenCalledOnce();
  expect(await recovery.readLocalAdventureImport(uid, id)).toBeNull();
});
it('retoma append confirmado com resposta perdida usando operação e payload idênticos após reload', async () => {
  server.failAfter('append');
  await expect(session().start(review, id)).rejects.toThrow('Resposta perdida');
  const record = await recovery.readLocalAdventureImport(uid, id);
  expect(record?.snapshot).toBeTruthy();
  expect(record?.journal?.action).toBe('appendAdventureImportSection');
  expect(JSON.stringify(record?.journal)).not.toContain('Olá');
  const first = vi.mocked(rpc.appendAdventureImportSection).mock.calls[0]![0];
  expect((await session().run(id))?.state).toBe('activated');
  expect(vi.mocked(rpc.appendAdventureImportSection).mock.calls[1]![0]).toEqual(first);
  expect(server.contents).toHaveLength(2);
});
it('resolve start incerto por metadata-only e sem depender de arquivo ou sinopse local', async () => {
  server.failAfter('start');
  await expect(session().start(review, id)).rejects.toThrow();
  const pending = (await recovery.readLocalAdventureImport(uid, id))!.journal!;
  expect((await session().verify(id))?.state).toBe('uploading');
  expect(rpc.resolveAdventureImportStart).toHaveBeenCalledWith({
    operationId: id,
    requestHash: pending.fingerprint,
    intent: 'cancel',
  });
  expect(rpc.appendAdventureImportSection).not.toHaveBeenCalled();
  await expect(session().run(id)).rejects.toThrow(/cópia protegida/);
});
it('instala fence para start nunca recebido usando apenas o journal', async () => {
  const record = recovery.newImportRecord(uid, id);
  record.journal = recovery.importJournal(uid, id, 'startAdventureImport', id, 'd'.repeat(64));
  await recovery.compareLocalAdventureImport(uid, id, null, record, () => {});
  expect(await session().verify(id)).toBeNull();
  expect(await recovery.readLocalAdventureImport(uid, id)).toBeNull();
  expect(keyRpc.getAdventureImportRecoveryKey).not.toHaveBeenCalled();
});
it('nenhum append ocorre enquanto chave está pendente, sem lock durante HTTP', async () => {
  const original = vi.mocked(keyRpc.getAdventureImportRecoveryKey).getMockImplementation()!,
    held = deferred<Awaited<ReturnType<typeof original>>>();
  vi.mocked(keyRpc.getAdventureImportRecoveryKey).mockImplementationOnce(() => {
    expect(harness.isLocked()).toBe(false);
    return held.promise;
  });
  const running = session().start(review, id);
  await vi.waitFor(() => expect(keyRpc.getAdventureImportRecoveryKey).toHaveBeenCalled());
  expect(rpc.appendAdventureImportSection).not.toHaveBeenCalled();
  held.resolve(
    await original({
      importId: id,
      jobToken: server.progress().jobToken,
      reviewHash: server.progress().reviewHash,
    }),
  );
  await running;
});
it('falha local antes do seal durável mantém preparação e bloqueia append', async () => {
  vi.mocked(keyRpc.getAdventureImportRecoveryKey).mockImplementationOnce(async () => {
    await Promise.resolve();
    harness.abortWrite();
    return { ...server.progress(), algorithm: 'AES-GCM', keyBase64: 'AA==' } as never;
  });
  await expect(session().start(review, id)).rejects.toThrow();
  expect(rpc.appendAdventureImportSection).not.toHaveBeenCalled();
  expect(server.progress().state).toBe('uploading');
});
it('ativa confirmada com resposta perdida é reconhecida sem buscar chave ou blob', async () => {
  server.failAfter('activate');
  await expect(session().start(review, id)).rejects.toThrow();
  vi.mocked(keyRpc.getAdventureImportRecoveryKey).mockClear();
  expect((await session().run(id))?.state).toBe('activated');
  expect(keyRpc.getAdventureImportRecoveryKey).not.toHaveBeenCalled();
  expect(await recovery.readLocalAdventureImport(uid, id)).toBeNull();
});
it('cancelamento e limpeza funcionam sem snapshot e com recibo de cancel perdido', async () => {
  server.failAfter('append');
  await expect(session().start(review, id)).rejects.toThrow();
  const record = (await recovery.readLocalAdventureImport(uid, id))!;
  await recovery.compareLocalAdventureImport(
    uid,
    id,
    record,
    recovery.nextImportRecord(record, { snapshot: null }),
    () => {},
  );
  server.failAfter('cancel');
  await expect(session().cancel(id)).rejects.toThrow();
  expect((await recovery.readLocalAdventureImport(uid, id))?.journal?.action).toBe(
    'cancelAdventureImport',
  );
  expect((await session().run(id))?.state).toBe('deleted');
  expect(await recovery.readLocalAdventureImport(uid, id)).toBeNull();
});
it('recupera janela pré-seal somente com reconstrução do mesmo hash', async () => {
  server.failAfter('start');
  await expect(session().start(review, id)).rejects.toThrow();
  await session().verify(id);
  await expect(
    session().reconstruct(id, {
      ...review,
      sections: [{ title: 'Outro', content: '<p>Outro.</p>' }],
    }),
  ).rejects.toThrow();
  expect((await session().reconstruct(id, review))?.state).toBe('activated');
});
it('conta tardia impede processar resposta e preserva journal', async () => {
  let active = true;
  const held = deferred<Awaited<ReturnType<typeof rpc.startAdventureImport>>>();
  vi.mocked(rpc.startAdventureImport).mockReturnValueOnce(held.promise);
  const run = createAdventureImportSession(
    uid,
    () => {
      if (!active) throw new Error('Conta mudou');
    },
    vi.fn(),
  ).start(review, id);
  await vi.waitFor(() => expect(rpc.startAdventureImport).toHaveBeenCalled());
  active = false;
  held.resolve({
    kind: 'confirmed',
    receipt: {
      operationId: id,
      action: 'startAdventureImport',
      expectedCheckpoint: null,
      checkpoint: 0,
      state: 'uploading',
      phase: 'upload',
      index: null,
    },
    progress: server.progress(),
  });
  await expect(run).rejects.toThrow('Conta mudou');
  expect((await recovery.readLocalAdventureImport(uid, id))?.journal).toBeTruthy();
  expect(keyRpc.getAdventureImportRecoveryKey).not.toHaveBeenCalled();
});
it('valida página vazia com cursor e recusa metadata indevida', async () => {
  vi.mocked(rpc.listAdventureImports).mockResolvedValueOnce({ items: [], nextCursor: 'next' });
  expect(await listValidatedAdventureImports(uid)).toEqual({ items: [], nextCursor: 'next' });
  vi.mocked(rpc.listAdventureImports).mockResolvedValueOnce({
    items: [],
    nextCursor: null,
    secret: 'x',
  } as never);
  await expect(listValidatedAdventureImports(uid)).rejects.toThrow();
});

it('terminal de outro token não remove o envelope local protegido', async () => {
  server.failAfter('append');
  await expect(session().start(review, id)).rejects.toThrow();
  const before = await recovery.readLocalAdventureImport(uid, id);
  server.set({
    state: 'deleted',
    phase: 'deleted',
    cleanupComplete: true,
    recoveryKeyReady: false,
    jobToken: 'd'.repeat(64),
  });
  await expect(session().verify(id)).rejects.toThrow();
  expect(
    recovery.sameLocalAdventureImport(await recovery.readLocalAdventureImport(uid, id), before),
  ).toBe(true);
});
it('cancelamento remoto funciona com snapshot estruturalmente corrompido sem removê-lo', async () => {
  server.failAfter('append');
  await expect(session().start(review, id)).rejects.toThrow();
  const before = (await recovery.readLocalAdventureImport(uid, id))!;
  const corrupted = { ...before, snapshot: { broken: 'preserve-me' } };
  harness.rows.set(JSON.stringify([uid, id]), corrupted);
  expect((await session().cancel(id))?.state).toBe('deleted');
  expect((await recovery.readLocalAdventureImport(uid, id))?.snapshot).toEqual(corrupted.snapshot);
});

it('o botão cancelar retoma seu próprio cancel confirmado com resposta perdida', async () => {
  server.failAfter('start');
  await expect(session().start(review, id)).rejects.toThrow();
  await session().verify(id);
  server.failAfter('cancel');
  await expect(session().cancel(id)).rejects.toThrow();
  expect((await session().cancel(id))?.state).toBe('deleted');
  expect(rpc.cancelAdventureImport).toHaveBeenCalledTimes(2);
});
it('o botão cancelar reconhece avanço final de limpeza confirmado sem resposta', async () => {
  server.failAfter('start');
  await expect(session().start(review, id)).rejects.toThrow();
  await session().verify(id);
  server.failAfter('advance');
  await expect(session().cancel(id)).rejects.toThrow();
  expect((await session().cancel(id))?.state).toBe('deleted');
  expect(await recovery.readLocalAdventureImport(uid, id)).toBeNull();
});

it('orçamento excedido é recusado antes de start, reserva local ou chave', async () => {
  await expect(
    session().start(
      { ...review, sections: [{ title: 'Grande', content: '<p>x' + '"'.repeat(450000) + '</p>' }] },
      id,
    ),
  ).rejects.toThrow(/900.000/);
  expect(rpc.startAdventureImport).not.toHaveBeenCalled();
  expect(keyRpc.getAdventureImportRecoveryKey).not.toHaveBeenCalled();
  expect(harness.rows.size).toBe(0);
});

it.each([
  ['verify', 'journal'],
  ['verify', 'snapshot'],
  ['cancel', 'journal'],
  ['cancel', 'snapshot'],
] as const)('%s preserva o controle integral de outra encarnação (%s)', async (method, control) => {
  server.failAfter('append');
  await expect(session().start(review, id)).rejects.toThrow('Resposta perdida');
  let record = (await recovery.readLocalAdventureImport(uid, id))!;
  if (control === 'snapshot')
    record = (await recovery.compareLocalAdventureImport(
      uid,
      id,
      record,
      recovery.nextImportRecord(record, { journal: null }),
      () => {},
    ))!;
  const before = structuredClone(record);
  server.set({
    jobToken: 'd'.repeat(64),
    ...(method === 'verify'
      ? ({ state: 'deleting', phase: 'cleanup', recoveryKeyReady: false } as const)
      : {}),
  });
  vi.mocked(rpc.appendAdventureImportSection).mockClear();
  vi.mocked(rpc.advanceAdventureImport).mockClear();
  vi.mocked(rpc.activateAdventureImport).mockClear();
  vi.mocked(rpc.cancelAdventureImport).mockClear();
  await expect(session()[method](id)).rejects.toThrow(/contrato da importação/);
  expect(
    recovery.sameLocalAdventureImport(await recovery.readLocalAdventureImport(uid, id), before),
  ).toBe(true);
  expect(rpc.appendAdventureImportSection).not.toHaveBeenCalled();
  expect(rpc.advanceAdventureImport).not.toHaveBeenCalled();
  expect(rpc.activateAdventureImport).not.toHaveBeenCalled();
  expect(rpc.cancelAdventureImport).not.toHaveBeenCalled();
});
