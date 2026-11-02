import { campaignBackupScope, campaignBackupToken } from './campaignBackupSource.mjs';
import {
  campaignBackupLoreContext,
  LORE_BACKUP_HEAD,
  loreBackupBad,
  loreBackupChanged,
} from './campaignBackupLoreContext.mjs';
import { campaignBackupLoreContent } from './campaignBackupLoreContent.mjs';
import { campaignBackupBaseContent } from './campaignBackupBaseContent.mjs';
import { campaignBackupBaseSnapshot } from './campaignBackupBaseResources.mjs';
import {
  campaignBackupBaseManifests,
  readCampaignBackupBaseBody,
  auditCampaignBackupBaseField,
} from './campaignBackupBaseBodies.mjs';
import { CAMPAIGN_BASE_FIELDS } from './campaignBackupBaseDefinitions.mjs';
import { digest, workClosed, workFail } from './workProgressContracts.mjs';
const invalid = () => workFail('invalid-argument', 'Pedido de lore congelado inválido.');
const hash = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const safe = (v, min = 0) => Number.isSafeInteger(v) && v >= min;
function input(db, uid, data, keys) {
  const c = campaignBackupScope(db, uid, data, ['sourceToken', 'derivedToken', ...keys]);
  return {
    ...c,
    expected: campaignBackupToken(data.sourceToken),
    derivedExpected: campaignBackupToken(data.derivedToken),
  };
}
function unitInput(db, uid, data, text = false) {
  const c = input(db, uid, data, ['id', 'variantToken', ...(text ? ['field', 'index'] : [])]),
    id = campaignBackupToken(data.id),
    variantExpected = campaignBackupToken(data.variantToken);
  const field = data.field,
    index = data.index;
  if (text && (!CAMPAIGN_BASE_FIELDS.lore.includes(field) || !safe(index))) invalid();
  return { ...c, id, variantExpected, field, index };
}
function listInput(db, uid, data) {
  const c = input(db, uid, data, ['limit', 'cursor', 'expectedPageToken']),
    limit = Object.hasOwn(data, 'limit') ? data.limit : 25;
  if (!safe(limit, 1) || limit > 25) invalid();
  const scope = {
    version: 1,
    uid,
    campaignId: c.campaignId,
    sourceToken: c.expected,
    derivedToken: c.derivedExpected,
    limit,
  };
  let after = null,
    storageExpected = null;
  if (data.cursor != null) {
    if (
      typeof data.cursor !== 'string' ||
      data.cursor.length > 4096 ||
      !/^[A-Za-z0-9_-]+$/.test(data.cursor)
    )
      invalid();
    let parsed;
    try {
      parsed = JSON.parse(Buffer.from(data.cursor, 'base64url').toString('utf8'));
    } catch {
      invalid();
    }
    workClosed(parsed, [...Object.keys(scope), 'storageToken', 'after']);
    if (
      Buffer.from(JSON.stringify(parsed)).toString('base64url') !== data.cursor ||
      Object.keys(scope).some((k) => parsed[k] !== scope[k]) ||
      !hash(parsed.storageToken) ||
      !hash(parsed.after)
    )
      invalid();
    after = parsed.after;
    storageExpected = parsed.storageToken;
  }
  return {
    ...c,
    limit,
    scope,
    after,
    storageExpected,
    pageExpected: Object.hasOwn(data, 'expectedPageToken')
      ? campaignBackupToken(data.expectedPageToken)
      : undefined,
  };
}
const envelope = (c, u) => ({ ...c.anchor, id: u.entry.id, variantToken: u.entry.variantToken });
async function selected(c) {
  const u = await c.inspect(c.id);
  if (!u || u.entry.variantToken !== c.variantExpected) loreBackupChanged();
  return u;
}
export function createCampaignBackupLoreService({ db }) {
  return {
    async listCampaignBackupLoreVariants(uid, data) {
      const request = listInput(db, uid, data);
      return db.runTransaction(async (tx) => {
        const c = await campaignBackupLoreContext(tx, request),
          collection = c.lorePath + '/loreVariants';
        if (c.storageExpected !== null && c.storageExpected !== c.storageToken) invalid();
        let q = db
          .collection(collection)
          .orderBy('__name__')
          .limit(c.limit + 1)
          .select(...LORE_BACKUP_HEAD);
        if (c.after !== null) q = q.startAfter(c.after);
        const page = await tx.get(q);
        if (!Array.isArray(page?.docs) || page.docs.length > c.limit + 1) loreBackupBad();
        let previous = c.after;
        const observed = [];
        for (const doc of page.docs) {
          if (
            !hash(doc.id) ||
            !doc.exists ||
            doc.ref?.path !== collection + '/' + doc.id ||
            (previous !== null && doc.id <= previous)
          )
            loreBackupBad();
          observed.push((await c.inspect(doc.id, doc)).entry);
          previous = doc.id;
        }
        const scope = { ...c.scope, storageToken: c.storageToken },
          pageToken = digest({ ...scope, after: c.after, observed });
        if (c.pageExpected !== undefined && c.pageExpected !== pageToken)
          workFail(
            'failed-precondition',
            'O inventário de variantes mudou.',
            'campaign-backup-page-changed',
          );
        const items = observed.slice(0, c.limit);
        return {
          ...c.anchor,
          items,
          pageToken,
          nextCursor:
            observed.length > c.limit
              ? Buffer.from(JSON.stringify({ ...scope, after: items.at(-1).id })).toString(
                  'base64url',
                )
              : null,
        };
      });
    },
    async readCampaignBackupLoreVariant(uid, data) {
      const request = unitInput(db, uid, data);
      return db.runTransaction(async (tx) => {
        const c = await campaignBackupLoreContext(tx, request),
          u = await selected(c),
          value = await campaignBackupLoreContent(c, u, c.variantExpected);
        return value === null
          ? { ...envelope(c, u), outcome: 'unavailable' }
          : { ...envelope(c, u), outcome: 'available', ...value };
      });
    },
    async readCampaignBackupLoreAnchor(uid, data) {
      const request = unitInput(db, uid, data);
      return db.runTransaction(async (tx) => {
        const c = await campaignBackupLoreContext(tx, request),
          u = await selected(c);
        if (u.entry.availability !== 'available')
          return { ...envelope(c, u), outcome: 'unavailable' };
        const { content } = await campaignBackupBaseContent(u.origin, c.id, u.item.itemToken),
          snapshot = await campaignBackupBaseSnapshot(u.origin),
          fields = [];
        for (const manifest of content.fields)
          fields.push(await auditCampaignBackupBaseField(u.origin, u.item, manifest));
        const result = { anchorKey: u.anchorKey, source: snapshot, item: content },
          json = JSON.stringify(result);
        return {
          ...envelope(c, u),
          outcome: 'available',
          content: result,
          fields,
          contentHash: digest(json),
          byteLength: Buffer.byteLength(json),
          anchorToken: digest({
            version: 1,
            kind: 'campaign-backup-lore-anchor',
            uid,
            ...c.anchor,
            variantToken: u.entry.variantToken,
            anchorKey: u.anchorKey,
            captured: u.origin.baseIdentity,
            contentHash: digest(json),
            fields,
          }),
        };
      });
    },
    async readCampaignBackupLoreAnchorText(uid, data) {
      const request = unitInput(db, uid, data, true);
      return db.runTransaction(async (tx) => {
        const c = await campaignBackupLoreContext(tx, request),
          u = await selected(c);
        if (u.entry.availability !== 'available')
          return { ...envelope(c, u), outcome: 'unavailable' };
        const manifests = await campaignBackupBaseManifests(u.origin, u.item),
          manifest = manifests.find((f) => f.field === c.field);
        if (!manifest || c.index >= manifest.chunkCount) invalid();
        const body = await readCampaignBackupBaseBody(u.origin, manifest, c.index);
        return {
          ...envelope(c, u),
          outcome: 'chunk',
          anchorKey: u.anchorKey,
          field: c.field,
          index: c.index,
          byteLength: body.bytes.length,
          fieldBytes: manifest.bytes,
          fieldChunkCount: manifest.chunkCount,
          fieldHash: manifest.sha256,
          bodyToken: body.bodyToken,
          chunkBase64: body.bytes.toString('base64'),
        };
      });
    },
  };
}
