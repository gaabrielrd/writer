import { createWorkProgressLedger } from './workProgressLedger.mjs';
import { initialWorkControl, readWorkMetadata } from './workProgressContracts.mjs';
import { initialScene, initialSceneGroup, digest } from './sceneContracts.mjs';
import { rebalancedSceneRank } from './sceneRanks.mjs';
import { prepareUniverseProjectLink } from './universes.mjs';
import { prepareAdventureImportCleanup } from './adventureImportCleanup.mjs';
import { createAdventureImportRecoveryService } from './adventureImportRecovery.mjs';
import {
  adventureImportFail as fail,
  importInvalid,
  importInconsistent,
  importClosed,
  importId,
  importHash,
  importInteger,
  importSum,
  importDate,
  normalizeAdventureImportStart,
  normalizeAdventureImportMutation,
  adventureImportIds,
  adventureImportBorn,
  adventureImportProgress,
  adventureImportPhases,
  adventureImportRequestHash,
  adventureImportSection,
  adventureImportChain,
  adventureImportReviewHash,
  adventureImportSeed,
  adventureImportKeyId,
  adventureImportMetadataFields,
} from './adventureImportContracts.mjs';

export function createAdventureImportService({ db, now = Date.now }) {
  const ledger = createWorkProgressLedger({ db });
  function authorize(uid) {
    if (!uid) fail('unauthenticated', 'auth-required');
    if (typeof uid !== 'string' || uid.includes('/') || uid.length > 128)
      fail('unauthenticated', 'auth-required');
  }
  const jobRef = (uid, id) => db.doc(`users/${uid}/adventureImports/${id}`);
  const operationRef = (uid, id) => db.doc(`users/${uid}/adventureImportOperations/${id}`);
  const fenceRef = (uid, id) => db.doc(`users/${uid}/adventureImportStartFences/${id}`);
  const reservationRef = (id) => db.doc(`adventureImportReservations/${id}`);
  const keyRef = (uid, id) => db.doc(`users/${uid}/adventureImportRecoveryKeys/${id}`);
  function canceled(uid, id) {
    return {
      schemaVersion: 1,
      ownerId: uid,
      importId: id,
      adventureId: adventureImportIds(uid, id).adventureId,
      kind: 'canceled',
    };
  }
  async function loadJob(tx, uid, id, token, metadata = false, suppliedSnapshot) {
    authorize(uid);
    const ref = jobRef(uid, id),
      snapshot =
        suppliedSnapshot ??
        (metadata
          ? await readWorkMetadata(tx, ref, adventureImportMetadataFields)
          : await tx.get(ref));
    const job = snapshot.data();
    if (!job || job.ownerId !== uid) fail('not-found', 'import-unavailable');
    const progress = adventureImportProgress(uid, id, snapshot);
    if (token !== undefined && token !== progress.jobToken)
      fail('failed-precondition', 'identity-mismatch');
    const reserved = await tx.get(reservationRef(progress.adventureId)),
      r = reserved.data();
    if (
      !r ||
      r.schemaVersion !== 1 ||
      r.ownerId !== uid ||
      r.importId !== id ||
      r.adventureId !== progress.adventureId ||
      r.kind !== 'job' ||
      digest(adventureImportBorn(reserved)) !== digest(adventureImportBorn(snapshot))
    )
      importInconsistent();
    if (!metadata && r.startFingerprint !== job.startFingerprint) importInconsistent();
    return { ref, snapshot, job, progress };
  }
  function readOperation(value, uid, id, fingerprint, token, operationId, job) {
    if (!value) return null;
    if (value.ownerId !== uid || value.importId !== id || value.fingerprint !== fingerprint)
      importInvalid('operation-mismatch');
    const receipt = value.receipt;
    const fields = [
      'operationId',
      'action',
      'expectedCheckpoint',
      'checkpoint',
      'state',
      'phase',
      'index',
    ];
    const states = {
      startAdventureImport: ['uploading'],
      appendAdventureImportSection: ['uploading', 'preparing'],
      advanceAdventureImport: ['preparing', 'ready', 'deleting', 'deleted'],
      activateAdventureImport: ['activated'],
      cancelAdventureImport: ['deleting'],
    };
    if (
      value.schemaVersion !== 1 ||
      !receipt ||
      typeof receipt !== 'object' ||
      Array.isArray(receipt) ||
      Object.keys(receipt).length !== fields.length ||
      Object.keys(receipt).some((key) => !fields.includes(key)) ||
      receipt.operationId !== operationId ||
      !Object.hasOwn(states, receipt.action) ||
      !states[receipt.action].includes(receipt.state) ||
      receipt.phase !== adventureImportPhases[receipt.state] ||
      !Number.isSafeInteger(receipt.checkpoint) ||
      receipt.checkpoint < 0 ||
      receipt.checkpoint > job.checkpoint ||
      (token !== undefined && value.jobToken !== token)
    )
      importInconsistent();
    if (receipt.action === 'startAdventureImport') {
      if (
        receipt.expectedCheckpoint !== null ||
        receipt.checkpoint !== 0 ||
        receipt.index !== null ||
        value.jobToken !== undefined
      )
        importInconsistent();
    } else {
      if (
        !Number.isSafeInteger(receipt.expectedCheckpoint) ||
        receipt.expectedCheckpoint < 0 ||
        !Number.isSafeInteger(receipt.expectedCheckpoint + 1) ||
        receipt.checkpoint !== receipt.expectedCheckpoint + 1
      )
        importInconsistent();
      if (
        receipt.index !== null &&
        (!Number.isSafeInteger(receipt.index) ||
          receipt.index < 0 ||
          receipt.index >= job.sectionCount)
      )
        importInconsistent();
      if (
        (receipt.action === 'appendAdventureImportSection' && receipt.index === null) ||
        (['activateAdventureImport', 'cancelAdventureImport'].includes(receipt.action) &&
          receipt.index !== null)
      )
        importInconsistent();
    }
    return {
      operationId: receipt.operationId,
      action: receipt.action,
      expectedCheckpoint: receipt.expectedCheckpoint,
      checkpoint: receipt.checkpoint,
      state: receipt.state,
      phase: receipt.phase,
      index: receipt.index,
    };
  }
  function confirmed(uid, id, loaded, receipt, job = loaded.job) {
    return {
      kind: 'confirmed',
      receipt,
      progress: adventureImportProgress(uid, id, {
        createTime: loaded.snapshot.createTime,
        data: () => job,
      }),
    };
  }
  function receiptFor(action, request, job, index = null) {
    return {
      operationId: request.operationId,
      action,
      expectedCheckpoint: request.expectedCheckpoint ?? null,
      checkpoint: job.checkpoint,
      state: job.state,
      phase: adventureImportPhases[job.state],
      index,
    };
  }
  function writeOperation(tx, uid, id, request, action, receipt, token) {
    tx.create(operationRef(uid, request.operationId), {
      schemaVersion: 1,
      ownerId: uid,
      importId: id,
      fingerprint: adventureImportRequestHash(action, request),
      receipt,
      ...(token === undefined ? {} : { jobToken: token }),
    });
  }
  async function universe(tx, uid, id) {
    if (id === null) return;
    const world = (await tx.get(db.doc('universes/' + id))).data();
    if (!world || world.authorId !== uid || world.deleting || world.deleted)
      fail('failed-precondition', 'universe-unavailable');
  }
  async function start(uid, input) {
    authorize(uid);
    const request = normalizeAdventureImportStart(input),
      id = request.operationId,
      { adventureId } = adventureImportIds(uid, id),
      hash = adventureImportRequestHash('startAdventureImport', request),
      kid = adventureImportKeyId();
    const result = await db.runTransaction(async (tx) => {
      const [existing, reserved, op, fence, root, control] = await Promise.all([
        tx.get(jobRef(uid, id)),
        tx.get(reservationRef(adventureId)),
        tx.get(operationRef(uid, id)),
        tx.get(fenceRef(uid, id)),
        tx.get(db.doc('adventures/' + adventureId)),
        tx.get(db.doc(`adventures/${adventureId}/workProgress/current`)),
      ]);
      if (fence.exists) {
        const f = fence.data(),
          r = reserved.data();
        if (f.fingerprint !== hash) importInvalid('operation-mismatch');
        if (
          f.ownerId !== uid ||
          f.importId !== id ||
          !r ||
          r.kind !== 'fence' ||
          r.ownerId !== uid ||
          r.importId !== id ||
          r.startFingerprint !== hash ||
          existing.exists ||
          op.exists
        )
          importInconsistent();
        return canceled(uid, id);
      }
      if (existing.exists || op.exists) {
        if (!existing.exists || !op.exists) importInconsistent();
        const loaded = await loadJob(tx, uid, id);
        const receipt = readOperation(op.data(), uid, id, hash, undefined, id, loaded.job);
        if (receipt.action !== 'startAdventureImport') importInvalid('operation-mismatch');
        return confirmed(uid, id, loaded, receipt);
      }
      if (reserved.exists || root.exists || control.exists)
        fail('failed-precondition', 'identity-mismatch');
      await universe(tx, uid, request.project.universeId);
      const timestamp = importDate(now),
        job = {
          schemaVersion: 1,
          ownerId: uid,
          importId: id,
          adventureId,
          project: request.project,
          source: request.source,
          keyId: kid,
          keyEverCreated: false,
          recoveryKeyReady: false,
          reviewHash: request.reviewHash,
          sectionCount: request.sectionCount,
          totalBodyBytes: request.totalBodyBytes,
          state: 'uploading',
          checkpoint: 0,
          uploadedSections: 0,
          uploadedBodyBytes: 0,
          uploadedChainHash: adventureImportSeed,
          preparedSections: 0,
          preparedChainHash: adventureImportSeed,
          wordCount: 0,
          cleanedSections: 0,
          startFingerprint: hash,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
      const work = initialWorkControl(
        { kind: 'adventure', id: adventureId },
        { ownerId: uid, editorialState: 'draft' },
      );
      tx.create(jobRef(uid, id), job);
      tx.create(reservationRef(adventureId), {
        schemaVersion: 1,
        ownerId: uid,
        importId: id,
        adventureId,
        kind: 'job',
        startFingerprint: hash,
      });
      tx.create(db.doc(`adventures/${adventureId}/workProgress/current`), work);
      writeOperation(
        tx,
        uid,
        id,
        request,
        'startAdventureImport',
        receiptFor('startAdventureImport', request, job),
      );
      return null;
    });
    if (result) return result;
    // Firestore assigns createTime at commit; never derive a born token before that commit.
    return db.runTransaction(async (tx) => {
      const loaded = await loadJob(tx, uid, id),
        op = (await tx.get(operationRef(uid, id))).data();
      const receipt = readOperation(op, uid, id, hash, undefined, id, loaded.job);
      if (!receipt) importInconsistent();
      return confirmed(uid, id, loaded, receipt);
    });
  }
  async function resolveStart(uid, input) {
    authorize(uid);
    importClosed(input, ['operationId', 'requestHash', 'intent']);
    const id = importId(input.operationId),
      hash = importHash(input.requestHash);
    if (input.intent !== 'cancel') importInvalid();
    const { adventureId } = adventureImportIds(uid, id);
    return db.runTransaction(async (tx) => {
      const [job, op, fence, reserved, root] = await Promise.all([
        tx.get(jobRef(uid, id)),
        tx.get(operationRef(uid, id)),
        tx.get(fenceRef(uid, id)),
        tx.get(reservationRef(adventureId)),
        tx.get(db.doc('adventures/' + adventureId)),
      ]);
      if (job.exists || op.exists) {
        if (!job.exists || !op.exists || fence.exists) importInconsistent();
        const loaded = await loadJob(tx, uid, id),
          receipt = readOperation(op.data(), uid, id, hash, undefined, id, loaded.job);
        if (receipt.action !== 'startAdventureImport') importInvalid('operation-mismatch');
        return confirmed(uid, id, loaded, receipt);
      }
      if (fence.exists) {
        const f = fence.data(),
          r = reserved.data();
        if (f.fingerprint !== hash) importInvalid('operation-mismatch');
        if (
          f.ownerId !== uid ||
          f.importId !== id ||
          !r ||
          r.kind !== 'fence' ||
          r.ownerId !== uid ||
          r.importId !== id ||
          r.startFingerprint !== hash
        )
          importInconsistent();
        return canceled(uid, id);
      }
      if (reserved.exists || root.exists) fail('failed-precondition', 'identity-mismatch');
      tx.create(fenceRef(uid, id), {
        schemaVersion: 1,
        ownerId: uid,
        importId: id,
        fingerprint: hash,
      });
      tx.create(reservationRef(adventureId), {
        schemaVersion: 1,
        ownerId: uid,
        importId: id,
        adventureId,
        kind: 'fence',
        startFingerprint: hash,
      });
      return canceled(uid, id);
    });
  }
  async function get(uid, input) {
    authorize(uid);
    importClosed(input, ['importId', 'jobToken'], ['jobToken']);
    const id = importId(input.importId),
      token = Object.hasOwn(input, 'jobToken') ? importHash(input.jobToken) : undefined;
    return db.runTransaction(async (tx) => (await loadJob(tx, uid, id, token, true)).progress);
  }
  async function list(uid, input) {
    authorize(uid);
    importClosed(input, ['view', 'limit', 'cursor'], ['view', 'limit', 'cursor']);
    const view = input.view === undefined ? 'pending' : input.view,
      limit = input.limit === undefined ? 25 : importInteger(input.limit, 1);
    if (!['pending', 'all'].includes(view) || limit > 50) importInvalid();
    let cursor = null;
    if (input.cursor !== undefined && input.cursor !== null) {
      if (
        typeof input.cursor !== 'string' ||
        input.cursor.length > 4096 ||
        !/^[A-Za-z0-9_-]+$/.test(input.cursor)
      )
        importInvalid('invalid-cursor');
      try {
        cursor = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8'));
        importClosed(cursor, ['version', 'uid', 'view', 'createdAt', 'id']);
        if (cursor.version !== 1 || cursor.uid !== uid || cursor.view !== view) throw Error();
        importId(cursor.id);
        importInteger(cursor.createdAt);
        if (cursor.createdAt > 8640000000000000) throw Error();
      } catch {
        importInvalid('invalid-cursor');
      }
    }
    return db.runTransaction(async (tx) => {
      let query = db
        .collection(`users/${uid}/adventureImports`)
        .select(...adventureImportMetadataFields)
        .orderBy('createdAt', 'desc')
        .orderBy('__name__', 'desc')
        .limit(limit + 1);
      if (cursor) query = query.startAfter(cursor.createdAt, cursor.id);
      const docs = (await tx.get(query)).docs,
        examined = docs.slice(0, limit),
        items = [];
      for (const snapshot of examined) {
        const loaded = await loadJob(tx, uid, snapshot.id, undefined, true, snapshot);
        if (view === 'all' || !['activated', 'deleted'].includes(loaded.job.state))
          items.push(loaded.progress);
      }
      const last = examined.at(-1),
        result = {
          items,
          nextCursor:
            docs.length > limit
              ? Buffer.from(
                  JSON.stringify({
                    version: 1,
                    uid,
                    view,
                    createdAt: last.data().createdAt,
                    id: last.id,
                  }),
                ).toString('base64url')
              : null,
        };
      if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 4 * 1024 * 1024) importInconsistent();
      return result;
    });
  }
  async function mutate(uid, input, action) {
    authorize(uid);
    const request = normalizeAdventureImportMutation(
        input,
        action === 'appendAdventureImportSection',
      ),
      id = request.importId;
    const hash = adventureImportRequestHash(action, request);
    return db.runTransaction(async (tx) => {
      const loaded = await loadJob(tx, uid, id, request.jobToken),
        previous = (await tx.get(operationRef(uid, request.operationId))).data();
      const prior = readOperation(
        previous,
        uid,
        id,
        hash,
        request.jobToken,
        request.operationId,
        loaded.job,
      );
      if (prior) {
        if (prior.action !== action) importInvalid('operation-mismatch');
        return confirmed(uid, id, loaded, prior);
      }
      const job = loaded.job;
      if (job.checkpoint !== request.expectedCheckpoint)
        fail('failed-precondition', 'checkpoint-conflict');
      if ((await tx.get(db.doc('adventures/' + job.adventureId))).exists)
        fail('failed-precondition', 'state-conflict');
      let patch = {},
        index = null,
        write = () => {};
      const target = { kind: 'adventure', id: job.adventureId },
        root = `adventures/${job.adventureId}`;
      if (action === 'appendAdventureImportSection') {
        if (job.state !== 'uploading' || !job.recoveryKeyReady || !job.keyEverCreated)
          fail('failed-precondition', 'state-conflict');
        if (request.index !== job.uploadedSections)
          fail('failed-precondition', 'checkpoint-conflict');
        index = request.index;
        const text = adventureImportSection(request.section),
          ids = adventureImportIds(uid, id, index),
          manifestRef = db.doc(
            `users/${uid}/adventureImports/${id}/sections/${String(index).padStart(16, '0')}`,
          ),
          bodyRef = db.doc(`${root}/scenes/${ids.sceneId}/body/current`);
        const [manifest, body] = await Promise.all([tx.get(manifestRef), tx.get(bodyRef)]);
        if (manifest.exists || body.exists) importInconsistent();
        const uploadedSections = importSum(job.uploadedSections, 1),
          uploadedBodyBytes = importSum(job.uploadedBodyBytes, text.bodyBytes),
          wordCount = importSum(job.wordCount, text.wordCount),
          uploadedChainHash = adventureImportChain(job.uploadedChainHash, index, text);
        if (uploadedSections > job.sectionCount || uploadedBodyBytes > job.totalBodyBytes)
          fail('failed-precondition', 'review-mismatch');
        if (
          uploadedSections === job.sectionCount &&
          (uploadedBodyBytes !== job.totalBodyBytes ||
            wordCount === 0 ||
            adventureImportReviewHash(job, uploadedChainHash) !== job.reviewHash)
        )
          fail('failed-precondition', 'review-mismatch');
        patch = {
          uploadedSections,
          uploadedBodyBytes,
          uploadedChainHash,
          wordCount,
          ...(uploadedSections === job.sectionCount ? { state: 'preparing' } : {}),
        };
        write = () => {
          tx.create(manifestRef, {
            index,
            title: text.section.title,
            bodyHash: text.bodyHash,
            bodyBytes: text.bodyBytes,
            wordCount: text.wordCount,
            chainHash: uploadedChainHash,
          });
          tx.create(bodyRef, text.body);
        };
      } else if (action === 'advanceAdventureImport') {
        if (job.state === 'deleting') {
          const cleanup = prepareAdventureImportCleanup(tx, { db, uid, importId: id, job });
          patch = cleanup.patch;
          index = cleanup.index;
          write = cleanup.commit;
        } else if (job.state === 'preparing') {
          index = job.preparedSections;
          const ids = adventureImportIds(uid, id, index),
            prefix = `users/${uid}/adventureImports/${id}/sections/`,
            manifest = (await tx.get(db.doc(prefix + String(index).padStart(16, '0')))).data(),
            body = (await tx.get(db.doc(`${root}/scenes/${ids.sceneId}/body/current`))).data();
          if (!manifest || !body || typeof body.content !== 'string' || manifest.index !== index)
            importInconsistent();
          const text = adventureImportSection({ title: manifest.title, content: body.content }),
            previousChain = job.preparedChainHash;
          if (typeof previousChain !== 'string' || !/^[a-f0-9]{64}$/.test(previousChain))
            importInconsistent();
          if (
            body.revision !== 1 ||
            body.hash !== text.bodyHash ||
            manifest.bodyHash !== text.bodyHash ||
            manifest.bodyBytes !== text.bodyBytes ||
            manifest.wordCount !== text.wordCount ||
            manifest.chainHash !== adventureImportChain(previousChain, index, text)
          )
            importInconsistent();
          const partRef = db.doc(`${root}/parts/${ids.partId}`),
            sceneRef = db.doc(`${root}/scenes/${ids.sceneId}`),
            planningRef = db.doc(`${sceneRef.path}/planning/current`);
          if (
            (await tx.get(partRef)).exists ||
            (await tx.get(sceneRef)).exists ||
            (await tx.get(planningRef)).exists
          )
            importInconsistent();
          const timestamp = importDate(now, job.updatedAt),
            part = initialSceneGroup({
              uid,
              id: ids.partId,
              title: manifest.title,
              order: importSum(index, 1),
              timestamp,
              kind: 'adventure',
            }),
            created = initialScene({
              uid,
              id: ids.sceneId,
              title: manifest.title,
              parentId: ids.partId,
              content: body.content,
              timestamp,
              rank: rebalancedSceneRank(0),
            }),
            scene = {
              ...created.record,
              hasBlocks: true,
              mainWordCount: text.wordCount,
              blockWordCount: 0,
              blockCount: 0,
              blocksStructureRevision: 0,
              nextBlockOrder: 1,
              mainBlockOrder: 0,
              mainBlockTitle: 'Texto principal',
              mainBlockType: 'scene',
              mainBlockAudience: 'creator',
            };
          const progress = await ledger.prepareChanges(tx, {
            target,
            root: { ownerId: uid, hasProgressResources: true, editorialState: 'draft' },
            groupStates: [{ id: ids.partId, ...part }],
            changes: [
              {
                kind: 'scene',
                id: ids.sceneId,
                parentId: ids.partId,
                content: body.content,
                archived: false,
                blockScene: scene,
              },
            ],
          });
          const preparedSections = importSum(job.preparedSections, 1),
            last = preparedSections === job.sectionCount;
          const preparedChainHash = adventureImportChain(previousChain, index, text);
          if (
            last &&
            (progress.wordCount !== job.wordCount || preparedChainHash !== job.uploadedChainHash)
          )
            importInconsistent();
          patch = { preparedSections, preparedChainHash, ...(last ? { state: 'ready' } : {}) };
          write = () => {
            progress.commit();
            tx.create(partRef, {
              ...part,
              assemblyRevision: 1,
              structureRevision: 1,
              sceneCount: 1,
              wordCount: text.wordCount,
            });
            tx.create(sceneRef, scene);
            tx.create(planningRef, { objective: '', conflict: '', pointOfView: '' });
            if (last)
              tx.update(db.doc(`${root}/workProgress/current`), {
                countReady: true,
                phase: 'done',
                processed: preparedSections,
                cursor: null,
              });
          };
        } else fail('failed-precondition', 'state-conflict');
      } else if (action === 'activateAdventureImport') {
        if (job.state !== 'ready') fail('failed-precondition', 'state-conflict');
        const control = (await tx.get(db.doc(`${root}/workProgress/current`))).data();
        if (
          !control ||
          !control.countReady ||
          control.phase !== 'done' ||
          control.wordCount !== job.wordCount ||
          control.processed !== job.sectionCount ||
          job.preparedChainHash !== job.uploadedChainHash ||
          adventureImportReviewHash(job, job.uploadedChainHash) !== job.reviewHash
        )
          importInconsistent();
        await universe(tx, uid, job.project.universeId);
        const link = await prepareUniverseProjectLink(
            tx,
            db,
            uid,
            target,
            null,
            job.project.universeId,
            now,
            { strict: true },
          ),
          timestamp = importDate(now, job.updatedAt);
        patch = { state: 'activated', recoveryKeyReady: false };
        write = () => {
          link.commit();
          tx.create(db.doc(root), {
            id: job.adventureId,
            ownerId: uid,
            schemaVersion: 1,
            revision: 1,
            ...job.project,
            status: 'draft',
            editorialState: 'draft',
            language: 'pt-BR',
            hasProgressResources: true,
            sceneRevision: job.sectionCount,
            origin: {
              kind: 'imported',
              importId: id,
              sourceMediaType: job.source.mediaType,
              sourceHash: job.source.sha256,
              reviewHash: job.reviewHash,
            },
            createdAt: timestamp,
            updatedAt: timestamp,
          });
          tx.delete(keyRef(uid, id));
        };
      } else if (action === 'cancelAdventureImport') {
        if (!['uploading', 'preparing', 'ready'].includes(job.state))
          fail('failed-precondition', 'state-conflict');
        patch = { state: 'deleting', recoveryKeyReady: false };
        write = () => tx.delete(keyRef(uid, id));
      } else importInvalid();
      const next = {
          ...job,
          ...patch,
          ...(['activated', 'deleted'].includes(patch.state)
            ? { project: { title: job.project.title, universeId: job.project.universeId } }
            : {}),
          checkpoint: importSum(job.checkpoint, 1),
          updatedAt: importDate(now, job.updatedAt),
        },
        receipt = receiptFor(action, request, next, index),
        result = confirmed(uid, id, loaded, receipt, next);
      write();
      tx.set(loaded.ref, next);
      writeOperation(tx, uid, id, request, action, receipt, request.jobToken);
      return result;
    });
  }
  const recovery = createAdventureImportRecoveryService({ db, now, authorize, loadJob });
  return {
    startAdventureImport: start,
    resolveAdventureImportStart: resolveStart,
    listAdventureImports: list,
    getAdventureImport: get,
    appendAdventureImportSection: (uid, data) => mutate(uid, data, 'appendAdventureImportSection'),
    advanceAdventureImport: (uid, data) => mutate(uid, data, 'advanceAdventureImport'),
    activateAdventureImport: (uid, data) => mutate(uid, data, 'activateAdventureImport'),
    cancelAdventureImport: (uid, data) => mutate(uid, data, 'cancelAdventureImport'),
    getAdventureImportRecoveryKey: recovery.getAdventureImportRecoveryKey,
  };
}
