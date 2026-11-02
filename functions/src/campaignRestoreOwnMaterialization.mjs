import { readCampaignBackupFrame } from './campaignBackupContainer.mjs';
import {
  campaignFileJson,
  campaignFileUnit,
  campaignFileHeader,
} from './campaignBackupFileRecords.mjs';
import { parseCampaignBackupOwnContent } from './campaignBackupOwnContent.mjs';
import { CAMPAIGN_OWN_JSON_BYTES } from './campaignBackupOwnDefinitions.mjs';
import { metadata } from './campaignBackupOwnChecks.mjs';
import { readCampaignRestoreJsonUnit } from './campaignRestoreJsonUnit.mjs';
import { createCampaignRestoreReviewIndex } from './campaignRestoreReviewIndex.mjs';
import { createCampaignRestoreOwnWrites } from './campaignRestoreOwnWrites.mjs';
import { campaignIdentityToken } from './campaignIdentity.mjs';
import { initialWorkControl } from './workProgressContracts.mjs';
import { OWN_MATERIALIZATION_BYTES, ownRestoredId } from './campaignRestoreOwnFormat.mjs';
import { seal, open } from './campaignRestoreCrypto.mjs';
import {
  RESTORE_DOMAIN,
  authorize,
  closed,
  mutation,
  fingerprint,
  integer,
  digest,
  id,
  hash,
  bad,
  fail,
} from './campaignRestoreContracts.mjs';
const aad = (l, cp) => [RESTORE_DOMAIN, l.uid, l.rid, l.token, 'own-materialization', cp],
  scope = (proof) => digest([proof.manifest, proof.archive, proof.own]),
  projection = (s, total) => ({
    schemaVersion: 1,
    phase: s.phase,
    checkpoint: 0,
    records: s.cursor?.records ?? 0,
    offset: s.cursor?.offset ?? 0,
    processed: s.processed,
    total,
    written: s.written,
    cleaned: 0,
    audited: s.audited,
  });
