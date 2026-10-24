import { readObject, readId, readHash, readCount } from './bookLoreReadContracts';
import { freezeLoreEditValue } from './bookLoreWritePlan';
import { bookLoreWriteHash } from './bookLoreWritePayload';
import { BOOK_LORE_EDIT_ROUTES } from '../../../../functions/src/bookLoreEditTransportMethods.mjs';
export interface LoreJournalIdentity {
  schemaVersion: 1;
  uid: string;
  writeId: string;
  bookId: string;
  loreId: string;
  sourceToken: string;
  intentHash: string;
  requestHash: string;
  jobToken: string;
  keyId: string;
}
export type LoreJournalSection = 'draft' | 'production' | 'checkpoint';
export type LoreJournalLane = 'production' | 'cleanup' | 'diagnostic';
export interface LoreJournalBlob {
  generation: string;
  byteLength: number;
  chunkCount: number;
  written: number;
  complete: boolean;
}
export interface LoreJournalUnit {
  lane: LoreJournalLane;
  method: string;
  requestHash: string;
  id: string;
  startHash: string;
  jobToken: string | null;
  operationId: string | null;
  expectedRevision: number | null;
  state: 'sealing' | 'pending' | 'confirmed';
  blob: LoreJournalBlob | null;
}
export interface LoreJournalCheckpointState {
  active: LoreJournalBlob | null;
  pending: LoreJournalBlob | null;
  garbage: { blob: LoreJournalBlob; next: number } | null;
}
export interface LoreJournalHead {
  schemaVersion: 1;
  identity: LoreJournalIdentity;
  stamp: string;
  cancelRequested: boolean;
  draft: LoreJournalBlob | null;
  production: LoreJournalUnit | null;
  cleanup: LoreJournalUnit | null;
  diagnostic: LoreJournalUnit | null;
  checkpoint: LoreJournalCheckpointState | null;
}
export interface LoreJournalFrame {
  nonce: ArrayBuffer;
  ciphertext: ArrayBuffer;
}
export interface LoreJournalGrant {
  identity: LoreJournalIdentity;
  key: CryptoKey;
}
export interface LoreJournalWire {
  method: string;
  input: Record<string, unknown>;
}
export function journalFail(): never {
  throw Error('A cópia protegida mudou ou está incompleta. Seus dados foram preservados.');
}
export function journalIdentity(value: unknown): LoreJournalIdentity {
  const v = readObject(freezeLoreEditValue(value), [
    'schemaVersion',
    'uid',
    'writeId',
    'bookId',
    'loreId',
    'sourceToken',
    'intentHash',
    'requestHash',
    'jobToken',
    'keyId',
  ]);
  if (v.schemaVersion !== 1) journalFail();
  for (const k of ['uid', 'writeId', 'bookId', 'loreId']) readId(v[k]);
  if ((v.uid as string).length > 128) journalFail();
  for (const k of ['sourceToken', 'intentHash', 'requestHash', 'jobToken', 'keyId']) readHash(v[k]);
  return v as unknown as LoreJournalIdentity;
}
export const sameJournalIdentity = (a: LoreJournalIdentity, b: LoreJournalIdentity) =>
  Object.keys(a).every(
    (k) => a[k as keyof LoreJournalIdentity] === b[k as keyof LoreJournalIdentity],
  );
