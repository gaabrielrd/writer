import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAdventureDeletionClient } from '../services/adventureDeletionClient';
import * as recovery from '../services/adventureDeletionRecovery';
import { knownDeletion } from '../services/adventureDeletionRecovery';
import {
  uid,
  adventureId,
  source,
  progress,
  deletionId,
  start,
  step,
  storageKey,
  installBrowser,
  server,
  deferred,
} from './fixtures';
beforeEach(() => {
  installBrowser();
});
afterEach(() => {
  vi.restoreAllMocks();
});
const make = (s: ReturnType<typeof server>, isActive = () => true) =>
  createAdventureDeletionClient({ uid, adventureId, isActive, transport: s.transport });

it('persiste o pedido antes do envio, grava somente metadata e permite avançar até a conclusão', async () => {
  const s = server(),
    client = make(s),
    send = s.transport.start.getMockImplementation()!;
  s.transport.start.mockImplementation(async (input) => {
    expect(recovery.readDeletion(uid, adventureId)).toEqual(start);
    return send(input);
  });
  expect(await client.getSource()).toEqual(source);
  expect(await client.load()).toEqual({ control: null, progress: null, readOnly: false });
  await client.start(source, deletionId);
  expect(localStorage.getItem(storageKey)).not.toContain(source.title);
  expect(recovery.readDeletion(uid, adventureId)).toMatchObject({
    kind: 'known',
    floor: { checkpoint: 0 },
  });
  for (let n = 0; n < 3; n++)
    await client.advance('client-deletion-step-' + String(n).padStart(4, '0'));
  expect((await client.load()).progress?.complete).toBe(true);
  expect(recovery.readDeletion(uid, adventureId)).toMatchObject({
    kind: 'known',
    floor: { complete: true },
  });
  await expect(client.advance('client-another-step-0001')).rejects.toThrow();
  expect(s.effects).toBe(4);
  expect(s.transport.start.mock.calls[0]?.[0]).toEqual(start.input);
});

it('ACK inicial perdido retoma após recriar o cliente sem trocar o ID ou repetir efeitos', async () => {
  const s = server(),
    client = make(s);
  s.transport.start.mockImplementationOnce((input) => {
    s.confirm('start', input);
    return Promise.reject(Error('Lost ACK'));
  });
  await expect(client.start(source, deletionId)).rejects.toThrow('Lost ACK');
  expect(recovery.readDeletion(uid, adventureId)).toEqual(start);
  const reloaded = make(s);
  expect((await reloaded.load()).control).toEqual(start);
  expect(s.transport.get).not.toHaveBeenCalled();
  await reloaded.recover();
  expect(s.transport.start.mock.calls.map(([input]) => input)).toEqual([start.input, start.input]);
  expect(s.effects).toBe(1);
  expect(recovery.readDeletion(uid, adventureId)?.kind).toBe('known');
});

it('ACK de avanço perdido mantém token/checkpoint originais e retoma a mesma operação após reload', async () => {
  const s = server(),
    client = make(s);
  await client.start(source, deletionId);
  s.transport.advance.mockImplementationOnce((input) => {
    s.confirm('advance', input);
    return Promise.reject(Error('Step ACK lost'));
  });
  await expect(client.advance(step.input.operationId)).rejects.toThrow('Step ACK lost');
  expect(recovery.readDeletion(uid, adventureId)).toEqual(step);
  await make(s).recover();
  expect(s.transport.advance.mock.calls.map(([input]) => input)).toEqual([step.input, step.input]);
  expect(s.effects).toBe(2);
});

it('encerrar início incerto persiste intenção antes de resolver e não cancela job já confirmado', async () => {
  const s = server(),
    client = make(s);
  s.transport.start.mockImplementationOnce((input) => {
    s.confirm('start', input);
    return Promise.reject(Error('ACK lost'));
  });
  await expect(client.start(source, deletionId)).rejects.toThrow();
  const resolve = s.transport.resolveStart.getMockImplementation()!;
  s.transport.resolveStart.mockImplementation(async (input) => {
    expect(recovery.readDeletion(uid, adventureId)).toMatchObject({
      kind: 'start',
      phase: 'cancel-start',
      input: start.input,
    });
    return resolve(input);
  });
  await client.cancelStart();
  expect(s.transport.resolveStart).toHaveBeenCalledWith({ ...start.input, intent: 'cancel' });
  expect(recovery.readDeletion(uid, adventureId)?.kind).toBe('known');
  expect(s.job?.complete).toBe(false);
});

