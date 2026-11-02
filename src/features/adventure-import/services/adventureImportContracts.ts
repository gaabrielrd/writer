import { countWords } from '@/shared/lib/countWords';
import { sanitizeRichText } from '@/shared/lib/sanitizeRichText';
import type { ParsedSection } from '@/features/document-import';
import type {
  ConfirmedReview,
  ImportProgress,
  ImportSource,
  ImportSection,
  ImportProject,
  ImportIdentity,
  ImportStartResult,
  ImportAction,
  StartImportInput,
  ImportRecoveryKey,
  ImportReceipt,
  SourceMediaType,
} from '../model/adventureImport';
export const IMPORT_BODY_LIMIT = 800_000;
export const IMPORT_ENVELOPE_LIMIT = 900_000;
export const bytes = (s: string) => new TextEncoder().encode(s).byteLength;
export const canonicalImport = (v: unknown): string =>
  JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : x,
  );
export function importCheck(condition: unknown): asserts condition {
  if (!condition)
    throw new Error(
      'O contrato da importação não pôde ser confirmado. Seus dados foram preservados.',
    );
}
export function importObject(v: unknown, keys: string[]): asserts v is Record<string, unknown> {
  importCheck(
    !!v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      Object.keys(v).length === keys.length &&
      keys.every((k) => Object.hasOwn(v, k)),
  );
}
export function importText(v: unknown): asserts v is string {
  importCheck(typeof v === 'string');
  for (let i = 0; i < v.length; i++) {
    const n = v.charCodeAt(i);
    if (n >= 0xd800 && n <= 0xdbff) {
      const next = v.charCodeAt(++i);
      importCheck(next >= 0xdc00 && next <= 0xdfff);
    } else importCheck(n < 0xdc00 || n > 0xdfff);
  }
}
export const isImportHash = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export const isImportId = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(v);
export const isImportInteger = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export const importActions: ImportAction[] = [
  'startAdventureImport',
  'appendAdventureImportSection',
  'advanceAdventureImport',
  'activateAdventureImport',
  'cancelAdventureImport',
];
export function normalizeImportProject(v: ImportProject): ImportProject {
  importObject(v, ['title', 'synopsis', 'universeId']);
  importText(v.title);
  importText(v.synopsis);
  importCheck(
    v.title.length <= 300 &&
      v.synopsis.length <= 4000 &&
      v.title.trim() &&
      (v.universeId === null ||
        (typeof v.universeId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(v.universeId))),
  );
  return { ...v, title: v.title.trim(), synopsis: v.synopsis.trim() };
}
const media: SourceMediaType[] = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/markdown',
  'text/plain',
  'text/html',
];
export function validateImportSource(v: ImportSource): void {
  importObject(v, ['mediaType', 'sha256', 'byteLength']);
  importCheck(
    media.includes(v.mediaType) &&
      isImportHash(v.sha256) &&
      isImportInteger(v.byteLength) &&
      v.byteLength > 0,
  );
}
export function normalizeImportSection(v: ImportSection): ImportSection {
  importObject(v, ['title', 'content']);
  importText(v.title);
  importText(v.content);
  importCheck(v.title.length <= 300 && v.title.trim());
  if (bytes(v.content) > IMPORT_BODY_LIMIT)
    throw new Error('Esta seção excede 800.000 bytes. Divida o conteúdo antes de confirmar.');
  const section = { title: v.title.trim(), content: v.content };
  const worst = {
    importId: 'i'.repeat(80),
    jobToken: 'a'.repeat(64),
    operationId: 'o'.repeat(80),
    expectedCheckpoint: Number.MAX_SAFE_INTEGER,
    index: Number.MAX_SAFE_INTEGER,
    section,
  };
  if (
    bytes(canonicalImport(worst)) > IMPORT_ENVELOPE_LIMIT ||
    bytes(canonicalImport({ content: section.content, hash: 'a'.repeat(64), revision: 1 })) + 2048 >
      IMPORT_ENVELOPE_LIMIT
  )
    throw new Error('Esta seção excede o envelope de 900.000 bytes. Divida antes de confirmar.');
  return section;
}
export function checkedImportSum(a: number, b: number): number {
  const n = a + b;
  importCheck(isImportInteger(a) && isImportInteger(b) && isImportInteger(n));
  return n;
}
export async function importDigestText(s: string): Promise<string> {
  importText(s);
  const result = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(result), (b) => b.toString(16).padStart(2, '0')).join('');
}
export const importDigest = (v: unknown) => importDigestText(canonicalImport(v));
export function normalizeConfirmedReview(v: ConfirmedReview): ConfirmedReview {
  importObject(v, ['schemaVersion', 'project', 'source', 'sections']);
  importCheck(v.schemaVersion === 1 && Array.isArray(v.sections) && v.sections.length > 0);
  validateImportSource(v.source);
  const sections = v.sections.map(normalizeImportSection);
  importCheck(sections.reduce((n, s) => checkedImportSum(n, countWords(s.content)), 0) > 0);
  return {
    schemaVersion: 1,
    project: normalizeImportProject(v.project),
    source: { ...v.source },
    sections,
  };
}
export async function describeConfirmedReview(
  value: ConfirmedReview,
  operationId: string,
): Promise<{ review: ConfirmedReview; start: StartImportInput; fingerprint: string }> {
  importCheck(isImportId(operationId));
  const review = normalizeConfirmedReview(value);
  let previous = await importDigest({ version: 1, kind: 'adventure-import-sections' }),
    totalBodyBytes = 0;
  for (let index = 0; index < review.sections.length; index++) {
    const s = review.sections[index]!,
      bodyBytes = bytes(s.content),
      bodyHash = await importDigestText(s.content);
    totalBodyBytes = checkedImportSum(totalBodyBytes, bodyBytes);
    previous = await importDigest({
      version: 1,
      previous,
      index,
      title: s.title,
      bodyHash,
      bodyBytes,
    });
  }
  const reviewHash = await importDigest({
    version: 1,
    project: review.project,
    source: review.source,
    sectionCount: review.sections.length,
    totalBodyBytes,
    sectionsHash: previous,
  });
  const start = {
    operationId,
    project: review.project,
    source: review.source,
    sectionCount: review.sections.length,
    totalBodyBytes,
    reviewHash,
  };
  return {
    review,
    start,
    fingerprint: await importDigest({ action: 'startAdventureImport', request: start }),
  };
}
export async function sourceFromFile(file: File): Promise<ImportSource> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const mediaType: SourceMediaType =
    extension === 'pdf'
      ? 'application/pdf'
      : extension === 'docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : ['md', 'markdown'].includes(extension ?? '')
          ? 'text/markdown'
          : ['html', 'htm'].includes(extension ?? '')
            ? 'text/html'
            : 'text/plain';
  const raw = await file.arrayBuffer();
  return {
    mediaType,
    sha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', raw)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join(''),
    byteLength: raw.byteLength,
  };
}
/** Adventure-only safe review. The book parser and writer retain their legacy contract. */
export function prepareAdventureImportSections(sections: ParsedSection[]): ParsedSection[] {
  return sections.map((s) => {
    const content = sanitizeRichText(s.content),
      template = document.createElement('template');
    template.innerHTML = content;
    const derived = Array.from(template.content.childNodes).map((node) => {
      const holder = document.createElement('div');
      holder.appendChild(node.cloneNode(true));
      return { html: holder.innerHTML, text: node.textContent ?? '' };
    });
    const original = s.blocks?.map((b) => ({ ...b, html: sanitizeRichText(b.html) }));
    const blocks = original?.map((b) => b.html).join('') === content ? original : derived;
    importCheck(blocks?.map((b) => b.html).join('') === content);
    return { ...s, content, wordCount: countWords(content), blocks };
  });
}

