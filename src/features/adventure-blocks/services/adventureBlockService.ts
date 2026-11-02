export * from './adventureBlockCallables';
// A scene-wide queue survives document navigation; an old response cannot overtake a new session.
const queues = new Map<string, Promise<unknown>>();
export function runAdventureBlockOperation<T>(
  uid: string,
  adventureId: string,
  sceneId: string,
  work: () => Promise<T>,
): Promise<T> {
  const key = JSON.stringify([uid, adventureId, sceneId]);
  const previous = queues.get(key);
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
export { getAdventureBlockImage, setAdventureBlockImage } from './adventurePreviewCallables';
