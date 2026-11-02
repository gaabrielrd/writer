import {
  campaignBackupScope,
  campaignBackupToken,
  campaignBackupIdentity,
} from './campaignBackupSource.mjs';
import {
  campaignBackupLoreContext,
  loreBackupBad,
  loreBackupChanged,
} from './campaignBackupLoreContext.mjs';
import { campaignBackupLoreBinding } from './campaignBackupLoreBinding.mjs';
import { baseMasked, baseHash } from './campaignBackupBaseContext.mjs';
import { variantChunkId } from './campaignLoreContracts.mjs';
import { digest, workClosed, workFail } from './workProgressContracts.mjs';
export const LORE_BODY_METADATA = Object.freeze([
  'sourceKey',
  'baseId',
  'campaignToken',
  'revision',
  'index',
]);
export const LORE_STORE_METADATA = Object.freeze([
  'schemaVersion',
  'id',
  'ownerId',
  'campaignId',
  'campaignToken',
  'baseId',
  'state',
]);
const invalid = () => workFail('invalid-argument', 'Inventário de corpos inválido.');
const safe = (n, min = 0) => Number.isSafeInteger(n) && n >= min;
const scopeId = (v) => v === 'legacy' || baseHash(v);
function input(db, uid, data, keys) {
  const c = campaignBackupScope(db, uid, data, ['sourceToken', 'derivedToken', ...keys]);
  return {
    ...c,
    expected: campaignBackupToken(data.sourceToken),
    derivedExpected: campaignBackupToken(data.derivedToken),
  };
}
function route(path, c, fail = loreBackupBad) {
  if (typeof path !== 'string') fail();
  const p = path.split('/');
  if (p[0] !== 'campaigns' || p[1] !== c.campaignId) fail();
  if (p.length === 4 && p[2] === 'loreVariantBodies' && baseHash(p[3]))
    return { scope: 'legacy', id: p[3] };
  if (
    p.length === 6 &&
    p[2] === 'loreGenerations' &&
    baseHash(p[3]) &&
    p[4] === 'loreVariantBodies' &&
    baseHash(p[5])
  )
    return { scope: p[3], id: p[5] };
  fail();
}
function pageInput(db, uid, data, family) {
  const c = input(db, uid, data, [
      'limit',
      'cursor',
      'expectedPageToken',
      ...(family === 'bodies' ? ['scope', 'storeToken'] : []),
    ]),
    limit = Object.hasOwn(data, 'limit') ? data.limit : 25;
  if (!safe(limit, 1) || limit > 25) invalid();
  let storeScope = null,
    storeExpected = null;
  if (family === 'bodies') {
    if (!scopeId(data.scope)) invalid();
    storeScope = data.scope;
    storeExpected = campaignBackupToken(data.storeToken);
  }
  const scope = {
    version: 1,
    uid,
    campaignId: c.campaignId,
    sourceToken: c.expected,
    derivedToken: c.derivedExpected,
    family,
    limit,
    scope: storeScope,
    storeToken: storeExpected,
  };
  let after = null;
  if (data.cursor != null) {
    if (
      typeof data.cursor !== 'string' ||
      data.cursor.length > 8192 ||
      !/^[A-Za-z0-9_-]+$/.test(data.cursor)
    )
      invalid();
    let parsed;
    try {
      parsed = JSON.parse(Buffer.from(data.cursor, 'base64url').toString('utf8'));
    } catch {
      invalid();
    }
    workClosed(parsed, [...Object.keys(scope), 'after']);
    if (
      Buffer.from(JSON.stringify(parsed)).toString('base64url') !== data.cursor ||
      Object.keys(scope).some((k) => parsed[k] !== scope[k])
    )
      invalid();
    if (family === 'probe') route(parsed.after, c, invalid);
    else if (!baseHash(parsed.after)) invalid();
    after = parsed.after;
  }
  return {
    ...c,
    scope,
    limit,
    after,
    storeScope,
    storeExpected,
    pageExpected: Object.hasOwn(data, 'expectedPageToken')
      ? campaignBackupToken(data.expectedPageToken)
      : undefined,
  };
}
async function store(c, key, snapshot) {
  if (!scopeId(key)) loreBackupBad();
  const path = key === 'legacy' ? c.path : c.path + '/loreGenerations/' + key;
  const h = snapshot
    ? { snapshot, value: snapshot.data(), native: campaignBackupIdentity(snapshot) }
    : await baseMasked(c.tx, c.db.doc(path), key === 'legacy' ? ['ownerId'] : LORE_STORE_METADATA);
  if (!h.snapshot.exists || h.snapshot.ref?.path !== path) loreBackupBad();
  const v = h.value;
  if (key === 'legacy') {
    if (v.ownerId !== c.uid) loreBackupBad();
  } else if (
    c.independent ||
    v.schemaVersion !== 1 ||
    v.id !== key ||
    v.ownerId !== c.uid ||
    v.campaignId !== c.campaignId ||
    v.campaignToken !== c.campaignToken ||
    !baseHash(v.baseId) ||
    !['preparing', 'ready'].includes(v.state)
  )
    loreBackupBad();
  const active = key === (c.generationId ?? 'legacy'),
    status = active
      ? 'active'
      : key === 'legacy' || v.state === 'ready'
        ? 'historical'
        : 'operational',
    entry = {
      scope: key,
      status,
      storeToken: digest({
        version: 1,
        kind: 'campaign-backup-lore-store',
        uid: c.uid,
        ...c.anchor,
        storageToken: c.storageToken,
        scope: key,
        native: h.native,
        metadata: v,
        status,
      }),
    };
  return { path, entry, value: v };
}
function bodyReader(c) {
  const stores = new Map(),
    bindings = new Map();
  const getStore = async (key) => {
    if (!stores.has(key)) stores.set(key, await store(c, key));
    return stores.get(key);
  };
  const getBinding = async (unit) => {
    if (!bindings.has(unit.entry.id))
      bindings.set(unit.entry.id, await campaignBackupLoreBinding(c, unit));
    return bindings.get(unit.entry.id);
  };
  async function body(s, id, snapshot) {
    const path = s.path + '/loreVariantBodies/' + id,
      h = snapshot
        ? { snapshot, value: snapshot.data(), native: campaignBackupIdentity(snapshot) }
        : await baseMasked(c.tx, c.db.doc(path), LORE_BODY_METADATA),
      v = h.value;
    if (
      !h.snapshot.exists ||
      h.snapshot.ref?.path !== path ||
      !baseHash(id) ||
      !v ||
      v.campaignToken !== c.campaignToken ||
      !baseHash(v.sourceKey) ||
      !baseHash(v.baseId) ||
      !safe(v.revision, 1) ||
      !safe(v.index) ||
      (s.entry.scope !== 'legacy' && s.value.baseId !== v.baseId) ||
      variantChunkId(
        { campaignToken: c.campaignToken, base: { id: v.baseId } },
        v.sourceKey,
        v.revision,
        v.index,
      ) !== id
    )
      loreBackupBad();
    const owner = await c.inspect(v.sourceKey),
      mode = owner
        ? owner.value.mode === 'removed'
          ? owner.value.previousMode
          : owner.value.mode
        : null;
    let disposition = 'unreferenced',
      manifest = null;
    if (owner && mode === 'override') {
      const b = owner.value.bodyBinding,
        declaredScope = b
          ? b.layout === 'legacy'
            ? 'legacy'
            : b.generationId
          : (c.generationId ?? 'legacy'),
        matches =
          declaredScope === s.entry.scope &&
          (b ? b.baseId : owner.value.baseId) === v.baseId &&
          (b ? b.bodyRevision : v.revision) === v.revision;
      if (matches) {
        if (v.revision > owner.value.revision) loreBackupBad();
        if (owner.entry.availability !== 'available') disposition = 'unavailable';
        else {
          const binding = await getBinding(owner);
          if (
            binding.scope !== s.entry.scope ||
            binding.binding.baseId !== v.baseId ||
            binding.manifest.bodyRevision !== v.revision ||
            v.index >= binding.manifest.chunkCount
          )
            loreBackupBad();
          disposition = 'referenced';
          manifest = binding.manifest;
        }
      }
    }
    if (disposition === 'unreferenced' && s.entry.status === 'active') loreBackupBad();
    const resourceToken = digest({
      version: 1,
      kind: 'campaign-backup-variant-body',
      uid: c.uid,
      ...c.anchor,
      scope: s.entry.scope,
      storeToken: s.entry.storeToken,
      id,
      native: h.native,
      metadata: v,
      owner: owner?.entry.variantToken ?? null,
      manifest,
      disposition,
    });
    return { id, resourceToken, disposition };
  }
  return { getStore, getBinding, body };
}
function finish(c, observed, extra = {}, key = 'id') {
  const pageToken = digest({
    ...c.scope,
    storageToken: c.storageToken,
    after: c.after,
    observed,
    ...extra,
  });
  if (c.pageExpected !== undefined && c.pageExpected !== pageToken)
    workFail(
      'failed-precondition',
      'O inventário físico do lore mudou.',
      'campaign-backup-page-changed',
    );
  const items = observed.slice(0, c.limit);
  return {
    ...c.anchor,
    family: c.scope.family,
    ...(c.scope.family === 'bodies' ? { scope: c.storeScope, storeToken: c.storeExpected } : {}),
    ...extra,
    items,
    pageToken,
    nextCursor:
      observed.length > c.limit
        ? Buffer.from(JSON.stringify({ ...c.scope, after: items.at(-1)[key] })).toString(
            'base64url',
          )
        : null,
  };
}
export function createCampaignBackupLoreInventoryService({ db }) {
  return {
    async listCampaignBackupLoreStores(uid, data) {
      const request = pageInput(db, uid, data, 'stores');
      return db.runTransaction(async (tx) => {
        const c = await campaignBackupLoreContext(tx, request),
          collection = c.path + '/loreGenerations',
          legacy = await store(c, 'legacy');
        let q = db
          .collection(collection)
          .orderBy('__name__')
          .limit(c.limit + 1)
          .select(...LORE_STORE_METADATA);
        if (c.after !== null) q = q.startAfter(c.after);
        const page = await tx.get(q);
        if (!Array.isArray(page?.docs) || page.docs.length > c.limit + 1) loreBackupBad();
        const observed = [];
        let previous = c.after;
        for (const doc of page.docs) {
          if (
            !baseHash(doc.id) ||
            doc.ref?.path !== collection + '/' + doc.id ||
            !doc.exists ||
            (previous !== null && doc.id <= previous)
          )
            loreBackupBad();
          observed.push((await store(c, doc.id, doc)).entry);
          previous = doc.id;
        }
        return finish(c, observed, { legacy: legacy.entry }, 'scope');
      });
    },
    async listCampaignBackupLoreBodies(uid, data) {
      const request = pageInput(db, uid, data, 'bodies');
      return db.runTransaction(async (tx) => {
        const c = await campaignBackupLoreContext(tx, request),
          r = bodyReader(c),
          s = await r.getStore(c.storeScope);
        if (s.entry.storeToken !== c.storeExpected) loreBackupChanged();
        let q = db
          .collection(s.path + '/loreVariantBodies')
          .orderBy('__name__')
          .limit(c.limit + 1)
          .select(...LORE_BODY_METADATA);
        if (c.after !== null) q = q.startAfter(c.after);
        const page = await tx.get(q);
        if (!Array.isArray(page?.docs) || page.docs.length > c.limit + 1) loreBackupBad();
        const observed = [];
        let previous = c.after;
        for (const doc of page.docs) {
          if (
            !baseHash(doc.id) ||
            !doc.exists ||
            doc.ref?.path !== s.path + '/loreVariantBodies/' + doc.id ||
            (previous !== null && doc.id <= previous)
          )
            loreBackupBad();
          observed.push(await r.body(s, doc.id, doc));
          previous = doc.id;
        }
        return finish(c, observed);
      });
    },
    async probeCampaignBackupLoreBodies(uid, data) {
      const request = pageInput(db, uid, data, 'probe');
      return db.runTransaction(async (tx) => {
        const c = await campaignBackupLoreContext(tx, request),
          r = bodyReader(c);
        if (typeof db.collectionGroup !== 'function') loreBackupBad();
        let q = db
          .collectionGroup('loreVariantBodies')
          .where('campaignToken', '==', c.campaignToken)
          .orderBy('__name__')
          .limit(c.limit + 1)
          .select(...LORE_BODY_METADATA);
        if (c.after !== null) q = q.startAfter(db.doc(c.after));
        const page = await tx.get(q);
        if (!Array.isArray(page?.docs) || page.docs.length > c.limit + 1) loreBackupBad();
        const observed = [];
        let previous = c.after;
        for (const doc of page.docs) {
          const path = doc.ref?.path,
            routeValue = route(path, c);
          if (!doc.exists || doc.id !== routeValue.id || (previous !== null && path <= previous))
            loreBackupBad();
          const s = await r.getStore(routeValue.scope),
            value = await r.body(s, doc.id, doc);
          observed.push({ ...value, path });
          previous = path;
        }
        return finish(c, observed, {}, 'path');
      });
    },
    async getCampaignBackupLoreBodyCoverage(uid, data) {
      const request = input(db, uid, data, ['id', 'variantToken']),
        id = campaignBackupToken(data.id),
        expected = campaignBackupToken(data.variantToken);
      return db.runTransaction(async (tx) => {
        const c = await campaignBackupLoreContext(tx, request),
          unit = await c.inspect(id);
        if (!unit || unit.entry.variantToken !== expected) loreBackupChanged();
        const common = { ...c.anchor, id, variantToken: expected };
        if (unit.entry.availability !== 'available') return { ...common, outcome: 'unavailable' };
        const r = bodyReader(c),
          binding = await r.getBinding(unit);
        if (!binding.manifest)
          return {
            ...common,
            outcome: 'none',
            coverageToken: digest({ ...common, outcome: 'none' }),
          };
        const s = await r.getStore(binding.scope),
          parts = [];
        for (let index = 0; index < binding.manifest.chunkCount; index++) {
          const key = variantChunkId(
              { campaignToken: c.campaignToken, base: { id: binding.binding.baseId } },
              id,
              binding.manifest.bodyRevision,
              index,
            ),
            part = await r.body(s, key);
          if (part.disposition !== 'referenced') loreBackupBad();
          parts.push(part);
        }
        return {
          ...common,
          outcome: 'available',
          scope: binding.scope,
          storeToken: s.entry.storeToken,
          manifest: binding.manifest,
          parts,
          coverageToken: digest({
            version: 1,
            kind: 'campaign-backup-lore-coverage',
            ...common,
            scope: binding.scope,
            storeToken: s.entry.storeToken,
            manifest: binding.manifest,
            parts,
          }),
        };
      });
    },
  };
}
