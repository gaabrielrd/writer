export { updateCampaign } from './campaignManagementCallables';
const queues = new Map<string, Promise<unknown>>();
export function runCampaignManagement<T>(
  uid: string,
  campaignId: string,
  work: () => Promise<T>,
): Promise<T> {
  const key = JSON.stringify([uid, campaignId]),
    previous = queues.get(key);
  const request = (async () => {
    if (previous) await previous.catch(() => undefined);
    return work();
  })();
  queues.set(key, request);
  void request
    .finally(() => {
      if (queues.get(key) === request) queues.delete(key);
    })
    .catch(() => undefined);
  return request;
}
export function definitiveCampaignFailure(cause: unknown) {
  const code =
    typeof cause === 'object' && cause !== null && 'code' in cause
      ? String(cause.code).replace(/^functions\//, '')
      : '';
  return [
    'invalid-argument',
    'failed-precondition',
    'permission-denied',
    'unauthenticated',
    'not-found',
    'already-exists',
    'resource-exhausted',
    'aborted',
  ].includes(code);
}
export function campaignRevisionConflict(cause: unknown) {
  if (!cause || typeof cause !== 'object' || !('details' in cause)) return false;
  const details = cause.details;
  return (
    typeof details === 'object' &&
    details !== null &&
    'reason' in details &&
    details.reason === 'revision-conflict'
  );
}
