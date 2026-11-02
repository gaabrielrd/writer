import { webcrypto } from 'node:crypto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { VersionSource } from '@/features/manuscript-history';
import type { EditorChatHost } from '../model/editorChatHost';
import type { EditorChatEditorBridge } from '../model/editorChatEditorBridge';
import { editorChatTextHash } from '../../../../functions/src/editorChatContracts.mjs';
import { captureEditorChatHost } from '../services/editorChatHostService';
import { createEditorChatOperationSession } from '../services/editorChatOperationSession';
import * as transport from '../services/editorChatService';

const mocks = vi.hoisted(() => ({
  user: ((): { uid: string } | null => ({ uid: 'owner' }))(),
  readers: new Set<(next: { uid: string } | null) => void>(),
  getSource: vi.fn(),
}));
vi.mock('@/shared/lib', () => ({
  auth: {
    get currentUser() {
      return mocks.user;
    },
  },
}));
vi.mock('@/features/manuscript-history', () => ({ getWorkVersionSource: mocks.getSource }));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, listener: (next: { uid: string } | null) => void) => {
    mocks.readers.add(listener);
    return () => mocks.readers.delete(listener);
  },
}));
vi.mock('../services/editorChatService', async () => {
  const actual = await vi.importActual<typeof transport>('../services/editorChatService');
  return { ...actual, callEditorChat: vi.fn(), resolveEditorChatOperation: vi.fn() };
});
function switchUser(next: { uid: string } | null) {
  mocks.user = next;
  for (const listener of mocks.readers) listener(next);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function setup(kind: 'book-scene' | 'adventure-scene' | 'adventure-block' = 'book-scene') {
  const content = '<p><b>Prosa própria</b></p>';
  const html = '<p><strong>Prosa própria</strong></p>';
  const target = {
    kind: kind === 'book-scene' ? ('book' as const) : ('adventure' as const),
    id: 'project',
  };
  const resource = {
    kind: kind === 'adventure-block' ? ('block' as const) : ('scene' as const),
    id: 'resource',
  };
  const bodyHash = await editorChatTextHash(content);
  const editorHash = await editorChatTextHash(html);
  const state = {
    locked: false,
    active: true,
    snapshot: { content, revision: 7, bodyHash } as {
      content: string;
      revision: number;
      bodyHash: string;
    } | null,
  };
  const own = {
    capture: {
      source: 'selection' as const,
      editorHash,
      from: 1,
      to: 13,
      text: 'Prosa própria',
      surroundingText: '',
      truncated: false,
    },
    html,
    checkCurrent: vi.fn(),
  };
  const bridge: EditorChatEditorBridge = {
    capture: vi.fn(() => {
      expect(state.locked).toBe(true);
      return Promise.resolve(own);
    }),
    preview: vi.fn(),
    prepare: vi.fn(),
    setBusy: vi.fn(),
    focus: vi.fn(),
  };
  const saved: VersionSource = {
    target,
    resource,
    title: 'Cena',
    content,
    sourceToken: 'a'.repeat(64),
    contentHash: bodyHash,
    revision: 7,
  };
  mocks.getSource.mockImplementation(() => {
    expect(state.locked).toBe(true);
    return Promise.resolve(saved);
  });
  const host: EditorChatHost = {
    target,
    resource,
    checkCurrent: () => {
      if (!state.active) throw new Error('Editor fechado');
    },
    getConfirmedSnapshot: () => state.snapshot,
    getBridge: () => bridge,
    runExclusive: async (work) => {
      if (state.locked) throw new Error('Ocupado');
      state.locked = true;
      try {
        return await work();
      } finally {
        state.locked = false;
      }
    },
  };
  return { host, state, bridge, own, saved };
}
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  localStorage.clear();
  vi.mocked(transport.callEditorChat).mockReset();
  mocks.user = { uid: 'owner' };
  mocks.getSource.mockReset();
  mocks.readers.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('captura da fonte confirmada para o chat', () => {
  it.each(['book-scene', 'adventure-scene', 'adventure-block'] as const)(
    'captura %s com hashes distintos sem normalizar ou gravar o texto',
    async (kind) => {
      const { host, state, saved, own, bridge } = await setup(kind);
      const result = await captureEditorChatHost('owner', host, 'selection');
      expect(result).toEqual({
        base: { sourceToken: saved.sourceToken, revision: 7, bodyHash: saved.contentHash },
        capture: own.capture,
      });
      expect(result.capture.editorHash).not.toBe(result.base.bodyHash);
      expect(state.snapshot?.content).toBe(saved.content);
      expect(bridge.prepare).not.toHaveBeenCalled();
      expect(bridge.setBusy).not.toHaveBeenCalled();
      expect(state.locked).toBe(false);
      expect(mocks.readers.size).toBe(0);
    },
  );
  it('não lê a fonte nem captura um rascunho sem confirmação', async () => {
    const { host, state, bridge } = await setup();
    state.snapshot = null;
    await expect(captureEditorChatHost('owner', host, 'auto')).rejects.toThrow(/salvamento/);
    expect(mocks.getSource).not.toHaveBeenCalled();
    expect(bridge.capture).not.toHaveBeenCalled();
  });
  it.each(['target', 'resource', 'revision', 'contentHash', 'content', 'sourceToken'] as const)(
    'recusa fonte incompatível em %s sem preparar alteração',
    async (field) => {
      const { host, saved, bridge } = await setup();
      const value =
        field === 'target'
          ? { ...saved, target: { ...saved.target, id: 'outro' } }
          : field === 'resource'
            ? { ...saved, resource: { ...saved.resource, id: 'outro' } }
            : { ...saved, [field]: field === 'revision' ? 8 : 'incompatível' };
      mocks.getSource.mockResolvedValue(value);
      await expect(captureEditorChatHost('owner', host, 'auto')).rejects.toThrow();
      expect(bridge.prepare).not.toHaveBeenCalled();
    },
  );
  it('descarta a fonte se uma confirmação posterior chegar enquanto a leitura aguarda', async () => {
    const { host, state, saved, bridge } = await setup();
    const read = deferred<VersionSource>();
    mocks.getSource.mockReturnValue(read.promise);
    const pending = captureEditorChatHost('owner', host, 'auto');
    await vi.waitFor(() => expect(mocks.getSource).toHaveBeenCalledOnce());
    state.snapshot = { ...state.snapshot!, revision: 8 };
    read.resolve(saved);
    await expect(pending).rejects.toThrow(/mudou/);
    expect(bridge.prepare).not.toHaveBeenCalled();
    expect(state.locked).toBe(false);
  });
  it('fenceia A para B para A mesmo que o usuário original volte antes da resposta', async () => {
    const { host, saved, bridge } = await setup();
    const read = deferred<VersionSource>();
    mocks.getSource.mockReturnValue(read.promise);
    const original = mocks.user;
    const pending = captureEditorChatHost('owner', host, 'auto');
    await vi.waitFor(() => expect(mocks.getSource).toHaveBeenCalledOnce());
    switchUser({ uid: 'other' });
    switchUser(original);
    read.resolve(saved);
    await expect(pending).rejects.toThrow(/mudou/);
    expect(bridge.prepare).not.toHaveBeenCalled();
    expect(mocks.readers.size).toBe(0);
  });
  it.each(['closed', 'capture-stale', 'invalid-editor-hash', 'body-hash'] as const)(
    'interrompe preparação insegura: %s',
    async (reason) => {
      const { host, state, own, saved } = await setup();
      if (reason === 'body-hash') {
        saved.contentHash = 'b'.repeat(64);
        state.snapshot!.bodyHash = saved.contentHash;
      } else if (reason === 'invalid-editor-hash') own.capture.editorHash = 'c'.repeat(64);
      else if (reason === 'capture-stale')
        own.checkCurrent.mockImplementation(() => {
          throw new Error('Captura mudou');
        });
      else
        mocks.getSource.mockImplementation(() => {
          state.active = false;
          return Promise.resolve(saved);
        });
      await expect(captureEditorChatHost('owner', host, 'auto')).rejects.toThrow();
      expect(state.locked).toBe(false);
      expect(mocks.readers.size).toBe(0);
    },
  );
  it('preserva a falha de leitura e solta a reserva sem capturar', async () => {
    const { host, state, bridge } = await setup();
    mocks.getSource.mockRejectedValue(new Error('Sem resposta'));
    await expect(captureEditorChatHost('owner', host, 'auto')).rejects.toThrow('Sem resposta');
    expect(bridge.prepare).not.toHaveBeenCalled();
    expect(state.locked).toBe(false);
    expect(mocks.readers.size).toBe(0);
  });
  it.each(['source-read', 'reservation-release'] as const)(
    'cerca mudança independente do PM durante %s mesmo sem nova confirmação',
    async (window) => {
      const { host, state, own, saved } = await setup();
      const originalSnapshot = state.snapshot;
      let edited = false;
      own.checkCurrent.mockImplementation(() => {
        if (edited) throw new Error('PM alterado');
      });
      if (window === 'source-read') {
        const read = deferred<VersionSource>();
        mocks.getSource.mockReturnValue(read.promise);
        const pending = captureEditorChatHost('owner', host, 'auto');
        await vi.waitFor(() => expect(mocks.getSource).toHaveBeenCalledOnce());
        edited = true;
        read.resolve(saved);
        await expect(pending).rejects.toThrow('PM alterado');
      } else {
        const run = host.runExclusive;
        host.runExclusive = async (work) => {
          const result = await run(work);
          edited = true;
          return result;
        };
        await expect(captureEditorChatHost('owner', host, 'auto')).rejects.toThrow('PM alterado');
      }
      expect(state.snapshot).toBe(originalSnapshot);
      expect(state.locked).toBe(false);
      expect(mocks.readers.size).toBe(0);
    },
  );
  it('não inicia a leitura para outra conta ou após cancelamento', async () => {
    const { host } = await setup();
    const abort = new AbortController();
    abort.abort();
    await expect(
      captureEditorChatHost('owner', host, 'auto', { signal: abort.signal }),
    ).rejects.toThrow();
    await expect(captureEditorChatHost('other', host, 'auto')).rejects.toThrow();
    expect(mocks.getSource).not.toHaveBeenCalled();
  });
});

describe('scoped capture reservation for the initial mutation', () => {
  it('keeps one reservation until the scoped result confirms and checks again after release', async () => {
    const { host, state } = await setup();
    const reserve = vi.spyOn(host, 'runExclusive');
    const result = await captureEditorChatHost('owner', host, 'selection', {
      withCapture: async (value, checkCurrent) => {
        expect(state.locked).toBe(true);
        checkCurrent();
        await editorChatTextHash(value.capture.text);
        checkCurrent();
        return 'prepared-metadata';
      },
    });
    expect(result).toBe('prepared-metadata');
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(state.locked).toBe(false);
  });
  it.each(['text', 'selection', 'snapshot', 'actor'] as const)(
    'does not emit prepare after %s changes while hashing inside the reservation',
    async (reason) => {
      const { host, state, own } = await setup();
      const reached = deferred<void>();
      const release = deferred<void>();
      const real = crypto.subtle.digest.bind(crypto.subtle);
      let edited = false;
      own.checkCurrent.mockImplementation(() => {
        if (edited) throw new Error('PM changed');
      });
      vi.stubGlobal('navigator', {
        locks: {
          request: (_name: string, callback: () => unknown) => Promise.resolve().then(callback),
        },
      });
      const pending = captureEditorChatHost('owner', host, 'selection', {
        withCapture: async (value, checkCurrent) => {
          vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (algorithm, data) => {
            const hash = await real(algorithm, data);
            reached.resolve();
            await release.promise;
            return hash;
          });
          const service = createEditorChatOperationSession({
            uid: 'owner',
            scope: { target: host.target, resource: host.resource },
            check: checkCurrent,
          });
          await service.execute('prepareContext', {
            target: host.target,
            resource: host.resource,
            operationId: 'host-prepare-operation',
            contextId: 'host-prepare-operation',
            ...value,
          });
        },
      });
      await reached.promise;
      if (reason === 'snapshot') state.snapshot = { ...state.snapshot!, revision: 8 };
      else if (reason === 'actor') switchUser({ uid: 'other' });
      else edited = true;
      release.resolve();
      await expect(pending).rejects.toThrow();
      expect(transport.callEditorChat).not.toHaveBeenCalled();
      expect(localStorage.length).toBe(0);
      expect(state.locked).toBe(false);
    },
  );
  it.each(['text', 'selection'] as const)(
    'does not persist or emit after %s changes while waiting for the local CAS lock',
    async () => {
      const { host, state, own } = await setup();
      const reached = deferred<void>();
      const release = deferred<void>();
      let edited = false;
      own.checkCurrent.mockImplementation(() => {
        if (edited) throw new Error('PM changed');
      });
      vi.stubGlobal('navigator', {
        locks: {
          request: async (_name: string, callback: () => unknown) => {
            reached.resolve();
            await release.promise;
            return callback();
          },
        },
      });
      const pending = captureEditorChatHost('owner', host, 'selection', {
        withCapture: async (value, checkCurrent) => {
          const service = createEditorChatOperationSession({
            uid: 'owner',
            scope: { target: host.target, resource: host.resource },
            check: checkCurrent,
          });
          await service.execute('prepareContext', {
            target: host.target,
            resource: host.resource,
            operationId: 'host-reserve-operation',
            contextId: 'host-reserve-operation',
            ...value,
          });
        },
      });
      await reached.promise;
      edited = true;
      release.resolve();
      await expect(pending).rejects.toThrow();
      expect(transport.callEditorChat).not.toHaveBeenCalled();
      expect(localStorage.length).toBe(0);
      expect(state.locked).toBe(false);
    },
  );
  it.each(['snapshot', 'actor', 'release'] as const)(
    'rejects a late scoped result after %s changes',
    async (reason) => {
      const { host, state } = await setup();
      const reached = deferred<void>();
      const release = deferred<void>();
      if (reason === 'release') {
        const run = host.runExclusive;
        host.runExclusive = async (work) => {
          const result = await run(work);
          state.snapshot = null;
          return result;
        };
      }
      const pending = captureEditorChatHost('owner', host, 'selection', {
        withCapture: async (_value, checkCurrent) => {
          checkCurrent();
          reached.resolve();
          await release.promise;
          return 'must-not-escape';
        },
      });
      await reached.promise;
      if (reason === 'snapshot') state.snapshot = null;
      if (reason === 'actor') switchUser({ uid: 'other' });
      release.resolve();
      await expect(pending).rejects.toThrow();
      expect(state.locked).toBe(false);
      expect(mocks.readers.size).toBe(0);
    },
  );
});
