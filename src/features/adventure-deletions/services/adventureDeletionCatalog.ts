import { fail, nativeId, readPage } from '../model/adventureDeletionContracts';
import {
  adventureDeletionTransport,
  type AdventureDeletionTransport,
} from './adventureDeletionTransport';
export async function listAdventureDeletions(
  scope: { uid: string; check: () => void; transport?: AdventureDeletionTransport },
  input: { cursor?: string; limit?: number } = {},
  visited = new Set<string>(),
) {
  if (!nativeId(scope.uid)) fail('A conta está indisponível.');
  const snapshot = structuredClone(input),
    seen = new Set(visited);
  if (
    !snapshot ||
    typeof snapshot !== 'object' ||
    Array.isArray(snapshot) ||
    Object.keys(snapshot).some((k) => !['cursor', 'limit'].includes(k)) ||
    (snapshot.limit !== undefined &&
      (!Number.isInteger(snapshot.limit) || snapshot.limit < 1 || snapshot.limit > 50)) ||
    (snapshot.cursor !== undefined &&
      (typeof snapshot.cursor !== 'string' || !/^[A-Za-z0-9_-]{1,4096}$/.test(snapshot.cursor)))
  )
    fail('Página de exclusão inválida.');
  if (snapshot.cursor) seen.add(snapshot.cursor);
  scope.check();
  const response = await (scope.transport ?? adventureDeletionTransport).list(snapshot);
  scope.check();
  return readPage(response, scope.uid, snapshot.limit ?? 25, seen);
}