export function journalBlob(value: unknown, unit = false): LoreJournalBlob {
  const v = readObject(value, ['generation', 'byteLength', 'chunkCount', 'written', 'complete']);
  readId(v.generation);
  const bytes = readCount(v.byteLength),
    count = readCount(v.chunkCount),
    written = readCount(v.written);
  if (
    bytes < 1 ||
    count !== Math.ceil(bytes / 65536) ||
    written > count ||
    typeof v.complete !== 'boolean' ||
    (v.complete && written !== count) ||
    (unit && bytes > 262144)
  )
    journalFail();
  return v as unknown as LoreJournalBlob;
}
function unit(value: unknown, lane: LoreJournalLane): LoreJournalUnit | null {
  if (value === null) return null;
  const v = readObject(value, [
    'lane',
    'method',
    'requestHash',
    'id',
    'startHash',
    'jobToken',
    'operationId',
    'expectedRevision',
    'state',
    'blob',
  ]);
  if (
    v.lane !== lane ||
    typeof v.method !== 'string' ||
    !BOOK_LORE_EDIT_ROUTES.some((r) => r.methods.includes(v.method as string)) ||
    !['sealing', 'pending', 'confirmed'].includes(v.state as string)
  )
    journalFail();
  readId(v.id);
  readHash(v.requestHash);
  readHash(v.startHash);
  if (v.jobToken !== null) readHash(v.jobToken);
  if (v.operationId !== null) readId(v.operationId);
  if (v.expectedRevision !== null) readCount(v.expectedRevision);
  if (lane === 'production') {
    const blob = journalBlob(v.blob, true);
    if ((v.state !== 'sealing') !== blob.complete) journalFail();
  } else if (v.blob !== null || v.state === 'sealing') journalFail();
  return v as unknown as LoreJournalUnit;
}
export function journalHead(value: unknown, uid: string, writeId: string): LoreJournalHead {
  const v = readObject(
      freezeLoreEditValue(value),
      [
        'schemaVersion',
        'identity',
        'stamp',
        'cancelRequested',
        'draft',
        'production',
        'cleanup',
        'diagnostic',
      ],
      ['checkpoint'],
    ),
    identity = journalIdentity(v.identity);
  if (
    v.schemaVersion !== 1 ||
    identity.uid !== uid ||
    identity.writeId !== writeId ||
    typeof v.cancelRequested !== 'boolean'
  )
    journalFail();
  readId(v.stamp);
  if (v.draft !== null) journalBlob(v.draft);
  unit(v.production, 'production');
  unit(v.cleanup, 'cleanup');
  unit(v.diagnostic, 'diagnostic');
  if (v.checkpoint !== undefined && v.checkpoint !== null) {
    const cp = readObject(v.checkpoint, ['active', 'pending', 'garbage']),
      generations = new Set();
    for (const kind of ['active', 'pending'] as const)
      if (cp[kind] !== null) {
        const b = journalBlob(cp[kind]);
        if (b.complete !== (kind === 'active') || generations.has(b.generation)) journalFail();
        generations.add(b.generation);
      }
    if (cp.garbage !== null) {
      const g = readObject(cp.garbage, ['blob', 'next']),
        b = journalBlob(g.blob);
      if (!b.complete || readCount(g.next) > b.chunkCount + 1 || generations.has(b.generation))
        journalFail();
    }
  }
  return freezeLoreEditValue({ ...v, checkpoint: v.checkpoint ?? null }) as LoreJournalHead;
}
const controlKeys = (key: string, method: string) => {
  const get = method.startsWith('get'),
    cancel = method.startsWith('cancel');
  return {
    required: [
      key,
      'startHash',
      ...(!get ? ['operationId'] : []),
      ...(!get && !cancel ? ['jobToken', 'expectedRevision'] : []),
    ],
    optional: get || cancel ? ['jobToken'] : [],
  };
};
export function journalWire(
  value: unknown,
  identity: Pick<LoreJournalIdentity, 'bookId' | 'loreId' | 'sourceToken'>,
) {
  const v = readObject(freezeLoreEditValue(value), ['method', 'input']);
  if (typeof v.method !== 'string') journalFail();
  const method = v.method,
    route = BOOK_LORE_EDIT_ROUTES.find((r) => r.methods.includes(method));
  if (!route) journalFail();
  const start = method.startsWith('start'),
    keys = controlKeys(route.key, method);
  const required = start
    ? route.key === 'inspectionId'
      ? ['bookId', 'loreId', 'inspectionId', 'sourceToken']
      : route.key === 'uploadId'
        ? ['bookId', 'loreId', 'uploadId', 'sourceToken', 'target', 'manifest']
        : ['bookId', 'loreId', 'editId', 'sourceToken', 'inspection', 'fields']
    : keys.required;
  if (method === 'appendBookLoreFieldUpload') required.push('index', 'chunkBase64', 'proof');
  if (method === 'reserveBookLoreEditUpload') required.push('target', 'upload');
  const input = readObject(
    v.input,
    required,
    start && route.key === 'editId' ? ['relations'] : keys.optional,
  );
  if (!new RegExp('^' + route.prefix + '-[a-f0-9]{64}$').test(String(input[route.key])))
    journalFail();
  if (
    start &&
    (input.bookId !== identity.bookId ||
      input.loreId !== identity.loreId ||
      input.sourceToken !== identity.sourceToken)
  )
    journalFail();
  const domain =
    route.key === 'inspectionId'
      ? 'writer-lore-source-inspection'
      : route.key === 'uploadId'
        ? 'writer-lore-field-start'
        : 'writer-lore-edit-start';
  const startHash = start
    ? bookLoreWriteHash({ domain, schemaVersion: 1, intent: input })
    : readHash(input.startHash);
  checkNestedWire(input);
  const lane: LoreJournalLane = method.startsWith('get')
    ? 'diagnostic'
    : method.startsWith('cancel') || method.endsWith('Cleanup')
      ? 'cleanup'
      : 'production';
  const metadata = {
    lane,
    method,
    id: readId(input[route.key]),
    startHash,
    jobToken: input.jobToken === undefined ? null : readHash(input.jobToken),
    operationId: input.operationId === undefined ? null : readId(input.operationId),
    expectedRevision:
      input.expectedRevision === undefined ? null : readCount(input.expectedRevision),
  };
  return {
    wire: { method, input },
    metadata: { ...metadata, requestHash: bookLoreWriteHash(metadata) },
  };
}
export function journalFrame(value: unknown): LoreJournalFrame {
  const v = readObject(value, ['nonce', 'ciphertext']);
  if (
    Object.prototype.toString.call(v.nonce) !== '[object ArrayBuffer]' ||
    Object.prototype.toString.call(v.ciphertext) !== '[object ArrayBuffer]' ||
    (v.nonce as ArrayBuffer).byteLength !== 12 ||
    (v.ciphertext as ArrayBuffer).byteLength < 16 ||
    (v.ciphertext as ArrayBuffer).byteLength > 65552
  )
    journalFail();
  return v as unknown as LoreJournalFrame;
}

