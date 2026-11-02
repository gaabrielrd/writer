import { campaignBackupScope, campaignBackupToken } from './campaignBackupSource.mjs';
import {
  campaignBackupBaseContext,
  baseMasked,
  baseChanged,
  baseInconsistent,
  baseHash,
} from './campaignBackupBaseContext.mjs';
import {
  BASE_RESOURCES,
  campaignBackupBaseResource,
  campaignBackupBaseSnapshot,
} from './campaignBackupBaseResources.mjs';
import {
  campaignBackupBaseManifests,
  auditCampaignBackupBaseField,
} from './campaignBackupBaseBodies.mjs';
import {
  CAMPAIGN_BASE_PAGE_ITEMS as PAGE,
  CAMPAIGN_BASE_CHUNK_BYTES as CHUNK,
} from './campaignBackupBaseDefinitions.mjs';
import { digest, workClosed, workFail } from './workProgressContracts.mjs';

const invalid = () => workFail('invalid-argument', 'Inventário físico inválido.');
const safe = (n, min = 0) => Number.isSafeInteger(n) && n >= min;
function input(db, uid, data, keys) {
  const c = campaignBackupScope(db, uid, data, ['sourceToken', 'derivedToken', ...keys]);
  return {
    ...c,
    expected: campaignBackupToken(data.sourceToken),
    derivedExpected: campaignBackupToken(data.derivedToken),
  };
}
function family(value, base = false) {
  if (
    typeof value !== 'string' ||
    !(Object.hasOwn(BASE_RESOURCES, value) || (base && value === 'base'))
  )
    invalid();
  return value;
}
function pageInput(db, uid, data) {
  const c = input(db, uid, data, ['family', 'limit', 'cursor', 'expectedPageToken']),
    name = family(data.family),
    limit = Object.hasOwn(data, 'limit') ? data.limit : PAGE;
  if (!safe(limit, 1) || limit > PAGE) invalid();
  const scope = {
    version: 1,
    uid,
    campaignId: c.campaignId,
    sourceToken: c.expected,
    derivedToken: c.derivedExpected,
    family: name,
    limit,
  };
  let after = null,
    baseId = null;
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
      !baseHash(parsed.baseId) ||
      !baseHash(parsed.after)
    )
      invalid();
    after = parsed.after;
    baseId = parsed.baseId;
  }
  const pageExpected = Object.hasOwn(data, 'expectedPageToken')
    ? campaignBackupToken(data.expectedPageToken)
    : undefined;
  return { ...c, family: name, limit, scope, after, cursorBaseId: baseId, pageExpected };
}
function resourceInput(db, uid, data) {
  const c = input(db, uid, data, ['family', 'id', 'resourceToken', 'index']),
    name = family(data.family, true),
    id = campaignBackupToken(data.id),
    expectedResource = campaignBackupToken(data.resourceToken),
    index = data.index;
  if (!safe(index)) invalid();
  return { ...c, family: name, id, expectedResource, index };
}
function chunks(common, content, index) {
  if (content === null) {
    if (index !== 0) invalid();
    return { ...common, outcome: 'unavailable' };
  }
  const json = JSON.stringify(content),
    bytes = Buffer.from(json),
    chunkCount = Math.ceil(bytes.length / CHUNK);
  if (index >= chunkCount) invalid();
  return {
    ...common,
    outcome: 'chunk',
    index,
    byteLength: bytes.length,
    chunkCount,
    contentHash: digest(json),
    chunkBase64: bytes.subarray(index * CHUNK, (index + 1) * CHUNK).toString('base64'),
  };
}
/** Fixed physical families only. No persistent state, archive seal or access grant. */
export function createCampaignBackupBaseInventoryService({ db }) {
  return {
    async listCampaignBackupBaseResources(uid, data) {
      const request = pageInput(db, uid, data);
      return db.runTransaction(async (tx) => {
        const c = await campaignBackupBaseContext(tx, request),
          collection = c.path + '/' + c.family;
        if (c.cursorBaseId !== null && c.cursorBaseId !== c.anchor.baseId) invalid();
        let q = db
          .collection(collection)
          .orderBy('__name__')
          .limit(c.limit + 1)
          .select(...BASE_RESOURCES[c.family]);
        if (c.after !== null) q = q.startAfter(c.after);
        const page = await tx.get(q);
        if (!Array.isArray(page?.docs) || page.docs.length > c.limit + 1) baseInconsistent();
        let previous = c.after;
        const observed = [];
        for (const snapshot of page.docs) {
          const id = snapshot.id;
          if (
            !baseHash(id) ||
            snapshot.ref?.path !== collection + '/' + id ||
            !snapshot.exists ||
            (previous !== null && id <= previous)
          )
            baseInconsistent();
          const unit = await campaignBackupBaseResource(c, c.family, id, snapshot);
          observed.push(unit.entry);
          previous = id;
        }
        const pageToken = digest({ ...c.scope, baseId: c.anchor.baseId, after: c.after, observed });
        if (c.pageExpected !== undefined && c.pageExpected !== pageToken)
          workFail(
            'failed-precondition',
            'O inventário físico mudou. Reinicie a captura.',
            'campaign-backup-page-changed',
          );
        const items = observed.slice(0, c.limit);
        return {
          ...c.anchor,
          family: c.family,
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
    async readCampaignBackupBaseResource(uid, data) {
      const request = resourceInput(db, uid, data);
      return db.runTransaction(async (tx) => {
        const c = await campaignBackupBaseContext(tx, request);
        let content, resourceToken;
        if (c.family === 'base') {
          if (c.id !== c.anchor.baseId || c.expectedResource !== c.anchor.derivedToken)
            baseChanged();
          resourceToken = c.anchor.derivedToken;
          content = await campaignBackupBaseSnapshot(c);
        } else {
          const unit = await campaignBackupBaseResource(c, c.family, c.id);
          if (unit.entry.resourceToken !== c.expectedResource) baseChanged();
          resourceToken = unit.entry.resourceToken;
          content = unit.content;
        }
        return chunks({ ...c.anchor, family: c.family, id: c.id, resourceToken }, content, c.index);
      });
    },
    async auditCampaignBackupBaseItem(uid, data) {
      const c0 = input(db, uid, data, ['id', 'itemToken']),
        id = campaignBackupToken(data.id),
        itemExpected = campaignBackupToken(data.itemToken);
      return db.runTransaction(async (tx) => {
        const c = await campaignBackupBaseContext(tx, c0),
          head = await c.inspect(id);
        if (head.itemToken !== itemExpected) baseChanged();
        const common = {
          ...c.anchor,
          id,
          itemToken: head.itemToken,
          availability: head.availability,
        };
        if (head.availability !== 'available') return common;
        const manifests = await campaignBackupBaseManifests(c, head),
          fields = [];
        for (const manifest of manifests)
          fields.push(await auditCampaignBackupBaseField(c, head, manifest));
        const read = await baseMasked(tx, db.doc(c.path + '/items/' + id), ['image']);
        if (digest(read.native) !== digest(head.native)) baseChanged();
        let image = null;
        if (read.value.image != null) {
          const imageKey = read.value.image.imageKey;
          if (!baseHash(imageKey)) baseInconsistent();
          const unit = await campaignBackupBaseResource(c, 'images', imageKey);
          image = {
            imageKey,
            availability: unit.entry.availability,
            resourceToken: unit.entry.resourceToken,
          };
        }
        return {
          ...common,
          fields,
          image,
          itemAuditToken: digest({
            version: 1,
            kind: 'campaign-backup-item-audit',
            uid,
            ...c.anchor,
            id,
            itemToken: head.itemToken,
            fields,
            image,
          }),
        };
      });
    },
  };
}
