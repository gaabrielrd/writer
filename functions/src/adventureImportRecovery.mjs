import { randomBytes } from 'node:crypto';
import { GenerationError } from './generation.mjs';
import {
  importClosed,
  importId,
  importHash,
  importInvalid,
  importInconsistent,
  importDate,
  adventureImportFail as fail,
} from './adventureImportContracts.mjs';

export function createAdventureImportRecoveryService({ db, now = Date.now, authorize, loadJob }) {
  return {
    async getAdventureImportRecoveryKey(uid, input) {
      authorize(uid);
      importClosed(
        input,
        ['importId', 'jobToken', 'reviewHash', 'expectedKeyId'],
        ['expectedKeyId'],
      );
      const id = importId(input.importId),
        token = importHash(input.jobToken),
        reviewHash = importHash(input.reviewHash),
        expected = Object.hasOwn(input, 'expectedKeyId')
          ? importHash(input.expectedKeyId)
          : undefined,
        proposed = randomBytes(32).toString('base64');
      return db.runTransaction(async (tx) => {
        const loaded = await loadJob(tx, uid, id, token),
          job = loaded.job;
        if (!['uploading', 'preparing', 'ready'].includes(job.state))
          fail('failed-precondition', 'state-conflict');
        if (job.reviewHash !== reviewHash) fail('failed-precondition', 'review-mismatch');
        if (expected !== undefined && expected !== job.keyId)
          fail('failed-precondition', 'key-mismatch');
        if (typeof job.keyEverCreated !== 'boolean') importInconsistent();
        const ref = db.doc(`users/${uid}/adventureImportRecoveryKeys/${id}`),
          existing = (await tx.get(ref)).data();
        let keyBase64;
        if (job.keyEverCreated) {
          if (
            !job.recoveryKeyReady ||
            !existing ||
            existing.schemaVersion !== 1 ||
            existing.ownerId !== uid ||
            existing.importId !== id ||
            existing.jobToken !== token ||
            existing.reviewHash !== reviewHash ||
            existing.keyId !== job.keyId ||
            typeof existing.keyBase64 !== 'string' ||
            !/^[A-Za-z0-9+/]{43}=$/.test(existing.keyBase64) ||
            Buffer.from(existing.keyBase64, 'base64').length !== 32 ||
            Buffer.from(existing.keyBase64, 'base64').toString('base64') !== existing.keyBase64
          )
            importInconsistent();
          keyBase64 = existing.keyBase64;
        } else {
          if (existing || job.recoveryKeyReady) importInconsistent();
          keyBase64 = proposed;
          tx.create(ref, {
            schemaVersion: 1,
            ownerId: uid,
            importId: id,
            jobToken: token,
            reviewHash,
            keyId: job.keyId,
            keyBase64,
          });
          tx.update(loaded.ref, {
            keyEverCreated: true,
            recoveryKeyReady: true,
            updatedAt: importDate(now, job.updatedAt),
          });
        }
        return {
          schemaVersion: 1,
          ownerId: uid,
          importId: id,
          jobToken: token,
          adventureId: job.adventureId,
          reviewHash,
          keyId: job.keyId,
          algorithm: 'AES-GCM',
          keyBase64,
        };
      });
    },
  };
}
const httpStatuses = {
  'invalid-argument': 400,
  unauthenticated: 401,
  'permission-denied': 403,
  'not-found': 404,
  'failed-precondition': 412,
  'resource-exhausted': 429,
  unavailable: 503,
};

// App Check/Auth verifiers are injected only at composition; no runtime bypass exists.
export function createAdventureImportRecoveryHandler({ service, verifyIdToken, verifyAppCheck }) {
  return async function adventureImportRecoveryHandler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({
          error: {
            code: 'method-not-allowed',
            message: 'Use POST.',
            details: { reason: 'invalid-input' },
          },
        });
      }
      const authorization = req.headers?.authorization,
        appCheck = req.headers?.['x-firebase-appcheck'];
      if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization))
        fail('unauthenticated', 'auth-required');
      if (typeof appCheck !== 'string' || !appCheck) fail('unauthenticated', 'app-check-required');
      let actor;
      try {
        actor = await verifyIdToken(authorization.slice(7));
      } catch {
        fail('unauthenticated', 'auth-required');
      }
      if (!actor?.uid) fail('unauthenticated', 'auth-required');
      try {
        await verifyAppCheck(appCheck);
      } catch {
        fail('unauthenticated', 'app-check-required');
      }
      if (
        typeof req.headers?.['content-type'] !== 'string' ||
        !/^text\/plain\s*;\s*charset=utf-8$/i.test(req.headers['content-type'])
      )
        importInvalid();
      const raw = req.rawBody;
      if (!Buffer.isBuffer(raw) || raw.length > 8192)
        importInvalid(raw?.length > 8192 ? 'payload-too-large' : 'invalid-input');
      let data;
      try {
        data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
      } catch {
        importInvalid();
      }
      const result = await service.getAdventureImportRecoveryKey(actor.uid, data);
      return res.status(200).json({ data: result });
    } catch (error) {
      const known = error instanceof GenerationError && Object.hasOwn(httpStatuses, error.code),
        code = known ? error.code : 'unavailable',
        reason = known
          ? (error.details?.reason ?? 'temporary-unavailable')
          : 'temporary-unavailable';
      return res.status(httpStatuses[code]).json({
        error: {
          code,
          message: 'Não foi possível obter a chave da preparação.',
          details: { reason },
        },
      });
    }
  };
}