function decode(l, key, proof) {
  if (!l.job.ownMaterialization)
    return {
      schemaVersion: 1,
      scope: scope(proof),
      phase: 'writing',
      cursor: null,
      active: null,
      processed: 0,
      written: 0,
      audited: 0,
      controlCursor: 0,
      project: null,
      progress: null,
    };
  let s;
  try {
    s = JSON.parse(
      open(
        key.bytes,
        l.job.ownMaterialization.payload,
        aad(l, l.job.ownMaterialization.checkpoint),
        OWN_MATERIALIZATION_BYTES,
      ).toString('utf8'),
    );
  } catch {
    bad();
  }
  closed(s, [
    'schemaVersion',
    'scope',
    'phase',
    'cursor',
    'active',
    'processed',
    'written',
    'audited',
    'controlCursor',
    'project',
    'progress',
  ]);
  if (
    s.schemaVersion !== 1 ||
    s.scope !== scope(proof) ||
    digest({
      ...projection(s, proof.own.units),
      checkpoint: l.job.ownMaterialization.checkpoint,
    }) !==
      digest(
        Object.fromEntries(
          Object.entries(l.job.ownMaterialization).filter(([k]) => k !== 'payload'),
        ),
      )
  )
    bad();
  integer(s.controlCursor, 0, proof.own.units);
  return s;
}
function ownTargets(l, dto) {
  const f = dto.kind,
    d = structuredClone(dto.data),
    mapped = (family, value) => ownRestoredId(l, family, value),
    targetId = mapped(f, dto.id),
    base = {
      schemaVersion: 1,
      ownerId: l.uid,
      campaignId: l.job.campaignId,
      campaignToken: campaignIdentityToken(l.uid, l.job.campaignId, l.snapshot),
      revision: 1,
    },
    target = (collection, value) => [{ collection, id: targetId, value }];
  if (f === 'note') return target('notes', { ...base, id: targetId, ...d, deleted: false });
  if (f === 'session') return target('sessions', { ...base, id: targetId, ...d, deleted: false });
  if (f === 'checklist') return target('workChecklist', { id: targetId, revision: 1, ...d });
  if (f === 'preparation-item')
    return target('preparationItems', { ...base, id: targetId, ...d, deleted: false });
  if (f === 'preparation-body') return target('preparationBodies', { ...base, id: targetId, ...d });
  if (f === 'session-reference')
    return target('sessionReferences', {
      ...base,
      id: targetId,
      ...d,
      sessionId: mapped('session', d.sessionId),
      deleted: false,
    });
  if (f === 'session-preparation-link')
    return target('sessionPreparationLinks', {
      ...base,
      id: targetId,
      ...d,
      sessionId: mapped('session', d.sessionId),
      itemId: mapped('preparation-item', d.itemId),
      deleted: false,
    });
  return [];
}
function globalTargets(l, s, c) {
  const base = {
      schemaVersion: 1,
      ownerId: l.uid,
      campaignId: l.job.campaignId,
      campaignToken: campaignIdentityToken(l.uid, l.job.campaignId, l.snapshot),
    },
    result = [
      { collection: 'noteState', id: 'current', value: { ...base, revision: c.notes ? 1 : 0 } },
      {
        collection: 'sessionState',
        id: 'current',
        value: { ...base, revision: c.sessions ? 1 : 0, nextOrder: c.nextSessionOrder },
      },
      {
        collection: 'preparationState',
        id: 'current',
        value: { ...base, revision: c.preparationItems ? 1 : 0, nextOrder: c.nextPreparationOrder },
      },
    ];
  if (s.progress.present || c.checklist)
    result.push({
      collection: 'workProgress',
      id: 'current',
      value: {
        ...initialWorkControl({ kind: 'campaign' }, s.project),
        ...s.progress.data,
        checklistRevision: c.checklist ? 1 : 0,
        checklistTotal: c.checklist,
        checklistCompleted: c.checklistCompleted,
      },
    });
  return result;
}
async function sessionTargets(tx, db, l, original) {
  const sessionId = ownRestoredId(l, 'session', original),
    path = 'campaigns/' + l.job.campaignId,
    refs = (
      await tx.get(
        db
          .collection(path + '/sessionReferences')
          .where('sessionId', '==', sessionId)
          .where('deleted', '==', false)
          .select('id')
          .limit(1),
      )
    ).docs,
    links = (
      await tx.get(
        db
          .collection(path + '/sessionPreparationLinks')
          .where('sessionId', '==', sessionId)
          .where('deleted', '==', false)
          .orderBy('order', 'desc')
          .orderBy('__name__', 'desc')
          .select('order')
          .limit(1),
      )
    ).docs,
    nextOrder = links.length ? integer(links[0].data().order, 1) + 1 : 1,
    base = {
      schemaVersion: 1,
      ownerId: l.uid,
      campaignId: l.job.campaignId,
      campaignToken: campaignIdentityToken(l.uid, l.job.campaignId, l.snapshot),
      sessionId,
    };
  integer(nextOrder, 1);
  return [
    {
      collection: 'sessionReferenceState',
      id: sessionId,
      value: { ...base, revision: refs.length ? 1 : 0 },
    },
    {
      collection: 'sessionPreparationState',
      id: sessionId,
      value: { ...base, revision: links.length ? 1 : 0, nextOrder },
    },
  ];
}
export function createCampaignRestoreOwnMaterialization({ store, openSource, ownSemantics }) {
  const { db } = store,
    index = createCampaignRestoreReviewIndex(store),
    writes = createCampaignRestoreOwnWrites(store);
  function ready(l) {
    if (l.job.state !== 'bytes-verified' || l.job.ownReview?.phase !== 'verified')
      fail('failed-precondition', 'own-review-incomplete');
  }
  async function scan(uid, r, s, proof) {
    const source = await openSource(uid, { restoreId: r.restoreId, jobToken: r.jobToken });
    let completed = null;
    for (let n = 0; n < r.limit; n++) {
      const step = await readCampaignBackupFrame(source, s.cursor);
      s.cursor = step.cursor;
      if (step.seal) bad();
      const frame = step.record;
      if (frame.kind === 'campaign') {
        if (s.cursor.records !== 1) bad();
        const h = campaignFileJson(frame.payload, campaignFileHeader);
        if (h.originCampaignId !== proof.manifest.originCampaignId) bad();
      } else if (frame.kind === 'unit') {
        if (s.active) bad();
        const unit = campaignFileJson(frame.payload, (v) =>
          campaignFileUnit(v, proof.manifest.contentVersion),
        );
        if (
          !unit.section.startsWith('own:') ||
          Number(frame.id) !== s.processed ||
          String(s.processed) !== frame.id
        )
          bad();
        if (unit.outcome === 'available') {
          if (unit.byteLength > CAMPAIGN_OWN_JSON_BYTES) bad();
          s.active = { id: frame.id, unit, part: 0, start: step.cursor };
        } else {
          completed = { unit, payload: null, dto: null };
          break;
        }
      } else if (frame.kind === 'data') {
        const a = s.active;
        if (!a || frame.id !== a.id || frame.part !== a.part) bad();
        a.part++;
        if (a.part === a.unit.chunkCount) {
          const payload = await readCampaignRestoreJsonUnit(
              source,
              a,
              bad,
              CAMPAIGN_OWN_JSON_BYTES,
            ),
            dto = parseCampaignBackupOwnContent(a.unit.section.slice(4), a.unit.id, payload);
          completed = { unit: a.unit, payload, dto };
          s.active = null;
          break;
        }
      } else if (frame.kind !== 'witness' || s.active) bad();
    }
    return completed;
  }
  return {
    async advanceCampaignRestoreOwnMaterialization(uid, input) {
      authorize(uid);
      const r = { ...mutation(input, ['limit']), limit: integer(input.limit, 1, 25) },
        fp = fingerprint('materialize-own', r),
        seed = await db.runTransaction(async (tx) => {
          const l = await store.load(tx, uid, r.restoreId, r.jobToken),
            op = await store.operation(tx, l, r.operationId, fp);
          if (op) return { replay: store.confirm(l, op) };
          if (l.job.checkpoint !== r.expectedCheckpoint)
            fail('failed-precondition', 'checkpoint-conflict');
          ready(l);
          if (l.job.ownMaterialization?.phase === 'ready')
            fail('failed-precondition', 'state-conflict');
          return { l, key: await store.key(tx, l, true) };
        });
      if (seed.replay) return seed.replay;
      try {
        const proof = await ownSemantics(uid, { restoreId: r.restoreId, jobToken: r.jobToken }),
          prepared = decode(seed.l, seed.key, proof),
          completed = prepared.phase === 'writing' ? await scan(uid, r, prepared, proof) : null,
          finalProof = await ownSemantics(uid, { restoreId: r.restoreId, jobToken: r.jobToken });
        if (scope(finalProof) !== scope(proof)) bad();
        const prior = await db.runTransaction(async (tx) => {
          const l = await store.load(tx, uid, r.restoreId, r.jobToken),
            op = await store.operation(tx, l, r.operationId, fp);
          if (op) return store.confirm(l, op);
          if (l.job.checkpoint !== r.expectedCheckpoint)
            fail('failed-precondition', 'checkpoint-conflict');
          ready(l);
          if (digest(l.job) !== digest(seed.l.job)) bad();
          if (!l.job.ownMaterialization) await writes.empty(tx, l);
          const s = structuredClone(prepared);
          let targets = [];
          if (s.phase === 'writing' && completed) {
            const row = (await index.page(tx, l, seed.key, s.processed, 1))[0],
              unit = completed.unit,
              value = metadata(unit, completed.payload);
            if (
              row.id !== unit.id ||
              row.family !== unit.section.slice(4) ||
              digest(row.value) !== digest(value)
            )
              bad();
            if (completed.dto) {
              if (completed.dto.kind === 'campaign')
                s.project = structuredClone(completed.dto.data);
              else if (completed.dto.kind === 'progress')
                s.progress = structuredClone(completed.dto);
              else targets = ownTargets(l, completed.dto);
            }
            s.processed++;
            if (s.processed === proof.own.units) {
              if (!s.project || !s.progress || s.active) bad();
              s.phase = 'global-controls';
            }
          } else if (s.phase === 'global-controls') {
            targets = globalTargets(l, s, proof.own);
            s.phase = 'session-controls';
          } else if (s.phase === 'session-controls') {
            const rows = await index.page(
              tx,
              l,
              seed.key,
              s.controlCursor,
              Math.min(r.limit, proof.own.units - s.controlCursor),
            );
            for (const row of rows) {
              s.controlCursor++;
              if (row.family === 'session' && row.value.outcome === 'available') {
                targets = await sessionTargets(tx, db, l, row.id);
                break;
              }
            }
            if (s.controlCursor === proof.own.units) s.phase = 'audit';
          } else if (s.phase === 'audit') {
            s.audited = await writes.audit(tx, l, s.audited, r.limit);
            if (s.audited === s.written) s.phase = 'ready';
          }
          const write = targets.length ? await writes.prepare(tx, l, r.operationId, targets) : null;
          if (write) s.written++;
          const bytes = Buffer.from(JSON.stringify(s));
          if (bytes.length > OWN_MATERIALIZATION_BYTES) bad();
          store.commit(
            tx,
            l,
            r,
            'materialize-own',
            fp,
            {
              ownMaterialization: {
                ...projection(s, proof.own.units),
                checkpoint: r.expectedCheckpoint + 1,
                payload: seal(seed.key.bytes, bytes, aad(l, r.expectedCheckpoint + 1)),
              },
            },
            write?.effect ?? null,
          );
          write?.commit();
          return null;
        });
        return prior ?? store.after(uid, r.restoreId, r.operationId, fp);
      } finally {
        seed.key.bytes.fill(0);
      }
    },
    async getCampaignRestoreOwnProject(uid, input) {
      authorize(uid);
      closed(input, ['restoreId', 'jobToken']);
      const r = { restoreId: id(input.restoreId), jobToken: hash(input.jobToken) },
        seed = await db.runTransaction(async (tx) => {
          const l = await store.load(tx, uid, r.restoreId, r.jobToken);
          ready(l);
          if (l.job.ownMaterialization?.phase !== 'ready')
            fail('failed-precondition', 'own-materialization-incomplete');
          return { l, key: await store.key(tx, l, true) };
        });
      try {
        const proof = await ownSemantics(uid, r),
          s = decode(seed.l, seed.key, proof);
        await db.runTransaction(async (tx) => {
          const l = await store.load(tx, uid, r.restoreId, r.jobToken);
          ready(l);
          if (digest(l.job) !== digest(seed.l.job))
            fail('failed-precondition', 'checkpoint-conflict');
        });
        return {
          validation: 'campaign-own-materialized-only',
          campaignId: seed.l.job.campaignId,
          campaignToken: campaignIdentityToken(uid, seed.l.job.campaignId, seed.l.snapshot),
          project: structuredClone(s.project),
          hasProgressResources: s.progress.present || proof.own.checklist > 0,
          own: proof.own,
          manifest: proof.manifest,
          archive: proof.archive,
        };
      } finally {
        seed.key.bytes.fill(0);
      }
    },
  };
}
