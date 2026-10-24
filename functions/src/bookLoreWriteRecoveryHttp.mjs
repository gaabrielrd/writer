import { GenerationError } from './generation.mjs';
const statuses = {
  'invalid-argument': 400,
  unauthenticated: 401,
  'permission-denied': 403,
  'not-found': 404,
  'failed-precondition': 412,
  'resource-exhausted': 429,
  unavailable: 503,
};
const failure = (code) => {
  throw new GenerationError(code, 'Recuperação indisponível.');
};
export function createBookLoreWriteRecoveryHandler({ service, verifyIdToken, verifyAppCheck }) {
  return async function bookLoreWriteRecoveryHandler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Authorization');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res
          .status(405)
          .json({ error: { code: 'method-not-allowed', message: 'Use POST.' } });
      }
      const authorization = req.headers?.authorization,
        appCheck = req.headers?.['x-firebase-appcheck'];
      if (
        typeof authorization !== 'string' ||
        !/^Bearer [^\s]+$/.test(authorization) ||
        typeof appCheck !== 'string' ||
        !appCheck
      )
        failure('unauthenticated');
      let actor;
      try {
        actor = await verifyIdToken(authorization.slice(7));
      } catch {
        failure('unauthenticated');
      }
      if (!actor?.uid) failure('unauthenticated');
      try {
        await verifyAppCheck(appCheck);
      } catch {
        failure('unauthenticated');
      }
      if (
        typeof req.headers?.['content-type'] !== 'string' ||
        !/^text\/plain\s*;\s*charset=utf-8$/i.test(req.headers['content-type'])
      )
        failure('invalid-argument');
      if (!Buffer.isBuffer(req.rawBody) || req.rawBody.length > 8192) failure('invalid-argument');
      let input;
      try {
        input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(req.rawBody));
      } catch {
        failure('invalid-argument');
      }
      return res
        .status(200)
        .json({ data: await service.getBookLoreEditRecoveryKey(actor.uid, input) });
    } catch (error) {
      const code =
        error instanceof GenerationError && Object.hasOwn(statuses, error.code)
          ? error.code
          : 'unavailable';
      return res
        .status(statuses[code])
        .json({ error: { code, message: 'Não foi possível obter a chave da recuperação.' } });
    }
  };
}