it('resolução de início não recebido conserva o pedido original e só retira o diário após confirmação', async () => {
  const s = server(),
    client = make(s);
  s.transport.start.mockRejectedValueOnce(Error('Before server'));
  await expect(client.start(source, deletionId)).rejects.toThrow();
  const gate = deferred<Awaited<ReturnType<typeof s.transport.resolveStart>>>();
  s.transport.resolveStart.mockReturnValueOnce(gate.promise);
  const cancel = client.cancelStart();
  await vi.waitFor(() => expect(s.transport.resolveStart).toHaveBeenCalledOnce());
  expect(recovery.readDeletion(uid, adventureId)).toMatchObject({ phase: 'cancel-start' });
  gate.resolve({ schemaVersion: 1, ownerId: uid, kind: 'canceled', request: start.input });
  await cancel;
  expect(recovery.readDeletion(uid, adventureId)).toBeNull();
  expect(s.job).toBeNull();
});

it.each(['owner', 'receipt', 'job-token'])(
  'resposta incompatível em %s mantém o pedido pendente',
  async (kind) => {
    const s = server(),
      client = make(s);
    await client.start(source, deletionId);
    s.transport.advance.mockImplementationOnce((input) => {
      const value = s.confirm('advance', input);
      if (kind === 'owner') value.progress!.ownerId = 'other';
      if (kind === 'receipt') value.receipt.operationId = 'different-operation-0001';
      if (kind === 'job-token') value.progress!.deletionToken = 'd'.repeat(64);
      return Promise.resolve(value);
    });
    await expect(client.advance(step.input.operationId)).rejects.toThrow();
    expect(recovery.readDeletion(uid, adventureId)).toEqual(step);
  },
);

it('troca de conta durante resposta preserva o diário original sem adotar progresso tardio', async () => {
  const s = server();
  let active = true;
  const client = make(s, () => active),
    gate = deferred<Awaited<ReturnType<typeof s.transport.start>>>();
  s.transport.start.mockReturnValueOnce(gate.promise);
  const attempt = client.start(source, deletionId);
  await vi.waitFor(() => expect(s.transport.start).toHaveBeenCalledOnce());
  active = false;
  gate.resolve(s.confirm('start', start.input));
  await expect(attempt).rejects.toThrow('conta');
  expect(recovery.readDeletion(uid, adventureId)).toEqual(start);
  active = true;
  await make(s).recover();
  expect(recovery.readDeletion(uid, adventureId)?.kind).toBe('known');
});

it('troca de conta antes de obter Web Lock não grava intenção nem envia chamada', async () => {
  const s = server(),
    gate = deferred<void>();
  let active = true;
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: (_key: string, work: () => unknown) => gate.promise.then(work),
    },
  });
  const attempt = make(s, () => active).start(source, deletionId);
  active = false;
  gate.resolve();
  await expect(attempt).rejects.toThrow();
  expect(recovery.readDeletion(uid, adventureId)).toBeNull();
  expect(s.transport.start).not.toHaveBeenCalled();
});

it('duas abas não sobrepõem a reserva, e uma resposta antiga não apaga intenção alterada por outra aba', async () => {
  const s = server(),
    gate = deferred<Awaited<ReturnType<typeof s.transport.start>>>(),
    a = make(s),
    b = make(s);
  s.transport.start.mockReturnValueOnce(gate.promise);
  const first = a.start(source, deletionId);
  await vi.waitFor(() => expect(s.transport.start).toHaveBeenCalledOnce());
  await expect(b.start(source, 'client-other-start-0001')).rejects.toThrow();
  const changed = { ...start, phase: 'cancel-start' as const };
  localStorage.setItem(storageKey, JSON.stringify(changed));
  gate.resolve(s.confirm('start', start.input));
  await expect(first).rejects.toThrow('outra aba');
  expect(recovery.readDeletion(uid, adventureId)).toEqual(changed);
  await b.recover();
  expect(s.transport.resolveStart).toHaveBeenCalledOnce();
  expect(s.transport.start).toHaveBeenCalledOnce();
  expect(s.effects).toBe(1);
});

