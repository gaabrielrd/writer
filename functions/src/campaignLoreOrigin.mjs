import { digest, workId, workFail } from './workProgressContracts.mjs';
import { validateId } from './generation.mjs';
const bad = () => workFail('failed-precondition', 'A origem do lore está inconsistente.');
export function validLoreOrigin(origin, base) {
  if (!origin || typeof origin !== 'object' || Array.isArray(origin)) bad();
  try {
    if (origin.kind === 'lore') {
      if (Object.keys(origin).length !== 3 || origin.scopeId !== base.universeId) bad();
      workId(origin.scopeId);
      workId(origin.id);
    } else if (origin.kind === 'adventure-lore') {
      if (Object.keys(origin).length !== 3 || origin.adventureId !== base.adventureId) bad();
      validateId(origin.adventureId);
      validateId(origin.id);
    } else bad();
  } catch {
    bad();
  }
  return origin;
}
export function assertLoreItemOrigin(item, base) {
  if (!item || item.kind !== 'lore') bad();
  validLoreOrigin(item.origin, base);
  if (item.sourceKey !== digest(item.origin)) bad();
  return item.origin;
}
export function loreReferenceOrigin(reference, base) {
  if (!reference || typeof reference !== 'object' || typeof reference.entityId !== 'string')
    return null;
  if (reference.kind === 'universe' && reference.scopeId === base.universeId) {
    try {
      workId(reference.scopeId);
      workId(reference.entityId);
    } catch {
      return null;
    }
    return { kind: 'lore', scopeId: reference.scopeId, id: reference.entityId };
  }
  if (reference.kind === 'adventure' && reference.scopeId === base.adventureId) {
    try {
      validateId(reference.scopeId);
      validateId(reference.entityId);
    } catch {
      return null;
    }
    return { kind: 'adventure-lore', adventureId: reference.scopeId, id: reference.entityId };
  }
  return null;
}
export function loreRelationOrigin(value, base) {
  if (typeof value !== 'string') return null;
  const parts = value.split(':');
  if (parts.length !== 3) return null;
  return loreReferenceOrigin({ kind: parts[0], scopeId: parts[1], entityId: parts[2] }, base);
}

export function adventureIdentityToken(uid, adventureId, snapshot) {
  const stamp = snapshot?.createTime;
  if (
    !stamp ||
    !Number.isSafeInteger(stamp.seconds) ||
    stamp.seconds < 0 ||
    !Number.isSafeInteger(stamp.nanoseconds) ||
    stamp.nanoseconds < 0 ||
    stamp.nanoseconds >= 1e9
  )
    bad();
  return digest({
    version: 1,
    uid,
    adventureId,
    createTime: { seconds: stamp.seconds, nanoseconds: stamp.nanoseconds },
  });
}
