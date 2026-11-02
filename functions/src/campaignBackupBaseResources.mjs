import {
  portableCampaignLink,
  portableCampaignLedger,
  matchPortableCampaignLedger,
  matchPortableCampaignLedgerOrigin,
} from './campaignPortableReferences.mjs';
import { campaignBackupIdentity } from './campaignBackupSource.mjs';
import {
  baseMasked,
  baseInconsistent,
  baseChanged,
  baseHash,
  BASE_ITEM_HEAD,
} from './campaignBackupBaseContext.mjs';
import { campaignBackupBaseManifests } from './campaignBackupBaseBodies.mjs';
import {
  baseBodyKey,
  baseImageKey,
  baseImageUseKey,
  BASE_IMAGE_BYTES,
} from './campaignBaseContracts.mjs';
import { loreReferenceOrigin } from './campaignLoreOrigin.mjs';
import { loreReference, reference as narrativeReference } from './narrativeContracts.mjs';
import { digest, workId } from './workProgressContracts.mjs';

export const BASE_RESOURCES = Object.freeze({
  bodies: Object.freeze(['sourceKey', 'field', 'index']),
  links: Object.freeze(['kind', 'sourceKey', 'reference', 'referenceMode', 'portableReference']),
  loreReferences: Object.freeze([
    'referenceKey',
    'reference',
    'available',
    'processed',
    'sourceKey',
    'referenceMode',
    'portableReference',
  ]),
  images: Object.freeze(['imageKey', 'imageId', 'state', 'path', 'generation', 'size', 'useKey']),
});
const safe = (n, min = 0) => Number.isSafeInteger(n) && n >= min;
function id(v) {
  try {
    return workId(v);
  } catch {
    baseInconsistent();
  }
}
function typed(read, value) {
  try {
    return read(value);
  } catch {
    baseInconsistent();
  }
}
const text = (v) => {
  if (typeof v !== 'string' || Buffer.from(v).toString('utf8') !== v) baseInconsistent();
  return v;
};
function entry(c, family, key, h, availability, deps, content) {
  const resourceToken = digest({
    version: 1,
    kind: 'campaign-backup-base-resource',
    uid: c.uid,
    ...c.anchor,
    family,
    id: key,
    native: h.native,
    metadata: h.value,
    dependencies: deps,
    availability,
  });
  return { entry: { id: key, resourceToken, availability }, content };
}
async function source(c, key, kind) {
  if (!baseHash(key)) baseInconsistent();
  const head = await c.inspect(key);
  if (
    !['scene', 'arc', 'milestone', 'event'].includes(head.value.kind) ||
    (kind === 'scene' && head.value.kind !== 'scene')
  )
    baseInconsistent();
  return head;
}
function loreTarget(ref) {
  return ref.kind === 'universe'
    ? { kind: 'lore', scopeId: ref.scopeId, id: ref.entityId }
    : ref.kind === 'adventure'
      ? { kind: 'adventure-lore', adventureId: ref.scopeId, id: ref.entityId }
      : { kind: 'book-lore', bookId: ref.scopeId, id: ref.entityId };
}
async function ledger(c, key, h, witness = true) {
  const portable = portableCampaignLedger(c.base, key, h.value);
  if (portable) {
    let target = null,
      linked = null;
    if (!portable.target.available) {
      const absent = await baseMasked(
        c.tx,
        c.db.doc(c.path + '/items/' + portable.target.sourceKey),
        ['sourceKey'],
      );
      if (absent.snapshot.exists) baseInconsistent();
    }
    if (portable.target.available) {
      target = await c.inspect(portable.target.sourceKey, true);
      if (!target || target.value.kind !== 'lore') baseInconsistent();
      matchPortableCampaignLedgerOrigin(key, target.value.origin);
    }
    if (witness) {
      const q = c.db
        .collection(c.path + '/links')
        .where('portableReference.ledgerId', '==', key)
        .orderBy('__name__')
        .limit(1)
        .select(...BASE_RESOURCES.links);
      const result = await c.tx.get(q);
      if (!Array.isArray(result?.docs) || result.docs.length !== 1) baseInconsistent();
      const doc = result.docs[0];
      if (!doc.exists || !baseHash(doc.id) || doc.ref?.path !== c.path + '/links/' + doc.id)
        baseInconsistent();
      const linkValue = doc.data(),
        link = portableCampaignLink(c.base, doc.id, linkValue);
      if (!link || link.ledgerId !== key) baseInconsistent();
      matchPortableCampaignLedger(link, portable);
      const owner = await source(c, linkValue.sourceKey, linkValue.kind);
      linked = { id: doc.id, native: campaignBackupIdentity(doc), owner: owner.itemToken };
    }
    return {
      target: {
        ...portable.target,
        available: portable.target.available && target?.availability === 'available',
      },
      dependencies: { target: target?.itemToken ?? null, witness: linked },
    };
  }
  const v = h.value,
    ref = typed(loreReference, v?.reference),
    origin = loreReferenceOrigin(ref, c.base);
  if (
    !origin ||
    v.referenceKey !== key ||
    key !== digest(ref) ||
    v.processed !== true ||
    typeof v.available !== 'boolean'
  )
    baseInconsistent();
  const targetKey = digest(origin),
    target = await c.inspect(targetKey, true);
  if (v.available) {
    if (v.sourceKey !== targetKey || !target || target.value.kind !== 'lore') baseInconsistent();
  } else if (Object.hasOwn(v, 'sourceKey') || target !== null) baseInconsistent();
  let linked = null;
  if (witness) {
    for (const [kind, reference] of [
      ['scene', ref],
      ['narrative', { kind: 'lore', reference: ref }],
    ]) {
      const prefix = kind === 'scene' ? 'reference' : 'reference.reference';
      let q = c.db
        .collection(c.path + '/links')
        .where('kind', '==', kind)
        .where(prefix + '.kind', '==', ref.kind)
        .where(prefix + '.scopeId', '==', ref.scopeId)
        .where(prefix + '.entityId', '==', ref.entityId);
      if (kind === 'narrative') q = q.where('reference.kind', '==', 'lore');
      q = q
        .orderBy('__name__')
        .limit(1)
        .select(...BASE_RESOURCES.links);
      const result = await c.tx.get(q);
      if (!Array.isArray(result?.docs) || result.docs.length > 1) baseInconsistent();
      const doc = result.docs[0];
      if (!doc) continue;
      if (!baseHash(doc.id) || doc.ref?.path !== c.path + '/links/' + doc.id || !doc.exists)
        baseInconsistent();
      const link = doc.data();
      if (link?.kind !== kind || digest(link.reference) !== digest(reference)) baseInconsistent();
      const owner = await source(c, link.sourceKey, kind);
      linked = { id: doc.id, native: campaignBackupIdentity(doc), owner: owner.itemToken };
      break;
    }
    if (linked === null) baseInconsistent();
  }
  return {
    target: {
      kind: 'lore',
      sourceKey: targetKey,
      available: !!v.available && target?.availability === 'available',
    },
    dependencies: { target: target?.itemToken ?? null, witness: linked },
  };
}
async function link(c, key, h) {
  const v = h.value;
  if (!v || !['scene', 'narrative'].includes(v.kind)) baseInconsistent();
  const owner = await source(c, v.sourceKey, v.kind);
  const portable = portableCampaignLink(c.base, key, v);
  if (portable) {
    let target = { ...portable.target, available: false },
      dependency = null;
    if (portable.ledgerId !== null) {
      const current = await baseMasked(
        c.tx,
        c.db.doc(c.path + '/loreReferences/' + portable.ledgerId),
        BASE_RESOURCES.loreReferences,
      );
      if (!current.snapshot.exists) baseInconsistent();
      const declaration = portableCampaignLedger(c.base, portable.ledgerId, current.value);
      matchPortableCampaignLedger(portable, declaration);
      const read = await ledger(c, portable.ledgerId, current, false);
      target = read.target;
      dependency = { native: current.native, ...read.dependencies };
    } else if (!portable.target.available) {
      const absent = await baseMasked(
        c.tx,
        c.db.doc(c.path + '/items/' + portable.target.sourceKey),
        ['sourceKey'],
      );
      if (absent.snapshot.exists) baseInconsistent();
    } else if (portable.target.available) {
      const head = await c.inspect(portable.target.sourceKey, true);
      if (!head || head.value.kind !== portable.target.kind) baseInconsistent();
      target.available = head.availability === 'available';
      dependency = head.itemToken;
    }
    return entry(
      c,
      'links',
      key,
      h,
      'available',
      { owner: owner.itemToken, target: dependency },
      { id: key, kind: v.kind, sourceKey: v.sourceKey, target },
    );
  }
  const ref =
    v.kind === 'scene'
      ? { kind: 'lore', reference: typed(loreReference, v.reference) }
      : typed(narrativeReference, v.reference);
  let target,
    dependency = null;
  if (ref.kind === 'lore') {
    const declaration = loreTarget(ref.reference),
      targetKey = digest(declaration),
      origin = loreReferenceOrigin(ref.reference, c.base);
    if (origin) {
      const ledgerId = digest(ref.reference),
        current = await baseMasked(
          c.tx,
          c.db.doc(c.path + '/loreReferences/' + ledgerId),
          BASE_RESOURCES.loreReferences,
        );
      if (!current.snapshot.exists) baseInconsistent();
      const read = await ledger(c, ledgerId, current, false);
      target = read.target;
      dependency = { native: current.native, ...read.dependencies };
    } else target = { kind: 'lore', sourceKey: targetKey, available: false };
  } else {
    const kind = ref.kind,
      origin = { adventureId: c.base.adventureId, kind, id: ref.sceneId ?? ref.eventId },
      targetKey = digest(origin),
      head = await c.inspect(targetKey, true);
    if (head && head.value.kind !== kind) baseInconsistent();
    target = { kind, sourceKey: targetKey, available: head?.availability === 'available' };
    dependency = head?.itemToken ?? null;
  }
  return entry(
    c,
    'links',
    key,
    h,
    'available',
    { owner: owner.itemToken, target: dependency },
    { id: key, kind: v.kind, sourceKey: v.sourceKey, target },
  );
}
async function body(c, key, h) {
  const v = h.value;
  if (
    !v ||
    !baseHash(v.sourceKey) ||
    typeof v.field !== 'string' ||
    !safe(v.index) ||
    baseBodyKey(v.sourceKey, v.field, v.index) !== key
  )
    baseInconsistent();
  const owner = await c.inspect(v.sourceKey);
  if (owner.availability !== 'available')
    return entry(c, 'bodies', key, h, 'unavailable', { owner: owner.itemToken }, null);
  const manifests = await campaignBackupBaseManifests(c, owner),
    manifest = manifests.find((f) => f.field === v.field);
  if (!manifest || manifest.bodySourceKey !== v.sourceKey || v.index >= manifest.chunkCount)
    baseInconsistent();
  return entry(
    c,
    'bodies',
    key,
    h,
    'available',
    { owner: owner.itemToken, manifest },
    { sourceKey: v.sourceKey, field: v.field, index: v.index },
  );
}
export async function campaignBackupBaseImage(c, key, h) {
  const v = h.value;
  if (
    !v ||
    v.imageKey !== key ||
    v.state !== 'ready' ||
    baseImageKey(id(v.imageId)) !== key ||
    v.useKey !== baseImageUseKey(c.anchor.baseId, v.imageId) ||
    typeof v.path !== 'string' ||
    !v.path ||
    typeof v.generation !== 'string' ||
    !/^\d+$/.test(v.generation) ||
    !safe(v.size, 1) ||
    v.size > BASE_IMAGE_BYTES
  )
    baseInconsistent();
  const q = c.db
      .collection(c.path + '/items')
      .where('image.imageKey', '==', key)
      .orderBy('__name__')
      .limit(1)
      .select(...BASE_ITEM_HEAD, 'image.imageKey'),
    found = await c.tx.get(q);
  if (!Array.isArray(found?.docs) || found.docs.length !== 1) baseInconsistent();
  const doc = found.docs[0];
  if (
    !baseHash(doc.id) ||
    !doc.exists ||
    doc.ref?.path !== c.path + '/items/' + doc.id ||
    doc.data()?.image?.imageKey !== key
  )
    baseInconsistent();
  const owner = await c.inspect(doc.id);
  if (owner.value.kind !== 'block') baseInconsistent();
  if (digest(campaignBackupIdentity(doc)) !== digest(owner.native)) baseChanged();
  const libraryPath = 'users/' + c.uid + '/imageLibrary/' + v.imageId,
    library = await baseMasked(c.tx, c.db.doc(libraryPath), ['state', 'path', 'useCount']),
    use = await baseMasked(c.tx, c.db.doc(libraryPath + '/uses/' + v.useKey), [
      'kind',
      'campaignId',
      'baseId',
    ]);
  const available =
    library.snapshot.exists &&
    library.value.state === 'active' &&
    library.value.path === v.path &&
    safe(library.value.useCount, 1) &&
    use.snapshot.exists &&
    use.value.kind === 'campaign-base' &&
    use.value.campaignId === c.campaignId &&
    use.value.baseId === c.anchor.baseId;
  return entry(
    c,
    'images',
    key,
    h,
    available ? 'available' : 'unavailable',
    { owner: owner.itemToken, library: library.native, use: use.native },
    available ? { imageKey: key, byteLength: v.size } : null,
  );
}
export async function campaignBackupBaseResource(c, family, key, snapshot) {
  if (!Object.hasOwn(BASE_RESOURCES, family) || !baseHash(key)) baseInconsistent();
  const ref = c.db.doc(c.path + '/' + family + '/' + key),
    h = snapshot
      ? { snapshot, value: snapshot.data(), native: campaignBackupIdentity(snapshot) }
      : await baseMasked(c.tx, ref, BASE_RESOURCES[family]);
  if (!h.snapshot.exists || h.snapshot.ref?.path !== ref.path) baseInconsistent();
  if (family === 'bodies') return body(c, key, h);
  if (family === 'links') return link(c, key, h);
  if (family === 'images') return campaignBackupBaseImage(c, key, h);
  const read = await ledger(c, key, h);
  return entry(c, family, key, h, 'available', read.dependencies, {
    id: key,
    targetKey: read.target.sourceKey,
    available: read.target.available,
  });
}
export async function campaignBackupBaseSnapshot(c) {
  const h = await baseMasked(c.tx, c.db.doc(c.path), [
    'snapshot.title',
    'snapshot.synopsis',
    'snapshot.language',
  ]);
  if (digest(h.native) !== digest(c.baseIdentity)) baseChanged();
  const snapshot = h.value?.snapshot;
  if (!snapshot) baseInconsistent();
  return {
    adventureId: c.base.adventureId,
    universeId: c.base.universeId ?? null,
    capturedAt: c.source.base.capturedAt,
    title: text(snapshot.title),
    synopsis: text(snapshot.synopsis),
    language: text(snapshot.language),
  };
}