function checkNestedWire(input: Record<string, unknown>) {
  const ref = (v: unknown, key: string, prefix: string) => {
    const r = readObject(v, [key, 'startHash', 'jobToken']);
    if (!new RegExp('^' + prefix + '-[a-f0-9]{64}$').test(String(r[key]))) journalFail();
    readHash(r.startHash);
    readHash(r.jobToken);
  };
  if (Object.hasOwn(input, 'inspection')) ref(input.inspection, 'inspectionId', 'lore-source');
  if (Object.hasOwn(input, 'upload')) ref(input.upload, 'uploadId', 'lore-field');
  if (Object.hasOwn(input, 'fields')) {
    const fields = readObject(
      input.fields,
      [],
      ['name', 'category', 'summary', 'details', 'aliases', 'structuredDetails', 'isPublic'],
    );
    for (const v of Object.values(fields)) if (v !== null) ref(v, 'uploadId', 'lore-field');
  }
  if (Object.hasOwn(input, 'target')) {
    const t = readObject(input.target, ['field'], ['page', 'count']);
    if (t.field === 'relations') {
      readCount(t.page);
      const n = readCount(t.count);
      if (n < 1 || n > 64) journalFail();
    } else if (
      ![
        'name',
        'category',
        'summary',
        'details',
        'aliases',
        'structuredDetails',
        'isPublic',
      ].includes(t.field as string) ||
      Object.keys(t).length !== 1
    )
      journalFail();
  }
  if (Object.hasOwn(input, 'manifest')) {
    const m = readObject(input.manifest, [
      'schemaVersion',
      'bodyId',
      'byteLength',
      'chunkCount',
      'contentHash',
      'merkleRoot',
    ]);
    if (
      m.schemaVersion !== 1 ||
      readCount(m.byteLength) < 1 ||
      readCount(m.chunkCount) !== Math.ceil((m.byteLength as number) / 65536)
    )
      journalFail();
    for (const k of ['bodyId', 'contentHash', 'merkleRoot']) readHash(m[k]);
  }
  if (Object.hasOwn(input, 'relations')) {
    const r = readObject(input.relations, ['present', 'count']);
    readCount(r.count);
    if (typeof r.present !== 'boolean' || (!r.present && r.count !== 0)) journalFail();
  }
  if (Object.hasOwn(input, 'index')) readCount(input.index);
  if (Object.hasOwn(input, 'chunkBase64')) {
    if (
      typeof input.chunkBase64 !== 'string' ||
      input.chunkBase64.length > 87384 ||
      input.chunkBase64.length === 0
    )
      journalFail();
    try {
      if (
        btoa(atob(input.chunkBase64)) !== input.chunkBase64 ||
        atob(input.chunkBase64).length > 65536
      )
        journalFail();
    } catch {
      return journalFail();
    }
    if (!Array.isArray(input.proof) || input.proof.length > 64) journalFail();
    input.proof.forEach(readHash);
  }
}
export function metadataJournalWire(unit: LoreJournalUnit): LoreJournalWire {
  if (unit.lane === 'production') return journalFail();
  const route = BOOK_LORE_EDIT_ROUTES.find((r) => r.methods.includes(unit.method));
  if (!route) journalFail();
  return {
    method: unit.method,
    input: {
      [route.key]: unit.id,
      startHash: unit.startHash,
      ...(unit.jobToken ? { jobToken: unit.jobToken } : {}),
      ...(unit.operationId ? { operationId: unit.operationId } : {}),
      ...(unit.expectedRevision !== null ? { expectedRevision: unit.expectedRevision } : {}),
    },
  };
}