it('quota antes do envio não autoriza I/O e gravação com ACK perdido conserva o pedido recuperável', async () => {
  const s = server(),
    original = localStorage.setItem.bind(localStorage);
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
    throw Error('Quota');
  });
  await expect(make(s).start(source, deletionId)).rejects.toThrow('Quota');
  expect(s.transport.start).not.toHaveBeenCalled();
  spy.mockImplementationOnce((key, value) => {
    original(key, value);
    throw Error('Local ACK lost');
  });
  await expect(make(s).start(source, deletionId)).rejects.toThrow('Local ACK lost');
  expect(s.transport.start).not.toHaveBeenCalled();
  expect(recovery.readDeletion(uid, adventureId)).toEqual(start);
  spy.mockRestore();
  await make(s).recover();
  expect(s.effects).toBe(1);
});

it('falha ao gravar progresso após resposta confirmada mantém intenção para replay', async () => {
  const s = server(),
    client = make(s),
    send = s.transport.start.getMockImplementation()!;
  let failKnown = false;
  const original = localStorage.setItem.bind(localStorage);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
    if (failKnown) throw Error('Known quota');
    return original(key, value);
  });
  s.transport.start.mockImplementation(async (input) => {
    const result = await send(input);
    failKnown = true;
    return result;
  });
  await expect(client.start(source, deletionId)).rejects.toThrow('Known quota');
  expect(recovery.readDeletion(uid, adventureId)).toEqual(start);
  failKnown = false;
  s.transport.start.mockImplementation(send);
  await make(s).recover();
  expect(s.effects).toBe(1);
});

it('conflito exige resposta definitiva e consulta atual do mesmo job antes de retirar a pendência', async () => {
  const s = server(),
    client = make(s);
  await client.start(source, deletionId);
  s.transport.advance.mockRejectedValueOnce(
    Object.assign(Error('Conflict'), {
      code: 'functions/failed-precondition',
      details: { reason: 'checkpoint-conflict' },
    }),
  );
  await expect(client.advance(step.input.operationId)).rejects.toThrow();
  await expect(make(s).resolveConflict()).rejects.toThrow('primeiro');
  await expect(client.resolveConflict()).rejects.toThrow('confirmado');
  expect(recovery.readDeletion(uid, adventureId)).toEqual(step);
  s.setJob({ ...progress, checkpoint: 2, deletedDocuments: 4, updatedAt: 1002, phase: 'verify' });
  await client.resolveConflict();
  expect(recovery.readDeletion(uid, adventureId)).toMatchObject({
    kind: 'known',
    floor: { checkpoint: 2 },
  });
  expect(s.transport.advance).toHaveBeenCalledOnce();
});

it('refresh tardio não substitui uma nova intenção e progresso conhecido não retrocede', async () => {
  const s = server(),
    client = make(s),
    gate = deferred<Awaited<ReturnType<typeof s.transport.get>>>();
  s.transport.get.mockReturnValueOnce(gate.promise);
  const refresh = client.load();
  localStorage.setItem(storageKey, JSON.stringify(start));
  gate.resolve({ schemaVersion: 1, ownerId: uid, lookup: { adventureId }, deletion: progress });
  await expect(refresh).rejects.toThrow('outra aba');
  expect(recovery.readDeletion(uid, adventureId)).toEqual(start);
  const newer = {
    ...progress,
    checkpoint: 2,
    updatedAt: 1002,
    deletedDocuments: 2,
    phase: 'verify' as const,
  };
  localStorage.setItem(storageKey, JSON.stringify(knownDeletion(newer)));
  await expect(client.load()).rejects.toThrow();
  expect(recovery.readDeletion(uid, adventureId)).toEqual(knownDeletion(newer));
});

it('sem locks a leitura remota funciona, mas nenhum início é enviado sem reserva', async () => {
  const s = server();
  s.setJob(progress);
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  const client = make(s);
  expect((await client.load()).readOnly).toBe(true);
  expect((await client.load()).progress).toEqual(progress);
  await expect(client.start(source, deletionId)).rejects.toThrow('reserva');
  expect(s.transport.start).not.toHaveBeenCalled();
});

