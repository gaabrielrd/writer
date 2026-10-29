import { generateKeyPairSync } from 'node:crypto';
import { restoredBackupFixture, uid } from './campaignRestoredBackup.mjs';
import { entity } from './campaignBackupLore.mjs';
import { adventureImportDb } from './adventureImportDb.mjs';
import { createCampaignBackupFileService } from '../../src/campaignBackupFile.mjs';
import { createCampaignRestoreTransferService } from '../../src/campaignRestoreTransfer.mjs';
import { sha } from '../../src/campaignRestoreContracts.mjs';
export { uid };
export const originRestoreId = 'campaign-origin-restore-0001',
  originRestoreRoot = 'users/' + uid + '/campaignRestores/' + originRestoreId;
export const originMutation = (p, operationId, extra = {}) => ({
  restoreId: originRestoreId,
  jobToken: p.jobToken,
  operationId,
  expectedCheckpoint: p.checkpoint,
  ...extra,
});
export const campaignOriginInput = (bytes) => ({
  size: bytes.length,
  read: async (o, n) => bytes.subarray(o, o + n),
});
export async function signedOriginCampaign({ long = false } = {}) {
  const f = await restoredBackupFixture({ local: true, long });
  await f.save('origin-persistent-variant', 0, entity({ details: 'SECRET ORIGIN TEXT' }));
  f.pair = generateKeyPairSync('ed25519');
  f.keys = [{ id: 'origin-persistent-test', state: 'active', publicKey: f.pair.publicKey }];
  f.makeFile = async () => {
    const frames = [];
    await createCampaignBackupFileService({
      db: f.db,
      storage: f.storage,
      keys: f.keys,
      keyId: f.keys[0].id,
      privateKey: f.pair.privateKey,
      now: () => 5000,
    }).writeCampaignBackupFile(
      uid,
      { campaignId: f.id },
      {
        sink: {
          async write(b) {
            frames.push(Buffer.from(b));
          },
          async commit() {},
          async abort() {
            frames.length = 0;
          },
        },
      },
    );
    return Buffer.concat(frames);
  };
  f.file = await f.makeFile();
  f.source = () => campaignOriginInput(f.file);
  return f;
}
function stamp(value) {
  const millis = Math.floor(value.seconds * 1000 + value.nanoseconds / 1e6);
  return { millis, nanos: value.nanoseconds - (millis % 1000) * 1e6 };
}
export async function originRestoreFixture(original) {
  const f = adventureImportDb({ nativeUpdates: true }),
    keys = original.keys.map((k) => ({ ...k }));
  // Only current source facts and account clock; no original campaign/base is needed.
  for (const [path, value] of original.records) {
    if (
      !path.startsWith('adventures/') &&
      !path.startsWith('universes/') &&
      !path.startsWith('adventureDeletionReservations/') &&
      path !== 'users/' + uid + '/campaignAuthorization/current'
    )
      continue;
    const snapshot = await original.db.doc(path).get(),
      a = stamp(snapshot.createTime),
      b = stamp(snapshot.updateTime);
    f.records.set(path, structuredClone(value));
    f.metadata.set(path, {
      createdAt: a.millis,
      createdAtNanoseconds: a.nanos,
      updatedAt: b.millis,
      updatedAtNanoseconds: b.nanos,
    });
  }
  const bytes = Buffer.from(original.file),
    api = createCampaignRestoreTransferService({ db: f.db, keys, now: () => 6000 });
  let p = (
    await api.startCampaignRestore(uid, {
      operationId: originRestoreId,
      source: {
        format: 'writer-campaign-backup',
        version: 1,
        byteLength: bytes.length,
        sha256: sha(bytes),
      },
    })
  ).progress;
  for (let n = 0; n < Math.ceil(bytes.length / 65536); n++) {
    const b = bytes.subarray(n * 65536, (n + 1) * 65536);
    p = (
      await api.appendCampaignRestoreChunk(
        uid,
        originMutation(p, 'origin-fixture-upload-' + n, {
          index: n,
          chunkHash: sha(b),
          chunkBase64: b.toString('base64'),
        }),
      )
    ).progress;
  }
  for (const [method, field, phase] of [
    ['advanceCampaignRestoreFileReview', 'fileReview', 'verified'],
    ['advanceCampaignRestoreOwnReview', 'ownReview', 'verified'],
    ['advanceCampaignRestoreDerivedIndex', 'derivedReview', 'indexed'],
    ['advanceCampaignRestoreDerivedSemantics', 'derivedCheck', 'verified'],
  ]) {
    let n = 0;
    while ((p[field]?.phase ?? p[field]?.status) !== phase && n < 2000)
      p = (
        await api[method](
          uid,
          originMutation(p, 'origin-fixture-' + field + '-' + n++, { limit: 25 }),
        )
      ).progress;
    if ((p[field]?.phase ?? p[field]?.status) !== phase)
      throw Error('Preparation failed: ' + field);
  }
  return { ...f, api, p, keys, bytes, original };
}
export async function finishOriginReview(f, p = f.p, limit = 25) {
  let n = 0;
  while (p.originReview?.phase !== 'verified' && n++ < 10000)
    p = (
      await f.api.advanceCampaignRestoreOriginReview(
        uid,
        originMutation(p, 'origin-review-finish-' + p.checkpoint, { limit }),
      )
    ).progress;
  if (p.originReview?.phase !== 'verified') throw Error('Origin review not verified');
  return p;
}
