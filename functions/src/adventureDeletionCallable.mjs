import { workFail, workId } from './workProgressContracts.mjs';
export const ADVENTURE_DELETION_METHODS = Object.freeze([
  'getAdventureDeletionSource',
  'startAdventureDeletion',
  'resolveAdventureDeletionStart',
  'getAdventureDeletion',
  'listAdventureDeletions',
  'advanceAdventureDeletion',
]);
export const ADVENTURE_DELETION_CALLABLE_OPTIONS = Object.freeze({
  region: 'us-central1',
  enforceAppCheck: true,
  timeoutSeconds: 120,
  memory: '512MiB',
  maxInstances: 5,
});
/** Only a verified callable context may construct the private deletion service. */
export async function invokeAdventureDeletionCallable(createService, method, request) {
  const uid = request?.auth?.uid;
  if (typeof uid !== 'string' || !uid) workFail('unauthenticated', 'Entre na sua conta.');
  workId(uid);
  if (typeof request?.app?.appId !== 'string' || !request.app.appId.trim())
    workFail(
      'failed-precondition',
      'A verificação do aplicativo é necessária.',
      'app-check-required',
    );
  if (!ADVENTURE_DELETION_METHODS.includes(method) || typeof createService !== 'function')
    workFail('invalid-argument', 'Comando de exclusão indisponível.');
  const service = createService();
  if (!service || !Object.hasOwn(service, method) || typeof service[method] !== 'function')
    workFail('invalid-argument', 'Comando de exclusão indisponível.');
  return service[method](uid, request.data);
}
export function setAdventureDeletionHeaders(method, request) {
  if (!ADVENTURE_DELETION_METHODS.includes(method)) return;
  request?.rawRequest?.res?.setHeader('Cache-Control', 'private, no-store');
  request?.rawRequest?.res?.setHeader('Vary', 'Authorization, X-Firebase-AppCheck');
}
