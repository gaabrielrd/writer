import { GenerationError } from './generation.mjs';
import { restoreFail as fail, invalid } from './adventureRestoreContracts.mjs';

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
export function createAdventureRestoreRecoveryHandler({ service, verifyIdToken, verifyAppCheck }) {
  return async function adventureRestoreRecoveryHandler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Authorization');
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
        invalid();
      const raw = req.rawBody;
      if (!Buffer.isBuffer(raw) || raw.length > 8192)
        invalid(raw?.length > 8192 ? 'payload-too-large' : 'invalid-input');
      let data;
      try {
        data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
      } catch {
        invalid();
      }
      const result = await service.getAdventureRestoreRecoveryKey(actor.uid, data);
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
