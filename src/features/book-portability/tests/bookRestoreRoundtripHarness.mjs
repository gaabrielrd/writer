import { webcrypto, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { File } from 'node:buffer';
import { createRequire } from 'node:module';
const sharp = createRequire(new URL('../../../../functions/package.json', import.meta.url))(
  'sharp',
);
import { streamBookBackup } from '../services/streamBookBackup.ts';
import { inspectBookRestoreFile } from '../services/inspectBookRestoreFile.ts';
import { createBookRestoreStartSession } from '../services/bookRestoreStartSession.ts';
import { createBookRestoreUploadDriver } from '../services/bookRestoreUploadDriver.ts';
import { createBookRestorePreparationDriver } from '../services/bookRestorePreparationDriver.ts';
import { createBookRestoreEffectSession } from '../services/bookRestoreEffectSession.ts';
import { readBookRestoreTransferJob } from '../services/bookRestoreTransferJob.ts';
import { bookLoreReadSession } from '@/features/lore';
import {
  streamWorkHistoryBackup,
  verifyWorkHistoryBackupStream,
} from '@/features/manuscript-history';
import { createBookBackupReadService } from '../../../../functions/src/bookBackupRead.mjs';
import { createBookBackupResourceService } from '../../../../functions/src/bookBackupResourceRead.mjs';
import { createBookBackupPersonaService } from '../../../../functions/src/bookBackupPersonaRead.mjs';
import { createBookBackupUniverseService } from '../../../../functions/src/bookBackupUniverseRead.mjs';
import { createBookBackupDraftService } from '../../../../functions/src/bookBackupDraftRead.mjs';
import { createBookBackupCoverService } from '../../../../functions/src/bookBackupCoverRead.mjs';
import { createBookBackupAssetStorage } from '../../../../functions/src/bookBackupAssetStorage.mjs';
import { createWorkHistoryService } from '../../../../functions/src/workHistory.mjs';
import { createBookRestoreUploadService } from '../../../../functions/src/bookRestoreUpload.mjs';
import { invokeBookRestoreCallable } from '../../../../functions/src/bookRestoreCallable.mjs';
import { createBookRestoreCoverStorage } from '../../../../functions/src/bookRestoreCoverStorage.mjs';
import { adventureImportDb } from '../../../../functions/test/helpers/adventureImportDb.mjs';
import { bookRestoreStorageBucket } from '../../../../functions/test/helpers/bookRestoreStorageBucket.mjs';
import {
  readyActivation,
  activate,
} from '../../../../functions/test/helpers/bookRestoreActivationFixture.mjs';
import { coverRestoreFixture } from '../../../../functions/test/helpers/bookRestoreCoverFixture.mjs';
import { decodeBookBackup } from '../model/backupContainer.ts';
import { resourcesRestoreFixture } from '../../../../functions/test/helpers/bookRestoreResourcesFixture.mjs';
import { historyRestoreFixture } from '../../../../functions/test/helpers/bookRestoreHistoryFixture.mjs';
import { BOOK_RESOURCE_KINDS } from '../../../../functions/src/bookBackupResources.mjs';
import { record } from '../../../../functions/test/helpers/bookContentFixture.mjs';
export function completeRecords(bytes) {
  const base = coverRestoreFixture({ kind: 'library', bytes }),
    resourceKinds = new Set([...BOOK_RESOURCE_KINDS.map((k) => 'book-' + k), 'book-resources']),
    resources = resourcesRestoreFixture().filter((r) => resourceKinds.has(r.kind)),
    history = historyRestoreFixture().filter((r) => r.kind.startsWith('work-'));
  const rows = [];
  let addedResources = false,
    addedHistory = false;
  for (const r of base) {
    if (resourceKinds.has(r.kind)) {
      if (!addedResources) {
        rows.push(...resources);
        addedResources = true;
      }
      continue;
    }
    if (r.kind.startsWith('work-')) {
      if (!addedHistory) {
        rows.push(...history);
        addedHistory = true;
      }
      continue;
    }
    if (r.kind === 'book-metadata') {
      const value = JSON.parse(new TextDecoder().decode(r.payload));
      Object.assign(value.book, {
        title: ' \ufeffOriginal 🌙  ',
        genre: ' Fantasy ',
        synopsis: '\ufeffOwn\n  synopsis',
      });
      value.progress = { wordGoal: 1234, editorialState: 'review' };
      rows.push(record(r.kind, r.id, value));
    } else rows.push(r);
  }
  return rows;
}
export const uid = 'author',
  guard = () => {};
export function localStore() {
  const rows = new Map(),
    key = (owner, id) => JSON.stringify([owner, id]);
  return {
    rows,
    async read(owner, id) {
      return structuredClone(rows.get(key(owner, id)) ?? null);
    },
    async compare(owner, id, old, next) {
      if (!isDeepStrictEqual(rows.get(key(owner, id)) ?? null, old)) return false;
      if (next === null) rows.delete(key(owner, id));
      else rows.set(key(owner, id), structuredClone(next));
      return true;
    },
    async list() {
      return { items: [...rows.values()].map((v) => structuredClone(v)), nextCursor: null };
    },
  };
}
export async function seedActive({ records = null, indexed = false, cover = false } = {}) {
  const base = adventureImportDb({ nativeUpdates: true }),
    storage = bookRestoreStorageBucket(),
    restoreAssets = createBookRestoreCoverStorage(storage.bucket),
    png = await sharp({ create: { width: 3, height: 4, channels: 4, background: '#123456' } })
      .png()
      .toBuffer();
  const f = await readyActivation({
    db: base.db,
    id: randomUUID(),
    indexedLoreBodies: indexed,
    restoreAssets,
    records:
      records ?? (cover ? completeRecords(png) : coverRestoreFixture({ kind: 'none', bytes: png })),
  });
  const activated = await activate(f);
  return { ...base, ...f, storage, restoreAssets, p: activated.progress };
}
export function service(f, indexed = false, now = 2000) {
  return createBookRestoreUploadService({
    db: f.db,
    now: () => now,
    indexedLoreBodies: indexed,
    restoreAssets: f.restoreAssets,
  });
}
export function terminal(f, p, api = service(f)) {
  const identity = { ownerId: uid, restoreId: p.restoreId, jobToken: p.jobToken, bookId: p.bookId },
    call = (method, input) => invokeBookRestoreCallable(api, method, uid, input),
    storage = localStore();
  return createBookRestoreEffectSession({
    identity,
    check: guard,
    storage,
    getJob: async () =>
      readBookRestoreTransferJob(
        await api.getBookRestore(uid, identityInput(identity)),
        uid,
        identity,
      ),
    api: {
      mutate: call,
      retireActivation: (i) => call('retireBookRestoreActivation', i),
      review: (i) => call('getBookRestoreActivationReview', i),
      media: (i) => call('getBookRestoreMediaState', i),
      archive: (i) => call('getBookRestoreArchiveCleanup', i),
      resolve: (i) => call('resolveBookRestoreOperation', i),
    },
  });
}
const identityInput = (i) => ({ restoreId: i.restoreId, jobToken: i.jobToken });
export async function finishTerminal(f, p, api = service(f)) {
  const s = terminal(f, p, api);
  for (let n = 0; n < 20000; n++) {
    const r = await s.advance();
    if (r.kind === 'complete') return r;
  }
  throw Error('Terminal fixture budget exhausted');
}
export function normalPorts(f) {
  const root = createBookBackupReadService(f),
    resources = createBookBackupResourceService(f),
    personas = createBookBackupPersonaService(f),
    universe = createBookBackupUniverseService(f),
    draft = createBookBackupDraftService(f),
    cover = createBookBackupCoverService({
      db: f.db,
      assets: createBookBackupAssetStorage(f.storage.bucket),
    }),
    history = createWorkHistoryService(f),
    lore = bookLoreReadSession(() => true, { tokenVersion: 2 }),
    getSource = (i) => root.getBookBackupSource(uid, i),
    historyApi = {
      getSource: (i) => history.getWorkHistoryBackupSource(uid, i),
      list: (i) => history.listWorkVersions(uid, i),
      read: (i) => history.readWorkVersion(uid, i),
    };
  return {
    options: {
      apis: {
        structure: {
          getSource,
          list: (i) => root.listBookBackupStructure(uid, i),
          read: (i) => root.readBookBackupStructure(uid, i),
        },
        resources: {
          getSource,
          list: (i) => resources.listBookBackupResources(uid, i),
          read: async (i) => {
            try {
              return await resources.readBookBackupResource(uid, i);
            } catch (cause) {
              throw new Error('Normal resource ' + i.kind + '/' + i.id, { cause });
            }
          },
        },
        personas: {
          getSource,
          list: (i) => personas.listBookBackupPersonaBindings(uid, i),
          read: (i) => personas.readBookBackupPersona(uid, i),
        },
        universe: { getSource, read: (i) => universe.getBookBackupUniverse(uid, i) },
        draft: { getSource, persona: (i) => draft.getBookBackupDraftPersona(uid, i) },
        cover: {
          getSource,
          cover: (i) => cover.getBookBackupCover(uid, i),
          read: (i) => cover.readBookBackupCoverChunk(uid, i),
          verify: (i) => cover.verifyBookBackupCover(uid, i),
        },
        lore: {
          guard,
          writePortable: (...a) => lore.writePortable(...a),
          portableMetadata: (...a) => lore.portableMetadata(...a),
        },
      },
      history: {
        stream: (target, options) =>
          streamWorkHistoryBackup(target, { ...options, api: historyApi }),
        verify: (proof, options) =>
          verifyWorkHistoryBackupStream(proof, { ...options, api: historyApi }),
      },
    },
    root,
    resources,
    personas,
    universe,
    draft,
    cover,
    history,
    lore,
  };
}
export async function capture(f, bookId, options = {}) {
  const ports = normalPorts(f),
    parts = [];
  for await (const bytes of streamBookBackup(bookId, { ...ports.options, ...options }))
    parts.push(Buffer.from(bytes));
  return { bytes: Buffer.concat(parts), ports, parts };
}
export async function restore(f, bytes, indexed = false) {
  const api = service(f, indexed),
    call = (method, input) => invokeBookRestoreCallable(api, method, uid, input),
    file = new File([bytes], 'roundtrip.writer'),
    inspected = await inspectBookRestoreFile(file, { check: guard }),
    storage = localStore(),
    transfer = {
      start: (i) => call('startBookRestore', i),
      get: (i) => call('getBookRestore', i),
      list: (i) => call('listBookRestores', i),
      resolveStart: (i) => call('resolveBookRestoreStart', i),
      append: (i) => call('appendBookRestoreChunk', i),
    },
    s = createBookRestoreStartSession({ ownerId: uid, check: guard, api: transfer, storage }),
    first = await s.begin(inspected.review.source, inspected.reviewHash);
  if (first.kind !== 'confirmed') throw Error('No original start');
  const p = first.progress,
    identity = { ownerId: uid, restoreId: p.restoreId, jobToken: p.jobToken, bookId: p.bookId };
  const upload = createBookRestoreUploadDriver({
    identity,
    source: p.source,
    reviewHash: p.reviewHash,
    file,
    check: guard,
    api: transfer,
    authorize: async (context) => {
      const raw = await api.getBookRestoreRecoveryKey(uid, {
          ...identityInput(identity),
          reviewHash: p.reviewHash,
          expectedKeyId: context.keyId,
        }),
        bytes = Buffer.from(raw.keyBase64, 'base64');
      try {
        return {
          ...context,
          key: await webcrypto.subtle.importKey('raw', bytes, 'AES-GCM', false, [
            'encrypt',
            'decrypt',
          ]),
        };
      } finally {
        bytes.fill(0);
      }
    },
  });
  let step;
  for (let n = 0; n < 10000; n++) {
    step = await upload.step();
    if (step.kind === 'paused') break;
  }
  if (step.progress.state !== 'uploaded') throw Error('No complete upload');
  let intent = null;
  const prep = createBookRestorePreparationDriver({
    identity,
    check: guard,
    operationId: () => randomUUID(),
    api: { get: (i) => call('getBookRestore', i), advance: call },
    journal: {
      async read() {
        return structuredClone(intent);
      },
      async compareAndSet(old, next) {
        if (!isDeepStrictEqual(intent, old)) return false;
        intent = structuredClone(next);
        return true;
      },
    },
  });
  for (let n = 0; n < 30000; n++) {
    step = await prep.step();
    if (step.kind === 'paused') break;
  }
  if (step.reason !== 'review-required') throw Error('No review gate: ' + step.reason);
  const ready = await s.get(identityInput(identity)),
    end = terminal(f, ready, api),
    review = await end.review();
  if (f.records.has('books/' + ready.bookId)) throw Error('Root before confirmation');
  await end.activate(review);
  await finishTerminal(f, ready, api);
  if (intent !== null || storage.rows.size) throw Error('Local controls not empty');
  return { p: await api.getBookRestore(uid, identityInput(identity)), review, inspected, api };
}
export function byteSource(bytes) {
  return {
    size: bytes.length,
    read: async (offset, length) => new Uint8Array(bytes.subarray(offset, offset + length)),
  };
}
export async function logicalRecords(bytes) {
  const result = new Map();
  for await (const r of decodeBookBackup(byteSource(bytes))) {
    if (r.kind === 'book-package' || r.kind === 'book-package-end') continue;
    const key = JSON.stringify([r.kind, r.id]);
    if (!result.has(key)) result.set(key, { kind: r.kind, id: r.id, parts: [] });
    result.get(key).parts.push(Buffer.from(r.payload));
  }
  return [...result.values()].map((r) => {
    const bytes = Buffer.concat(r.parts);
    return {
      kind: r.kind,
      id: r.id,
      value: ['work-version-text', 'book-draft-text', 'book-cover-bytes'].includes(r.kind)
        ? bytes
        : JSON.parse(bytes.toString('utf8')),
    };
  });
}
