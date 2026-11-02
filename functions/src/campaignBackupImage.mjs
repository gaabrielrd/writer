import { createHash } from 'node:crypto';
import { campaignBackupScope, campaignBackupToken } from './campaignBackupSource.mjs';
import {
  campaignBackupBaseContext,
  baseMasked,
  baseChanged,
  baseHash,
} from './campaignBackupBaseContext.mjs';
import { campaignBackupBaseImage, BASE_RESOURCES } from './campaignBackupBaseResources.mjs';
import {
  CAMPAIGN_IMAGE_LIMITS as LIMITS,
  CAMPAIGN_IMAGE_PNG_SIGNATURE as PNG,
} from './campaignBackupImageDefinitions.mjs';
import { digest, workFail } from './workProgressContracts.mjs';
const invalid = () => workFail('invalid-argument', 'Pedido de imagem congelada inválido.');
const bad = () =>
  workFail(
    'failed-precondition',
    'A imagem congelada está inconsistente.',
    'campaign-backup-image-inconsistent',
  );
const changed = () =>
  workFail(
    'failed-precondition',
    'A imagem congelada mudou. Reinicie a captura.',
    'campaign-backup-image-changed',
  );
const unavailable = () =>
  workFail(
    'failed-precondition',
    'A imagem congelada está indisponível.',
    'campaign-backup-image-unavailable',
  );
const storageError = () =>
  workFail(
    'not-found',
    'Não foi possível ler o arquivo da imagem congelada.',
    'campaign-backup-image-storage-unavailable',
  );
const decimal = (v) => typeof v === 'string' && /^[0-9]+$/.test(v);
function input(db, uid, data, keys) {
  const c = campaignBackupScope(db, uid, data, [
    'sourceToken',
    'derivedToken',
    'id',
    'resourceToken',
    ...keys,
  ]);
  return {
    ...c,
    expected: campaignBackupToken(data.sourceToken),
    derivedExpected: campaignBackupToken(data.derivedToken),
    id: campaignBackupToken(data.id),
    resourceExpected: campaignBackupToken(data.resourceToken),
  };
}
const envelope = (state) => ({ ...state.anchor, id: state.id, resourceToken: state.resourceToken });
function metadata(raw, pin) {
  if (
    !raw ||
    !decimal(raw.generation) ||
    !decimal(raw.metageneration) ||
    raw.generation !== pin.generation ||
    !Number.isSafeInteger(raw.size) ||
    raw.size < 8 ||
    raw.size > LIMITS.imageBytes ||
    raw.size !== pin.size ||
    raw.contentType !== 'image/png'
  )
    bad();
  return {
    generation: raw.generation,
    metageneration: raw.metageneration,
    size: raw.size,
    contentType: 'image/png',
  };
}
/** Read-only private image bytes. Tokens are consistency observations, never archive attestations. */
export function createCampaignBackupImageService({ db, storage }) {
  async function access(p) {
    return db.runTransaction(async (tx) => {
      const c = await campaignBackupBaseContext(tx, p),
        h = await baseMasked(tx, db.doc(c.path + '/images/' + p.id), BASE_RESOURCES.images),
        unit = await campaignBackupBaseImage(c, p.id, h);
      if (unit.entry.resourceToken !== p.resourceExpected) baseChanged();
      const v = h.value;
      return {
        anchor: c.anchor,
        id: p.id,
        resourceToken: unit.entry.resourceToken,
        pin:
          unit.entry.availability === 'available'
            ? { path: v.path, generation: v.generation, size: v.size }
            : null,
      };
    });
  }
  /** State comes only from a fresh access or the immediately preceding post-I/O authorization. */
  async function external(p, state, run) {
    if (!state.pin) unavailable();
    let value,
      failed = false;
    try {
      value = await run(state.pin);
    } catch {
      failed = true;
    }
    const after = await access(p);
    if (!after.pin) unavailable();
    if (failed) storageError();
    return { state: after, value };
  }
  async function checked(p, state, expected) {
    if (!state.pin) {
      if (expected !== undefined) unavailable();
      return { ...state, storage: null, imageToken: null };
    }
    const result = await external(p, state, (pin) => storage.metadata(pin.path, pin.generation)),
      m = metadata(result.value, result.state.pin),
      imageToken = digest({
        version: 1,
        kind: 'campaign-backup-image',
        uid: p.uid,
        ...result.state.anchor,
        id: p.id,
        resourceToken: result.state.resourceToken,
        storage: m,
      });
    if (expected !== undefined && expected !== imageToken) changed();
    return { ...result.state, storage: m, imageToken };
  }
  return {
    async getCampaignBackupImage(uid, data) {
      const p = input(db, uid, data, []),
        state = await checked(p, await access(p));
      if (!state.pin) return { ...envelope(state), outcome: 'unavailable' };
      const hash = await external(p, state, (pin) =>
          storage.hashGeneration(pin.path, pin.generation, pin.size),
        ),
        after = await checked(p, hash.state, state.imageToken),
        value = hash.value;
      if (
        !value ||
        value.byteLength !== after.storage.size ||
        value.signature !== PNG ||
        !baseHash(value.contentHash)
      )
        bad();
      return {
        ...envelope(after),
        outcome: 'available',
        imageToken: after.imageToken,
        contentType: 'image/png',
        byteLength: value.byteLength,
        chunkCount: Math.ceil(value.byteLength / LIMITS.chunkBytes),
        contentHash: value.contentHash,
      };
    },
    async readCampaignBackupImageChunk(uid, data) {
      const p = input(db, uid, data, ['imageToken', 'index']),
        expected = campaignBackupToken(data.imageToken),
        index = data.index;
      if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= LIMITS.imageBytes / LIMITS.chunkBytes
      )
        invalid();
      const state = await checked(p, await access(p), expected),
        start = index * LIMITS.chunkBytes,
        end = Math.min(start + LIMITS.chunkBytes, state.storage.size) - 1;
      if (start > end) invalid();
      const read = await external(p, state, (pin) =>
          storage.readRange(pin.path, pin.generation, start, end),
        ),
        after = await checked(p, read.state, expected),
        bytes = read.value;
      if (!Buffer.isBuffer(bytes) || bytes.length !== end - start + 1) bad();
      return {
        ...envelope(after),
        imageToken: after.imageToken,
        index,
        byteLength: after.storage.size,
        chunkCount: Math.ceil(after.storage.size / LIMITS.chunkBytes),
        chunkBase64: bytes.toString('base64'),
        chunkHash: createHash('sha256').update(bytes).digest('hex'),
      };
    },
    async verifyCampaignBackupImage(uid, data) {
      const p = input(db, uid, data, ['imageToken']),
        expected = campaignBackupToken(data.imageToken),
        state = await checked(p, await access(p), expected);
      return { ...envelope(state), imageToken: state.imageToken };
    },
  };
}
