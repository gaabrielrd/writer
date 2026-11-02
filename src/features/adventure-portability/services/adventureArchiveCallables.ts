import { validId, validHash, validCount } from './adventureInventoryContracts';
import {
  recoveryCheck as check,
  recoveryObject as closed,
  recoveryOwner,
} from './adventureRestoreRecoveryContracts';
import type { AdventureArchiveApi, AdventureArchiveMethod } from './streamAdventureArchive';
const anchor = ['adventureId', 'sourceToken'],
  page = ['cursor', 'limit'],
  unit = ['id', 'itemToken', 'index'];
const fields: Readonly<
  Record<AdventureArchiveMethod, { required: readonly string[]; optional?: readonly string[] }>
> = Object.freeze({
  getAdventureBackupSource: { required: ['adventureId'], optional: ['expectedSourceToken'] },
  listAdventureBackupStructure: { required: [...anchor, 'kind', ...page] },
  readAdventureBackupStructure: { required: [...anchor, 'kind', ...unit] },
  listAdventureBackupResources: { required: [...anchor, 'kind', 'parentId', ...page] },
  readAdventureBackupResource: { required: [...anchor, 'kind', 'parentId', ...unit] },
  listAdventureBackupLore: { required: [...anchor, 'kind', ...page] },
  readAdventureBackupLore: { required: [...anchor, 'kind', ...unit] },
  listAdventureBackupPersonaBindings: { required: [...anchor, 'scope', ...page] },
  readAdventureBackupPersona: { required: [...anchor, 'scope', ...unit] },
  listAdventureBackupHistory: { required: [...anchor, 'kind', 'parentId', 'parentToken', ...page] },
  readAdventureBackupHistory: { required: [...anchor, 'kind', 'parentId', 'parentToken', ...unit] },
  readAdventureBackupHistoryText: {
    required: [...anchor, 'kind', 'parentId', 'parentToken', 'ordinal'],
  },
  listAdventureBackupImageBindings: { required: [...anchor, 'kind', ...page] },
  getAdventureBackupImage: { required: [...anchor, 'kind', 'id', 'bindingToken'] },
  readAdventureBackupImageChunk: {
    required: [...anchor, 'kind', 'id', 'bindingToken', 'imageToken', 'index'],
  },
  verifyAdventureBackupImage: { required: [...anchor, 'kind', 'id', 'bindingToken', 'imageToken'] },
  getAdventureBackupUniverse: { required: anchor, optional: ['expectedUniverseToken'] },
});
export const ADVENTURE_ARCHIVE_METHODS = Object.freeze(Object.keys(fields));
function request(method: AdventureArchiveMethod, input: unknown, adventureId: string) {
  check(ADVENTURE_ARCHIVE_METHODS.includes(method));
  const schema = fields[method];
  check(closed(input, schema.required, schema.optional) && input.adventureId === adventureId);
  const value: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(input)) {
    if (['adventureId', 'id'].includes(key)) check(validId(v));
    else if (key === 'parentId') check(v === null || validId(v));
    else if (key === 'parentToken') check(v === null || validHash(v));
    else if (key === 'cursor')
      check(
        v === null || (typeof v === 'string' && v.length <= 16000 && /^[A-Za-z0-9_-]+$/.test(v)),
      );
    else if (key === 'limit') check(validCount(v) && v >= 1 && v <= 50);
    else if (['index', 'ordinal'].includes(key))
      check(validCount(v) && v < Number.MAX_SAFE_INTEGER);
    else if (key === 'scope') check(v === 'adventure' || v === 'scene');
    else if (key === 'kind')
      check(typeof v === 'string' && v.length <= 80 && /^[a-z][a-z-]*$/.test(v));
    else check(validHash(v));
    value[key] = v;
  }
  return Object.freeze(value);
}
export function createAdventureArchiveApi(
  ownerId: string,
  adventureId: string,
  guard: () => void,
): AdventureArchiveApi {
  check(recoveryOwner(ownerId) && validId(adventureId));
  return {
    async call(method, input) {
      guard();
      const body = request(method, input, adventureId);
      const [{ getFunctions, httpsCallable }, { auth, getFirebaseApp }] = await Promise.all([
        import('@/shared/api/domainCallable'),
        import('@/shared/lib'),
      ]);
      const active = () => {
        guard();
        check(auth.currentUser?.uid === ownerId);
      };
      active();
      const result = await httpsCallable<unknown, unknown>(
        getFunctions(getFirebaseApp(), 'us-central1'),
        method,
        { timeout: 180000 },
      )(body);
      active();
      return result.data;
    },
  };
}
