import { webcrypto } from 'node:crypto';
import { vi } from 'vitest';
import type {
  ConfirmedReview,
  ImportProgress,
  ImportAction,
  ImportConfirmed,
  ImportReceipt,
  ImportMutationInput,
} from '../model/adventureImport';
import * as rpc from '../services/adventureImportCallables';
import * as keyRpc from '../services/adventureImportKeyClient';
import {
  describeConfirmedReview,
  importDigest,
  importDigestText,
} from '../services/adventureImportContracts';
export const uid = 'owner-fixture',
  id = 'ImportFixture0001',
  token = 'a'.repeat(64),
  keyId = 'b'.repeat(64),
  adventureId = 'c'.repeat(64);
export const review: ConfirmedReview = {
  schemaVersion: 1,
  project: { title: 'Aventura Á', synopsis: 'Revisão confirmada.', universeId: null },
  source: {
    mediaType: 'text/html',
    sha256: '1f008eb780e579037a4dfb134513ce3b9aeff647dc382509aba1a5496a33baeb',
    byteLength: 15,
  },
  sections: [
    { title: 'Chegada', content: '<p>Olá 🐉</p>\n' },
    { title: 'Mapa', content: '<p>"Mapa" &amp; trilha\\</p>' },
  ],
};
export function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: Error) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
/** Event harness only. The native suite proves real IDB persistence/locks. */
export function installImportRecoveryHarness() {
  const rows = new Map<string, unknown>();
  let hold = false,
    abort = false,
    locked = 0;
  const completions: (() => void)[] = [];
  const db = {
    close: vi.fn(),
    onversionchange: null,
    transaction: (_store: string, mode: string) => {
      let dead = false,
        next: unknown,
        recordKey = '',
        writing = false;
      const tx = {
        oncomplete: null as (() => void) | null,
        onabort: null as (() => void) | null,
        onerror: null as (() => void) | null,
        abort: () => {
          dead = true;
          queueMicrotask(() => tx.onabort?.());
        },
        objectStore: () => ({
          get: (k: string) => {
            recordKey = k;
            const req = { result: undefined as unknown, onsuccess: null as (() => void) | null };
            queueMicrotask(() => {
              req.result = structuredClone(rows.get(k));
              req.onsuccess?.();
              complete();
            });
            return req;
          },
          put: (v: unknown, k: string) => {
            recordKey = k;
            next = structuredClone(v);
            writing = true;
          },
          delete: (k: string) => {
            recordKey = k;
            next = undefined;
            writing = true;
          },
          openCursor: () => {
            const entries = [...rows.entries()];
            let index = 0;
            const req = { result: null as unknown, onsuccess: null as (() => void) | null };
            const step = () => {
              const e = entries[index++];
              req.result = e
                ? { key: e[0], value: structuredClone(e[1]), continue: () => queueMicrotask(step) }
                : null;
              req.onsuccess?.();
              if (!e) complete();
            };
            queueMicrotask(step);
            return req;
          },
        }),
      };
      function complete() {
        const done = () => {
          if (dead) return;
          if (mode === 'readwrite' && abort) {
            abort = false;
            tx.abort();
            return;
          }
          if (writing) {
            if (next === undefined) rows.delete(recordKey);
            else rows.set(recordKey, next);
          }
          tx.oncomplete?.();
        };
        if (mode === 'readwrite' && hold) completions.push(done);
        else queueMicrotask(done);
      }
      return tx;
    },
  };
  const factory = {
    open: () => {
      const req = {
        result: db,
        onsuccess: null as (() => void) | null,
        onerror: null,
        onupgradeneeded: null,
        onblocked: null,
      };
      queueMicrotask(() => req.onsuccess?.());
      return req;
    },
  };
  const locks = {
    request: vi.fn(async (_key: string, work: () => Promise<unknown>) => {
      locked++;
      try {
        return await work();
      } finally {
        locked--;
      }
    }),
  };
  vi.stubGlobal('indexedDB', factory);
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('BroadcastChannel', undefined);
  Object.defineProperty(navigator, 'locks', { configurable: true, value: locks });
  return {
    rows,
    locks,
    isLocked: () => locked > 0,
    holdWrites: () => {
      hold = true;
    },
    release: () => {
      hold = false;
      completions.splice(0).forEach((f) => f());
    },
    abortWrite: () => {
      abort = true;
    },
  };
}
export async function installImportServer() {
  const described = await describeConfirmedReview(review, id),
    seed = await importDigest({ version: 1, kind: 'adventure-import-sections' });
  let p: ImportProgress = {
    schemaVersion: 1,
    ownerId: uid,
    importId: id,
    jobToken: token,
    adventureId,
    state: 'uploading',
    phase: 'upload',
    checkpoint: 0,
    title: review.project.title,
    universeId: null,
    source: review.source,
    keyId,
    recoveryKeyReady: false,
    reviewHash: described.start.reviewHash,
    sectionCount: 2,
    totalBodyBytes: 44,
    uploadedSections: 0,
    uploadedBodyBytes: 0,
    uploadedChainHash: seed,
    preparedSections: 0,
    wordCount: 0,
    cleanedSections: 0,
    cleanupComplete: false,
    result: null,
    createdAt: 1,
    updatedAt: 1,
  };
  const receipts = new Map<string, ImportReceipt>();
  let failed: string | null = null;
  const contents: string[] = [];
  function result(
    action: ImportAction,
    operationId: string,
    expectedCheckpoint: number | null,
    index: number | null,
  ): ImportConfirmed {
    let receipt = receipts.get(operationId);
    if (!receipt) {
      receipt = {
        operationId,
        action,
        expectedCheckpoint,
        checkpoint: p.checkpoint,
        state: p.state,
        phase: p.phase,
        index,
      };
      receipts.set(operationId, receipt);
    }
    return { kind: 'confirmed', receipt, progress: structuredClone(p) };
  }
  const fault = (name: string) => {
    if (failed === name) {
      failed = null;
      throw Object.assign(new Error('Resposta perdida'), { code: 'functions/unavailable' });
    }
  };
  const before = (req: ImportMutationInput) => {
    if (receipts.has(req.operationId)) return false;
    if (req.expectedCheckpoint !== p.checkpoint)
      throw Object.assign(new Error('Checkpoint mudou; compare a preparação.'), {
        code: 'functions/failed-precondition',
        details: { reason: 'checkpoint-conflict' },
      });
    p = { ...p, checkpoint: p.checkpoint + 1, updatedAt: p.updatedAt + 1 };
    return true;
  };
  vi.mocked(rpc.startAdventureImport).mockImplementation(async (req) => {
    await Promise.resolve();
    p = {
      ...p,
      importId: req.operationId,
      title: req.project.title,
      source: req.source,
      reviewHash: req.reviewHash,
      sectionCount: req.sectionCount,
      totalBodyBytes: req.totalBodyBytes,
    };
    const v = result('startAdventureImport', req.operationId, null, null);
    fault('start');
    return v;
  });
  vi.mocked(rpc.resolveAdventureImportStart).mockImplementation(async (req) => {
    await Promise.resolve();
    return receipts.has(req.operationId)
      ? result('startAdventureImport', req.operationId, null, null)
      : {
          schemaVersion: 1,
          ownerId: uid,
          importId: req.operationId,
          adventureId,
          kind: 'canceled',
        };
  });
  vi.mocked(rpc.getAdventureImport).mockImplementation(() => Promise.resolve(structuredClone(p)));
  vi.mocked(rpc.listAdventureImports).mockImplementation(() =>
    Promise.resolve({
      items: ['activated', 'deleted'].includes(p.state) ? [] : [structuredClone(p)],
      nextCursor: null,
    }),
  );
  // Key endpoint projects only its closed DTO.
  vi.mocked(keyRpc.getAdventureImportRecoveryKey).mockImplementation(async () => {
    await Promise.resolve();
    p = { ...p, recoveryKeyReady: true };
    return {
      schemaVersion: 1,
      ownerId: uid,
      importId: p.importId,
      jobToken: token,
      adventureId,
      reviewHash: p.reviewHash,
      keyId,
      algorithm: 'AES-GCM',
      keyBase64: btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i))),
    };
  });
  vi.mocked(rpc.appendAdventureImportSection).mockImplementation(async (req) => {
    await Promise.resolve();
    if (before(req)) {
      contents[req.index] = req.section.content;
      p = {
        ...p,
        uploadedSections: p.uploadedSections + 1,
        uploadedBodyBytes:
          p.uploadedBodyBytes + new TextEncoder().encode(req.section.content).length,
        wordCount: p.wordCount + 1,
        uploadedChainHash: await importDigestText(req.section.content),
      };
      if (p.uploadedSections === p.sectionCount)
        p = { ...p, state: 'preparing', phase: 'materialize' };
    }
    const v = result(
      'appendAdventureImportSection',
      req.operationId,
      req.expectedCheckpoint,
      req.index,
    );
    fault('append');
    return v;
  });
  vi.mocked(rpc.advanceAdventureImport).mockImplementation(async (req) => {
    await Promise.resolve();
    const index = p.state === 'deleting' ? p.cleanedSections : p.preparedSections;
    if (before(req)) {
      if (p.state === 'deleting')
        p = {
          ...p,
          state: 'deleted',
          phase: 'deleted',
          cleanedSections: p.uploadedSections,
          cleanupComplete: true,
        };
      else {
        p = { ...p, preparedSections: p.preparedSections + 1 };
        if (p.preparedSections === p.sectionCount) p = { ...p, state: 'ready', phase: 'ready' };
      }
    }
    const v = result('advanceAdventureImport', req.operationId, req.expectedCheckpoint, index);
    fault('advance');
    return v;
  });
  vi.mocked(rpc.activateAdventureImport).mockImplementation(async (req) => {
    await Promise.resolve();
    if (before(req))
      p = {
        ...p,
        state: 'activated',
        phase: 'complete',
        recoveryKeyReady: false,
        result: { adventureId, revision: 1 },
      };
    const v = result('activateAdventureImport', req.operationId, req.expectedCheckpoint, null);
    fault('activate');
    return v;
  });
  vi.mocked(rpc.cancelAdventureImport).mockImplementation(async (req) => {
    await Promise.resolve();
    if (before(req)) p = { ...p, state: 'deleting', phase: 'cleanup', recoveryKeyReady: false };
    const v = result('cancelAdventureImport', req.operationId, req.expectedCheckpoint, null);
    fault('cancel');
    return v;
  });
  return {
    progress: () => structuredClone(p),
    set: (patch: Partial<ImportProgress>) => {
      p = { ...p, ...patch };
    },
    failAfter: (name: string) => {
      failed = name;
    },
    contents,
    described,
  };
}