function identity(v: ImportIdentity, uid: string) {
  importCheck(
    v.schemaVersion === 1 &&
      v.ownerId === uid &&
      isImportId(v.importId) &&
      isImportHash(v.jobToken) &&
      isImportHash(v.adventureId),
  );
}
const phases = {
  uploading: 'upload',
  preparing: 'materialize',
  ready: 'ready',
  activated: 'complete',
  deleting: 'cleanup',
  deleted: 'deleted',
} as const;
export function validateImportProgress(value: unknown, uid: string): ImportProgress {
  const v = value as ImportProgress;
  importObject(v, [
    'schemaVersion',
    'ownerId',
    'importId',
    'jobToken',
    'adventureId',
    'state',
    'phase',
    'checkpoint',
    'title',
    'universeId',
    'source',
    'keyId',
    'recoveryKeyReady',
    'reviewHash',
    'sectionCount',
    'totalBodyBytes',
    'uploadedSections',
    'uploadedBodyBytes',
    'uploadedChainHash',
    'preparedSections',
    'wordCount',
    'cleanedSections',
    'cleanupComplete',
    'result',
    'createdAt',
    'updatedAt',
  ]);
  identity(v, uid);
  importCheck(Object.hasOwn(phases, v.state) && phases[v.state] === v.phase);
  importText(v.title);
  importCheck(
    v.title.length > 0 &&
      v.title.length <= 300 &&
      (v.universeId === null || typeof v.universeId === 'string'),
  );
  validateImportSource(v.source);
  importCheck(
    [v.keyId, v.reviewHash, v.uploadedChainHash].every(isImportHash) &&
      [
        v.checkpoint,
        v.sectionCount,
        v.totalBodyBytes,
        v.uploadedSections,
        v.uploadedBodyBytes,
        v.preparedSections,
        v.wordCount,
        v.cleanedSections,
        v.createdAt,
        v.updatedAt,
      ].every(isImportInteger) &&
      v.sectionCount > 0 &&
      v.totalBodyBytes > 0 &&
      v.updatedAt >= v.createdAt &&
      v.updatedAt <= 8640000000000000 &&
      v.uploadedSections <= v.sectionCount &&
      v.preparedSections <= v.uploadedSections &&
      v.cleanedSections <= v.uploadedSections &&
      v.uploadedBodyBytes <= v.totalBodyBytes &&
      typeof v.recoveryKeyReady === 'boolean' &&
      typeof v.cleanupComplete === 'boolean' &&
      v.cleanupComplete === (v.state === 'deleted'),
  );
  if (['ready', 'activated'].includes(v.state))
    importCheck(
      v.uploadedSections === v.sectionCount &&
        v.preparedSections === v.sectionCount &&
        v.uploadedBodyBytes === v.totalBodyBytes,
    );
  if (v.state === 'activated') {
    importObject(v.result, ['adventureId', 'revision']);
    importCheck(v.result.adventureId === v.adventureId && v.result.revision === 1);
  } else importCheck(v.result === null);
  if (['activated', 'deleted', 'deleting'].includes(v.state)) importCheck(!v.recoveryKeyReady);
  return v;
}
export function validateImportOutcome(
  value: unknown,
  uid: string,
  action: ImportAction,
  operationId: string,
  importId: string,
): ImportStartResult {
  const v = value as ImportStartResult;
  if (v?.kind === 'canceled') {
    importObject(v, ['schemaVersion', 'ownerId', 'importId', 'adventureId', 'kind']);
    importCheck(
      action === 'startAdventureImport' &&
        v.schemaVersion === 1 &&
        v.ownerId === uid &&
        v.importId === importId &&
        isImportHash(v.adventureId),
    );
    return v;
  }
  importObject(v, ['kind', 'receipt', 'progress']);
  importCheck(v.kind === 'confirmed');
  const c = v;
  validateImportProgress(c.progress, uid);
  importCheck(c.progress.importId === importId);
  const r = c.receipt;
  importObject(r, [
    'operationId',
    'action',
    'expectedCheckpoint',
    'checkpoint',
    'state',
    'phase',
    'index',
  ]);
  importCheck(
    r.operationId === operationId &&
      r.action === action &&
      isImportInteger(r.checkpoint) &&
      r.checkpoint <= c.progress.checkpoint &&
      Object.hasOwn(phases, r.state) &&
      phases[r.state] === r.phase &&
      (r.index === null || isImportInteger(r.index)),
  );
  if (action === 'startAdventureImport')
    importCheck(r.expectedCheckpoint === null && r.checkpoint === 0 && r.index === null);
  else
    importCheck(isImportInteger(r.expectedCheckpoint) && r.checkpoint === r.expectedCheckpoint + 1);
  return c;
}
export function validateImportReceiptRequest(
  receipt: ImportReceipt,
  expectedCheckpoint: number,
  index: number | null,
): void {
  importCheck(receipt.expectedCheckpoint === expectedCheckpoint && receipt.index === index);
}
export function validateImportKey(
  value: unknown,
  uid: string,
  input: { importId: string; jobToken: string; reviewHash: string; expectedKeyId?: string },
): ImportRecoveryKey {
  const v = value as ImportRecoveryKey;
  importObject(v, [
    'schemaVersion',
    'ownerId',
    'importId',
    'jobToken',
    'adventureId',
    'reviewHash',
    'keyId',
    'algorithm',
    'keyBase64',
  ]);
  identity(v, uid);
  importCheck(
    v.importId === input.importId &&
      v.jobToken === input.jobToken &&
      v.reviewHash === input.reviewHash &&
      isImportHash(v.keyId) &&
      (!input.expectedKeyId || v.keyId === input.expectedKeyId) &&
      v.algorithm === 'AES-GCM' &&
      typeof v.keyBase64 === 'string' &&
      /^[A-Za-z0-9+/]{43}=$/.test(v.keyBase64),
  );
  const raw = atob(v.keyBase64);
  importCheck(raw.length === 32 && btoa(raw) === v.keyBase64);
  return v;
}
