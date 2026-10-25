import {
  readObject,
  readId,
  readHash,
  readCount,
  loreReadFields,
  type LoreReadField,
  type LoreReadCall,
} from './bookLoreReadContracts';
import { loreControlJobId } from './bookLoreControlContracts';
import { freezeLoreEditValue } from './bookLoreWritePlan';

export interface BookLoreEditOutcomeRequest {
  writeId: string;
  bookId: string;
  loreId: string;
  sourceToken: string;
  editId: string;
  startHash: string;
  jobToken?: string;
  outcomeToken?: string;
}
interface Privacy {
  present: boolean;
  value: boolean | null;
}
export interface BookLoreEditOutcome {
  schemaVersion: 1;
  writeId: string;
  bookId: string;
  loreId: string;
  sourceToken: string;
  editId: string;
  startHash: string;
  jobToken: string | null;
  phase: 'initializing' | 'preparing' | 'cancelling' | 'cancelled' | 'adopted';
  applied: boolean;
  changedFields: LoreReadField[];
  relationsChanged: boolean;
  adoption: null | {
    operationId: string;
    timestamp: number;
    localLoreVersion: number;
    publicationPrivacyVersion: number;
    revoked: boolean;
    storageHash: string;
    privacy: { before: Privacy; after: Privacy };
  };
  outcomeToken: string | null;
}
const fail = () => {
  throw Error('Não foi possível conferir o aceite original da edição.');
};
const identityKeys = ['writeId', 'bookId', 'loreId', 'sourceToken', 'editId', 'startHash'];
function request(uid: string, value: unknown): BookLoreEditOutcomeRequest {
  const r = readObject(value, identityKeys, ['jobToken', 'outcomeToken']);
  for (const k of ['writeId', 'bookId', 'loreId', 'editId']) readId(r[k]);
  for (const k of ['sourceToken', 'startHash', 'jobToken', 'outcomeToken'])
    if (Object.hasOwn(r, k)) readHash(r[k]);
  const input = r as unknown as BookLoreEditOutcomeRequest;
  if (input.editId !== loreControlJobId({ uid, ...input }, 'lore-edit')) fail();
  return freezeLoreEditValue(input) as BookLoreEditOutcomeRequest;
}
function privacy(value: unknown): Privacy {
  const p = readObject(value, ['present', 'value']);
  if (
    typeof p.present !== 'boolean' ||
    (p.present ? typeof p.value !== 'boolean' : p.value !== null)
  )
    fail();
  return { present: p.present as boolean, value: p.value as boolean | null };
}
function response(value: unknown, r: BookLoreEditOutcomeRequest): BookLoreEditOutcome | null {
  if (value === null) {
    if (r.jobToken !== undefined || r.outcomeToken !== undefined) fail();
    return null;
  }
  const v = readObject(value, [
    ...identityKeys,
    'schemaVersion',
    'jobToken',
    'phase',
    'applied',
    'changedFields',
    'relationsChanged',
    'adoption',
    'outcomeToken',
  ]);
  for (const k of identityKeys) if (v[k] !== r[k as keyof BookLoreEditOutcomeRequest]) fail();
  if (
    v.schemaVersion !== 1 ||
    typeof v.phase !== 'string' ||
    !['initializing', 'preparing', 'cancelling', 'cancelled', 'adopted'].includes(
      String(v.phase),
    ) ||
    typeof v.applied !== 'boolean' ||
    v.applied !== (v.phase === 'adopted') ||
    typeof v.relationsChanged !== 'boolean' ||
    !Array.isArray(v.changedFields) ||
    v.changedFields.some((f: unknown) => !loreReadFields.some((field) => field === f)) ||
    new Set(v.changedFields).size !== v.changedFields.length
  )
    fail();
  if (v.jobToken === null) {
    if (v.phase !== 'cancelled' || (v.changedFields as unknown[]).length || v.relationsChanged)
      fail();
  } else readHash(v.jobToken);
  if (r.jobToken !== undefined && r.jobToken !== v.jobToken) fail();
  if (v.applied) {
    readHash(v.outcomeToken);
    const a = readObject(v.adoption, [
      'operationId',
      'timestamp',
      'localLoreVersion',
      'publicationPrivacyVersion',
      'revoked',
      'storageHash',
      'privacy',
    ]);
    readId(a.operationId);
    readHash(a.storageHash);
    readCount(a.timestamp);
    if (!Number.isFinite(new Date(a.timestamp as number).getTime())) fail();
    if (readCount(a.localLoreVersion) < 1) fail();
    readCount(a.publicationPrivacyVersion);
    const p = readObject(a.privacy, ['before', 'after']),
      before = privacy(p.before),
      after = privacy(p.after),
      revoked = before.present && before.value === true && !(after.present && after.value === true);
    if (a.revoked !== revoked || (!(v.changedFields as unknown[]).length && !v.relationsChanged))
      fail();
  } else if (v.adoption !== null || v.outcomeToken !== null) fail();
  if (r.outcomeToken !== undefined && r.outcomeToken !== v.outcomeToken) fail();
  return freezeLoreEditValue(v) as BookLoreEditOutcome;
}
/** No ciphertext, replay, production method or automatic retry crosses this port. */
export function createBookLoreEditOutcomeClient(
  uid: string,
  call: LoreReadCall,
  guard: () => void = () => {},
) {
  return async (input: BookLoreEditOutcomeRequest) => {
    guard();
    const r = request(uid, input);
    const result = await call('bookLoreEditOutcome', r);
    guard();
    return response(result, r);
  };
}