it('diário ilegível é preservado; listagem local não lê controles de outra conta e eventos deixam de notificar após unsubscribe', async () => {
  const s = server();
  localStorage.setItem(storageKey, '{broken');
  await expect(make(s).start(source, deletionId)).rejects.toThrow('inválido');
  expect(localStorage.getItem(storageKey)).toBe('{broken');
  expect(s.transport.start).not.toHaveBeenCalled();
  const foreignKey = 'writer:adventure-deletion:' + JSON.stringify(['other', adventureId]);
  localStorage.setItem(foreignKey, 'OTHER_PRIVATE_VALUE');
  const spy = vi.spyOn(Storage.prototype, 'getItem');
  expect(recovery.listDeletions(uid)).toEqual({ items: [], unreadable: true });
  expect(spy.mock.calls.some(([key]) => key === foreignKey)).toBe(false);
  const listener = vi.fn(),
    unsubscribe = recovery.subscribeDeletions(listener);
  window.dispatchEvent(new Event('focus'));
  window.dispatchEvent(new StorageEvent('storage', { key: storageKey }));
  expect(listener).toHaveBeenCalledTimes(2);
  unsubscribe();
  window.dispatchEvent(new Event('focus'));
  expect(listener).toHaveBeenCalledTimes(2);
});

it('catalogação valida envelope e cursor sem escrever no diário', async () => {
  const s = server(),
    client = make(s);
  s.setJob(progress);
  expect((await client.list()).items).toEqual([progress]);
  s.transport.list.mockResolvedValueOnce({
    schemaVersion: 1,
    ownerId: 'other',
    items: [progress],
    nextCursor: null,
  });
  await expect(client.list()).rejects.toThrow();
  expect(localStorage.length).toBe(0);
});

it('recusa cursor coercível e campos extras antes de consultar catálogo', async () => {
  const s = server(),
    client = make(s);
  await expect(client.list({ cursor: 123 as unknown as string })).rejects.toThrow();
  await expect(client.list({ extra: true } as unknown as { limit?: number })).rejects.toThrow();
  expect(s.transport.list).not.toHaveBeenCalled();
});

it('revogação só notifica depois do recibo válido e antes de falhar o CAS local', async () => {
  const s = server(),
    notify = vi.fn(),
    client = createAdventureDeletionClient({
      uid,
      adventureId,
      isActive: () => true,
      transport: s.transport,
      onRevoked: notify,
    }),
    send = s.transport.start.getMockImplementation()!;
  const write = localStorage.setItem.bind(localStorage);
  let quota = false;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
    if (quota) throw Error('Quota after proof');
    write(key, value);
  });
  s.transport.start.mockImplementation(async (input) => {
    const reply = await send(input);
    quota = true;
    return reply;
  });
  await expect(client.start(source, deletionId)).rejects.toThrow('Quota after proof');
  expect(notify).toHaveBeenCalledOnce();
  expect(notify.mock.calls[0]?.[0]).toMatchObject({ revoked: true, deletionId });
  expect(recovery.readDeletion(uid, adventureId)).toEqual(start);
});
it('confirmação capturada não recupera nem cancela outra intenção local', async () => {
  const s = server(),
    client = make(s),
    changed = { ...start, input: { ...start.input, operationId: 'changed-local-start-0001' } };
  localStorage.setItem(storageKey, JSON.stringify(changed));
  await expect(client.cancelStart(start)).rejects.toThrow('mudou');
  await expect(client.recover(start)).rejects.toThrow('mudou');
  expect(s.transport.start).not.toHaveBeenCalled();
  expect(s.transport.resolveStart).not.toHaveBeenCalled();
  expect(recovery.readDeletion(uid, adventureId)).toEqual(changed);
});
it('retomada pendente não envia I/O se a reserva segura deixou de estar disponível', async () => {
  const s = server();
  localStorage.setItem(storageKey, JSON.stringify(start));
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  await expect(make(s).recover(start)).rejects.toThrow('reserva');
  expect(s.transport.start).not.toHaveBeenCalled();
  expect(recovery.readDeletion(uid, adventureId)).toEqual(start);
});
