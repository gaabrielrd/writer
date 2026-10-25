import sharp from 'sharp';
import { adventureImportDb } from './adventureImportDb.mjs';
import { readyActivation, activate, uid } from './bookRestoreActivationFixture.mjs';
import { coverRestoreFixture } from './bookRestoreCoverFixture.mjs';
import { bookRestoreStorageBucket } from './bookRestoreStorageBucket.mjs';
import { createBookRestoreCoverStorage } from '../../src/bookRestoreCoverStorage.mjs';
export { uid };
function mediaMemoryDb() {
  const f = adventureImportDb({ nativeUpdates: true }),
    doc = f.db.doc.bind(f.db);
  f.db.doc = (path) => {
    const ref = doc(path);
    ref.update = (patch) => f.db.runTransaction((tx) => tx.update(ref, patch));
    return ref;
  };
  return f;
}
export async function readyMedia({
  db: provided = null,
  none = false,
  records = null,
  id = 'media-restore-0001',
} = {}) {
  const base = provided ? { db: provided } : mediaMemoryDb(),
    storage = bookRestoreStorageBucket(),
    assets = createBookRestoreCoverStorage(storage.bucket),
    png = await sharp({ create: { width: 3, height: 4, channels: 4, background: '#123456' } })
      .png()
      .toBuffer(),
    hooks = { before: null, after: null },
    holder = { f: null },
    f = {
      ...base,
      ...(await readyActivation({
        db: base.db,
        id,
        records: records ?? coverRestoreFixture({ kind: none ? 'none' : 'library', bytes: png }),
        restoreAssets: {
          ...assets,
          async accept(...args) {
            await hooks.before?.(holder.f);
            const accepted = await assets.accept(...args);
            await hooks.after?.(holder.f, accepted);
            return accepted;
          },
        },
      })),
    };
  holder.f = f;
  f.prepared = f.p;
  f.activation = await activate(f);
  f.p = f.activation.progress;
  f.mediaRequest = {
    restoreId: f.id,
    jobToken: f.p.jobToken,
    operationId: f.id + '-media-complete',
  };
  return { ...f, storage, assets, hooks };
}
export const finishMedia = (f) => f.factory().finalizeBookRestoreMedia(uid, f.mediaRequest);
export const mediaState = (f) =>
  f.factory().getBookRestoreMediaState(uid, {
    restoreId: f.id,
    jobToken: f.p.jobToken,
  });
