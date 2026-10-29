import {
  campaignBackupScope,
  campaignBackupToken,
  campaignBackupIdentity,
} from './campaignBackupSource.mjs';
import {
  campaignBackupBaseContext,
  baseMasked,
  baseChanged,
  baseInconsistent,
  baseHash,
  BASE_ITEM_HEAD,
} from './campaignBackupBaseContext.mjs';
import { campaignBackupBaseContent } from './campaignBackupBaseContent.mjs';
import {
  CAMPAIGN_BASE_FIELDS,
  CAMPAIGN_BASE_CHUNK_BYTES as CHUNK,
  CAMPAIGN_BASE_PAGE_ITEMS as PAGE,
} from './campaignBackupBaseDefinitions.mjs';
import { baseBodyKey } from './campaignBaseContracts.mjs';
import { digest, workClosed, workFail } from './workProgressContracts.mjs';

const invalid = () => workFail('invalid-argument', 'Pedido de recurso congelado inválido.');
const safe = (n, min = 0) => Number.isSafeInteger(n) && n >= min;
function input(db, uid, data, extra) {
  const c = campaignBackupScope(db, uid, data, ['sourceToken', 'derivedToken', ...extra]);
  return {
    ...c,
    expected: campaignBackupToken(data.sourceToken),
    derivedExpected: campaignBackupToken(data.derivedToken),
  };
}
function resource(db, uid, data, text = false) {
  const c = input(db, uid, data, ['id', 'itemToken', 'index', ...(text ? ['field'] : [])]);
  const id = campaignBackupToken(data.id),
    itemExpected = campaignBackupToken(data.itemToken),
    index = data.index;
  if (!safe(index)) invalid();
  const field = data.field;
  if (
    text &&
    (typeof field !== 'string' ||
      !Object.values(CAMPAIGN_BASE_FIELDS).some((v) => v.includes(field)))
  )
    invalid();
  return { ...c, id, itemExpected, index, field };
}
function pageInput(db, uid, data) {
  const c = input(db, uid, data, ['limit', 'cursor', 'expectedPageToken']),
    limit = Object.hasOwn(data, 'limit') ? data.limit : PAGE;
  if (!safe(limit, 1) || limit > PAGE) invalid();
  const scope = {
    version: 1,
    uid,
    campaignId: c.campaignId,
    sourceToken: c.expected,
    derivedToken: c.derivedExpected,
    limit,
  };
  let after = null,
    cursorBaseId = null;
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
    workClosed(parsed, [...Object.keys(scope), 'baseId', 'after']);
    if (
      Buffer.from(JSON.stringify(parsed)).toString('base64url') !== data.cursor ||
      Object.keys(scope).some((k) => parsed[k] !== scope[k]) ||
      !baseHash(parsed.after) ||
      !baseHash(parsed.baseId)
    )
      invalid();
    after = parsed.after;
    cursorBaseId = parsed.baseId;
  }
  const pageExpected = Object.hasOwn(data, 'expectedPageToken')
    ? campaignBackupToken(data.expectedPageToken)
    : undefined;
  return { ...c, limit, scope, after, cursorBaseId, pageExpected };
}
function envelope(c, h) {
  return { ...c.anchor, id: c.id, itemToken: h.itemToken };
}
export function createCampaignBackupBaseReadService({ db }) {
  return {
    async listCampaignBackupBaseItems(uid, data) {
      const request = pageInput(db, uid, data);
      return db.runTransaction(async (tx) => {
        const c = await campaignBackupBaseContext(tx, request),
          collection = c.path + '/items';
        if (c.cursorBaseId !== null && c.cursorBaseId !== c.anchor.baseId) invalid();
        let q = db
          .collection(collection)
          .orderBy('__name__')
          .limit(c.limit + 1)
          .select(...BASE_ITEM_HEAD);
        if (c.after !== null) q = q.startAfter(c.after);
        const result = await tx.get(q);
        if (!Array.isArray(result?.docs) || result.docs.length > c.limit + 1) baseInconsistent();
        const observed = [];
        let previous = c.after;
        for (const snapshot of result.docs) {
          const id = snapshot.id;
          if (
            !baseHash(id) ||
            snapshot.ref?.path !== collection + '/' + id ||
            !snapshot.exists ||
            (previous !== null && id <= previous)
          )
            baseInconsistent();
          const h = await c.inspect(id);
          const native = await baseMasked(tx, db.doc(collection + '/' + id), BASE_ITEM_HEAD);
          if (
            digest(native.native) !== digest(h.native) ||
            digest(campaignBackupIdentity(snapshot)) !== digest(h.native) ||
            digest(native.value) !== digest(snapshot.data())
          )
            baseChanged();
          observed.push({ id, itemToken: h.itemToken, availability: h.availability });
          previous = id;
        }
        const pageToken = digest({ ...c.scope, baseId: c.anchor.baseId, after: c.after, observed });
        if (c.pageExpected !== undefined && c.pageExpected !== pageToken)
          workFail(
            'failed-precondition',
            'O inventário mudou. Reinicie a captura.',
            'campaign-backup-page-changed',
          );
        const items = observed.slice(0, c.limit);
        return {
          ...c.anchor,
          items,
          pageToken,
          nextCursor:
            observed.length > c.limit
              ? Buffer.from(
                  JSON.stringify({ ...c.scope, baseId: c.anchor.baseId, after: items.at(-1).id }),
                ).toString('base64url')
              : null,
        };
      });
    },
    async readCampaignBackupBaseItem(uid, data) {
      const request = resource(db, uid, data);
      return db.runTransaction(async (tx) => {
        const c = await campaignBackupBaseContext(tx, request),
          { head, content } = await campaignBackupBaseContent(c, c.id, c.itemExpected);
        const common = envelope(c, head);
        if (content === null) {
          if (c.index !== 0) invalid();
          return { ...common, outcome: 'unavailable' };
        }
        const json = JSON.stringify(content),
          bytes = Buffer.from(json),
          chunkCount = Math.ceil(bytes.length / CHUNK);
        if (c.index >= chunkCount) invalid();
        return {
          ...common,
          outcome: 'chunk',
          index: c.index,
          byteLength: bytes.length,
          chunkCount,
          contentHash: digest(json),
          chunkBase64: bytes.subarray(c.index * CHUNK, (c.index + 1) * CHUNK).toString('base64'),
        };
      });
    },
    async readCampaignBackupBaseText(uid, data) {
      const request = resource(db, uid, data, true);
      return db.runTransaction(async (tx) => {
        const c = await campaignBackupBaseContext(tx, request),
          { head, content } = await campaignBackupBaseContent(c, c.id, c.itemExpected);
        if (content === null)
          workFail(
            'failed-precondition',
            'Ficha indisponível.',
            'campaign-backup-base-item-unavailable',
          );
        const manifest = content.fields.find((f) => f.field === c.field);
        if (!manifest || c.index >= manifest.chunkCount) invalid();
        const id = baseBodyKey(manifest.bodySourceKey, c.field, c.index),
          ref = db.doc(c.path + '/bodies/' + id),
          h = await baseMasked(tx, ref, ['sourceKey', 'field', 'index']);
        if (
          !h.snapshot.exists ||
          h.value.sourceKey !== manifest.bodySourceKey ||
          h.value.field !== c.field ||
          h.value.index !== c.index
        )
          baseInconsistent();
        const body = await baseMasked(tx, ref, ['content']);
        if (digest(h.native) !== digest(body.native)) baseChanged();
        const value = body.value?.content;
        if (typeof value !== 'string') baseInconsistent();
        const bytes = Buffer.from(value, 'utf8');
        if (
          bytes.toString('utf8') !== value ||
          bytes.length > CHUNK ||
          (bytes.length === 0 &&
            !(manifest.bytes === 0 && manifest.chunkCount === 1 && c.index === 0)) ||
          bytes.length > manifest.bytes
        )
          baseInconsistent();
        if (
          manifest.chunkCount === 1 &&
          (bytes.length !== manifest.bytes || digest(value) !== manifest.sha256)
        )
          baseInconsistent();
        return {
          ...envelope(c, head),
          field: c.field,
          index: c.index,
          byteLength: bytes.length,
          fieldBytes: manifest.bytes,
          fieldChunkCount: manifest.chunkCount,
          fieldHash: manifest.sha256,
          bodyToken: digest({
            version: 1,
            kind: 'campaign-backup-frozen-body',
            uid: c.uid,
            ...c.anchor,
            bodySourceKey: manifest.bodySourceKey,
            field: c.field,
            index: c.index,
            native: h.native,
          }),
          chunkBase64: bytes.toString('base64'),
        };
      });
    },
  };
}
