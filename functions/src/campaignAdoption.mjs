import { prepareCampaignAuthorization } from './campaignAuthorization.mjs';
import {
  comparisonPath,
  ownedComparison,
  readComparisonContext,
} from './campaignComparisonContracts.mjs';
import {
  limit,
  encodeBaseCursor,
  decodeBaseCursor,
  captureScope,
} from './campaignBaseContracts.mjs';
import { decisionPage, decisionRow } from './campaignAdoptionRead.mjs';
import {
  advanceStage,
  abort,
  release,
  authorizationClock,
  resetAuthorization,
} from './campaignAdoptionStages.mjs';
import {
  digest,
  fail,
  validateId,
  workRevision,
  workDate,
  workConflict,
  adoptionPath,
  operationPath,
  startFencePath,
  startInput,
  startFields,
  stepInput,
  fingerprint,
  owned,
  next,
  progress,
  observation,
  adoptionContext,
  verifyReceipt,
  receipt,
  saveReceipt,
  generationId,
  guardRecord,
  requireGuard,
  certificateSeed,
  loreGenerationPath,
  meteredTransaction,
  choices,
} from './campaignAdoptionContracts.mjs';

export function createCampaignAdoptionService({ db, now = Date.now }) {
  const transaction = (fn, final = false) =>
    db.runTransaction(async (raw) => {
      const tx = meteredTransaction(raw);
      return tx.finish(await fn(tx), final);
    });
  const get = async (tx, uid, id) =>
    owned((await tx.get(db.doc(adoptionPath(uid, id)))).data(), uid, id);
  const result = async (tx, p, r) => ({
    receipt: r,
    progress: progress(p, await observation(tx, db, p)),
  });
  const canceled = (uid, input) => ({
    kind: 'canceled',
    schemaVersion: 1,
    ownerId: uid,
    request: input,
  });
  async function step(uid, data, action) {
    const input = stepInput(
        uid,
        data,
        action === 'decide' ? ['sourceKey', 'expectedRevision', 'choice'] : [],
      ),
      hash = fingerprint(action, input);
    if (action === 'decide' && !choices.includes(input.choice))
      fail('invalid-argument', 'Escolha inválida.');
    return transaction(async (tx) => {
      const p = await get(tx, uid, input.adoptionId);
      const previous = verifyReceipt(
        (await tx.get(db.doc(operationPath(uid, input.operationId)))).data(),
        hash,
      );
      if (previous) return result(tx, p, previous.receipt);
      if (p.checkpoint !== input.expectedCheckpoint) workConflict();
      let value,
        outcome = 'confirmed';
      if (action === 'cancel') {
        if (p.state === 'adopted')
          fail('failed-precondition', 'A adoção confirmada não pode ser cancelada.');
        await release(tx, db, p);
        if (p.state === 'deleted') value = next(p, now);
        else {
          const path = loreGenerationPath(p.campaignId, p.loreGenerationId);
          const part = p.cleanupCollection ?? 0,
            collections = ['decisions', 'loreVariants', 'loreVariantBodies'];
          if (!Number.isSafeInteger(part) || part < 0 || part >= collections.length)
            fail('failed-precondition', 'Limpeza inconsistente.');
          const collection =
            part === 0 ? adoptionPath(uid, p.id) + '/decisions' : path + '/' + collections[part];
          const docs = (
            await tx.get(db.collection(collection).orderBy('__name__').limit(26).select())
          ).docs;
          for (const doc of docs.slice(0, 25)) tx.delete(doc.ref);
          const n = docs.length > 25 ? part : part + 1;
          const complete = n === collections.length;
          if (complete) tx.delete(db.doc(path));
          value = next(p, now, {
            state: complete ? 'deleted' : 'deleting',
            phase: 'cleanup',
            cleanupCollection: n,
            cursor: null,
          });
        }
      } else if (action === 'decide') {
        if (p.state !== 'reviewing')
          fail('failed-precondition', 'A revisão não aceita novas escolhas.');
        const c = await adoptionContext(tx, db, p),
          row = await decisionRow(tx, db, p, c, input.sourceKey);
        if (!row) fail('not-found', 'Ficha indisponível.');
        if (row.revision !== input.expectedRevision) workConflict();
        if (
          (row.candidate.present && input.choice === 'discard-local') ||
          (!row.candidate.present && input.choice === 'use-candidate')
        )
          fail('invalid-argument', 'Escolha incompatível com a presença da ficha.');
        tx.set(db.doc(adoptionPath(uid, p.id) + '/decisions/' + input.sourceKey), {
          sourceKey: input.sourceKey,
          revision: input.expectedRevision,
          choice: input.choice,
          authorized: true,
        });
        value = next(p, now);
      } else if (action === 'prepare') {
        if (p.state !== 'reviewing')
          fail('failed-precondition', 'Esta revisão não pode ser preparada.');
        const c = await adoptionContext(tx, db, p),
          guard = c.current.guard;
        if (guard.record?.adoptionId != null)
          fail('failed-precondition', 'Outra adoção está em preparação.', 'adoption-in-progress');
        if (c.comparison.adoptionClaim)
          fail('failed-precondition', 'A candidata já está reservada.');
        await authorizationClock(tx, db, p);
        const g = guardRecord(p, guard.record, true);
        value = next(p, now, {
          state: 'preparing',
          phase: 'operations',
          cursor: null,
          admissionEpoch: g.admissionEpoch,
          decisionCheckpoint: p.checkpoint,
          reason: null,
        });
        value.stagedDigest = certificateSeed(value);
        if (!c.current.controlRecord)
          tx.create(c.current.controlRef, {
            schemaVersion: 1,
            ownerId: uid,
            campaignId: p.campaignId,
            campaignToken: p.campaignToken,
            baseId: p.currentBaseId,
            revision: 0,
          });
        tx.set(guard.ref, g);
        tx.update(db.doc(comparisonPath(uid, p.comparisonId)), {
          adoptionClaim: { adoptionId: p.id, admissionEpoch: g.admissionEpoch },
        });
      } else {
        if (
          (action === 'advance' && p.state !== 'preparing') ||
          (action === 'activate' && p.state !== 'ready')
        )
          fail('failed-precondition', 'A revisão não permite esta etapa.');
        const observed = await observation(tx, db, p);
        if (!observed.available) value = await abort(tx, db, p, now, observed.reason);
        else {
          let c;
          // A changed global C2 revision aborts this staging; no choices are rebased.
          try {
            c = await adoptionContext(tx, db, p);
          } catch (error) {
            if (
              error.details?.reason === 'revision-conflict' ||
              error.reason === 'revision-conflict'
            )
              value = await abort(tx, db, p, now, 'revision-conflict');
            else throw error;
          }
          if (!value) {
            requireGuard(p, c.current.guard.record);
            const claim = c.comparison.adoptionClaim;
            if (claim?.adoptionId !== p.id || claim.admissionEpoch !== p.admissionEpoch)
              fail('failed-precondition', 'A reserva da candidata mudou.');
            const authorization = await authorizationClock(tx, db, p);
            if (action === 'advance') {
              value = await advanceStage(tx, db, p, c, now);
              if (value.reason === 'reauthorization-required') outcome = 'reauthorization-required';
            } else if (digest(p.authorization) !== digest(authorization)) {
              value = resetAuthorization(p, now, authorization);
              outcome = 'reauthorization-required';
            } else {
              if (!p.authorizationComplete || !p.authorizationDigest || !p.stagedDigest)
                fail('failed-precondition', 'A certificação está incompleta.');
              const campaign = c.current.campaign;
              const revision = workRevision(campaign.revision + 1),
                collectionRevision = workRevision(p.expectedCollectionRevision + 1);
              const timestamp = workDate(now, campaign.updatedAt);
              value = next(p, now, { state: 'adopted', phase: 'complete', reason: null });
              tx.update(db.doc('campaigns/' + p.campaignId), {
                activeBaseId: p.candidateBaseId,
                provenance: {
                  kind: 'original',
                  adventureId: p.adventureId,
                  baseId: p.candidateBaseId,
                },
                activeLoreGenerationId: p.loreGenerationId,
                revision,
                updatedAt: timestamp,
              });
              tx.set(c.current.controlRef, {
                schemaVersion: 1,
                ownerId: uid,
                campaignId: p.campaignId,
                campaignToken: p.campaignToken,
                baseId: p.candidateBaseId,
                revision: collectionRevision,
              });
              tx.update(db.doc(loreGenerationPath(p.campaignId, p.loreGenerationId)), {
                state: 'ready',
              });
              tx.update(db.doc(comparisonPath(uid, p.comparisonId)), {
                state: 'adopted',
                adoptionId: p.id,
                adoptionClaim: null,
                updatedAt: timestamp,
                checkpoint: workRevision(c.comparison.checkpoint + 1),
              });
              tx.set(c.current.guard.ref, guardRecord(p, c.current.guard.record, false));
            }
          }
        }
      }
      const r = receipt(action, input, value, outcome);
      tx.update(db.doc(adoptionPath(uid, p.id)), value);
      saveReceipt(tx, db, uid, hash, r, value);
      // The observation precedes queued writes; activation availability is proven by c above.
      return {
        receipt: r,
        progress: progress(
          value,
          action === 'activate' && value.state === 'adopted'
            ? { available: true, reason: null }
            : await observation(tx, db, value),
        ),
      };
    }, action === 'activate');
  }
  return {
    async startCampaignAdoption(uid, data) {
      const input = startInput(uid, data),
        hash = fingerprint('start', input);
      return transaction(async (tx) => {
        const previous = verifyReceipt(
          (await tx.get(db.doc(operationPath(uid, input.operationId)))).data(),
          hash,
        );
        const fence = verifyReceipt(
          (await tx.get(db.doc(startFencePath(uid, input.operationId)))).data(),
          hash,
        );
        if (fence) return canceled(uid, input);
        if (previous) return result(tx, await get(tx, uid, previous.adoptionId), previous.receipt);
        const cmp = ownedComparison(
          (await tx.get(db.doc(comparisonPath(uid, input.comparisonId)))).data(),
          uid,
          input.comparisonId,
        );
        if (
          cmp.campaignId !== input.campaignId ||
          cmp.campaignToken !== input.campaignToken ||
          cmp.currentBaseId !== input.currentBaseId ||
          cmp.baseId !== input.candidateBaseId
        )
          fail('failed-precondition', 'A identidade da comparação mudou.');
        const c = await readComparisonContext(tx, db, uid, cmp);
        if (c.envelope.collectionRevision !== input.expectedCollectionRevision) workConflict();
        const auth = await prepareCampaignAuthorization(tx, db, uid, { bump: false });
        const timestamp = workDate(now),
          id = input.operationId;
        const p = {
          ...input,
          id,
          schemaVersion: 1,
          ownerId: uid,
          loreGenerationId: generationId(uid, input.campaignToken, id),
          adventureId: cmp.adventureId,
          authorizationToken: auth.record.token,
          state: 'reviewing',
          phase: 'review',
          checkpoint: 0,
          processed: 0,
          cursor: null,
          reason: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        const path = loreGenerationPath(p.campaignId, p.loreGenerationId);
        if (
          (await tx.get(db.doc(adoptionPath(uid, id)))).exists ||
          (await tx.get(db.doc(path))).exists
        )
          fail('already-exists', 'Identificador já utilizado.');
        auth.commit();
        tx.create(db.doc(adoptionPath(uid, id)), p);
        tx.create(db.doc(path), {
          schemaVersion: 1,
          id: p.loreGenerationId,
          ownerId: uid,
          campaignId: p.campaignId,
          campaignToken: p.campaignToken,
          baseId: p.candidateBaseId,
          state: 'preparing',
          createdAt: timestamp,
        });
        const r = receipt('start', input, p);
        saveReceipt(tx, db, uid, hash, r, p);
        return { receipt: r, progress: progress(p, { available: true, reason: null }) };
      });
    },
    async resolveCampaignAdoptionStart(uid, data) {
      captureScope(uid, data, [...startFields, 'intent']);
      if (data.intent !== 'cancel') fail('invalid-argument', 'Intenção inválida.');
      const original = Object.fromEntries(startFields.map((key) => [key, data[key]])),
        input = startInput(uid, original),
        hash = fingerprint('start', input);
      return transaction(async (tx) => {
        const previous = verifyReceipt(
          (await tx.get(db.doc(operationPath(uid, input.operationId)))).data(),
          hash,
        );
        if (previous) return result(tx, await get(tx, uid, previous.adoptionId), previous.receipt);
        const ref = db.doc(startFencePath(uid, input.operationId)),
          fence = verifyReceipt((await tx.get(ref)).data(), hash);
        if (!fence) tx.create(ref, { schemaVersion: 1, ownerId: uid, fingerprint: hash });
        return canceled(uid, input);
      });
    },
    async getCampaignAdoption(uid, data) {
      captureScope(uid, data, ['adoptionId']);
      const id = validateId(data.adoptionId);
      return transaction(async (tx) => {
        const p = await get(tx, uid, id);
        return progress(p, await observation(tx, db, p));
      });
    },
    async listCampaignAdoptions(uid, data) {
      captureScope(uid, data, ['campaignId', 'cursor', 'limit']);
      const size = limit(data.limit),
        campaignId = data.campaignId === undefined ? null : validateId(data.campaignId),
        scope = { uid, campaignId };
      const cursor = decodeBaseCursor(data.cursor, scope, ['key', 'date']);
      return transaction(async (tx) => {
        let q = db
          .collection(`users/${uid}/campaignAdoptions`)
          .orderBy('createdAt', 'desc')
          .orderBy('__name__')
          .limit(size + 1);
        if (campaignId) q = q.where('campaignId', '==', campaignId);
        if (cursor) q = q.startAfter(cursor.date, cursor.key);
        const docs = (await tx.get(q)).docs,
          items = [];
        for (const doc of docs.slice(0, size)) {
          const p = owned(doc.data(), uid, doc.id);
          items.push(progress(p, await observation(tx, db, p)));
        }
        const last = docs[size - 1];
        return {
          items,
          nextCursor:
            docs.length > size
              ? encodeBaseCursor({ version: 1, scope, key: last.id, date: last.data().createdAt })
              : null,
        };
      });
    },
    async listCampaignAdoptionDecisions(uid, data) {
      captureScope(uid, data, ['adoptionId', 'cursor', 'limit']);
      const id = validateId(data.adoptionId);
      return transaction(async (tx) => {
        const p = await get(tx, uid, id);
        return decisionPage(tx, db, p, await adoptionContext(tx, db, p), data);
      });
    },
    decideCampaignAdoption: (uid, data) => step(uid, data, 'decide'),
    prepareCampaignAdoption: (uid, data) => step(uid, data, 'prepare'),
    advanceCampaignAdoption: (uid, data) => step(uid, data, 'advance'),
    activateCampaignAdoption: (uid, data) => step(uid, data, 'activate'),
    cancelCampaignAdoption: (uid, data) => step(uid, data, 'cancel'),
  };
}
