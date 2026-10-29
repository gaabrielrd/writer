import { parseVariantBody } from './campaignVariantBodyCodec.mjs';
import { createHash } from 'node:crypto';
import { overlayRecord, entityInput, bodyRefs, LORE_BYTES } from './campaignLoreContracts.mjs';
import { normalizedBodyBinding, bindingPath } from './campaignLoreStorage.mjs';
import { basePath } from './campaignBaseContracts.mjs';
import { baseMasked } from './campaignBackupBaseContext.mjs';
import { loreBackupBad, loreBackupChanged } from './campaignBackupLoreContext.mjs';
import { digest } from './workProgressContracts.mjs';
const CONTENT = ['name', 'category', 'manifest', 'bodyBinding', 'bodyCodec'];
const safe = (v, min = 0) => Number.isSafeInteger(v) && v >= min;
function compat(c) {
  return {
    uid: c.uid,
    campaignId: c.campaignId,
    campaignToken: c.campaignToken,
    generationId: c.generationId,
    base: { id: c.baseId, adventureId: c.adventureId },
  };
}
function typed(fn) {
  try {
    return fn();
  } catch {
    loreBackupBad();
  }
}
async function stored(c, binding) {
  const generation = binding.layout === 'generation',
    path = generation ? bindingPath(compat(c), binding) : basePath(c.uid, binding.baseId);
  const h = await baseMasked(c.tx, c.db.doc(path), [
    'schemaVersion',
    'ownerId',
    'campaignId',
    'campaignToken',
    'baseId',
    'state',
    'id',
    'adventureId',
  ]);
  const v = h.value;
  if (
    !h.snapshot.exists ||
    v.schemaVersion !== 1 ||
    v.ownerId !== c.uid ||
    v.campaignId !== c.campaignId ||
    v.state !== 'ready' ||
    (generation
      ? v.id !== binding.generationId ||
        v.campaignToken !== c.campaignToken ||
        v.baseId !== binding.baseId
      : v.id !== binding.baseId || v.adventureId !== c.adventureId)
  )
    loreBackupBad();
  return h.native;
}
async function entity(c, unit, overlay) {
  const scope = compat(c),
    binding = typed(() => normalizedBodyBinding(scope, overlay)),
    storage = await stored(c, binding),
    refs = bodyRefs(c.db, scope, overlay),
    native = createHash('sha256'),
    hash = createHash('sha256'),
    texts = [];
  let bytes = 0;
  native.update(
    JSON.stringify([
      'writer-variant-body-native-v1',
      c.anchor,
      c.storageToken,
      unit.entry.variantToken,
      binding,
      storage,
    ]) + '\n',
  );
  for (let index = 0; index < refs.length; index++) {
    const head = await baseMasked(c.tx, refs[index], [
        'sourceKey',
        'baseId',
        'campaignToken',
        'revision',
        'index',
      ]),
      v = head.value;
    if (
      !head.snapshot.exists ||
      v.sourceKey !== overlay.sourceKey ||
      v.baseId !== binding.baseId ||
      v.campaignToken !== c.campaignToken ||
      v.revision !== binding.bodyRevision ||
      v.index !== index
    )
      loreBackupBad();
    const read = await baseMasked(c.tx, refs[index], ['content']);
    if (digest(read.native) !== digest(head.native)) loreBackupChanged();
    const text = read.value?.content;
    if (typeof text !== 'string' || Buffer.from(text).toString('utf8') !== text) loreBackupBad();
    const part = Buffer.from(text);
    bytes += part.length;
    if (part.length > 65536 || !safe(bytes) || bytes > overlay.manifest.bytes || bytes > LORE_BYTES)
      loreBackupBad();
    texts.push(text);
    hash.update(part);
    native.update(JSON.stringify([index, head.native]) + '\n');
  }
  if (bytes !== overlay.manifest.bytes || hash.digest('hex') !== overlay.manifest.sha256)
    loreBackupBad();
  const raw = texts.join('');
  const value = typed(() => parseVariantBody(raw, overlay, entityInput));
  if (value.name !== overlay.name || value.category !== overlay.category) loreBackupBad();
  const relations = [],
    targets = [];
  for (const relation of value.relations) {
    if (relation.available === false) {
      relations.push({ targetKey: relation.targetKey, available: false, unresolved: true });
      continue;
    }
    const target = await c.target(relation.targetKey);
    targets.push([relation.targetKey, target]);
    relations.push(
      target.available
        ? { ...relation, available: true }
        : { targetKey: relation.targetKey, available: false },
    );
  }
  return {
    value: { ...value, relations },
    proof: { binding: storage, body: native.digest('hex'), targets },
  };
}
/** One canonical native entity, bounded by the existing 900,000-byte producer limit. */
export async function campaignBackupLoreContent(c, unit, expected) {
  if (!unit || unit.entry.variantToken !== expected) loreBackupChanged();
  if (unit.entry.availability !== 'available') return null;
  const read = await baseMasked(
    c.tx,
    c.db.doc(c.lorePath + '/loreVariants/' + unit.entry.id),
    CONTENT,
  );
  if (
    digest(read.native) !== digest(unit.native) ||
    Object.hasOwn(read.value, 'bodyCodec') !== Object.hasOwn(unit.value, 'bodyCodec') ||
    read.value.bodyCodec !== unit.value.bodyCodec
  )
    loreBackupChanged();
  const overlay = typed(() =>
    overlayRecord({ ...unit.value, ...read.value }, compat(c), unit.entry.id),
  );
  const content = {
    sourceKey: unit.entry.id,
    anchorKey: unit.anchorKey,
    mode: overlay.mode,
    name: overlay.name,
    category: overlay.category,
  };
  for (const key of ['previousMode', 'participation', 'retainedLegacy'])
    if (Object.hasOwn(overlay, key)) content[key] = overlay[key];
  let proof = null;
  if (overlay.manifest) {
    const body = await entity(c, unit, overlay);
    content.entity = body.value;
    proof = body.proof;
  }
  const json = JSON.stringify(content);
  return {
    content,
    contentHash: digest(json),
    byteLength: Buffer.byteLength(json),
    contentToken: digest({
      version: 1,
      kind: 'campaign-backup-lore-content',
      uid: c.uid,
      ...c.anchor,
      id: unit.entry.id,
      variantToken: expected,
      proof,
      contentHash: digest(json),
    }),
  };
}
