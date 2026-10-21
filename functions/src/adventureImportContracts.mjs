import { randomBytes, createHash } from 'node:crypto';
import { GenerationError, validateId } from './generation.mjs';
import { digest } from './sceneContracts.mjs';
import { universeDocumentId } from './universes.mjs';
import { countVisibleWords } from './visibleWordCount.mjs';

export const adventureImportPhases = {
  uploading: 'upload',
  preparing: 'materialize',
  ready: 'ready',
  activated: 'complete',
  deleting: 'cleanup',
  deleted: 'deleted',
};
export const adventureImportMediaTypes = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/markdown',
  'text/plain',
  'text/html',
];
export const adventureImportActions = [
  'startAdventureImport',
  'appendAdventureImportSection',
  'advanceAdventureImport',
  'activateAdventureImport',
  'cancelAdventureImport',
];
export const adventureImportSeed = digest({ version: 1, kind: 'adventure-import-sections' });
export const adventureImportMetadataFields = [
  'schemaVersion',
  'ownerId',
  'importId',
  'adventureId',
  'project.title',
  'project.universeId',
  'source',
  'keyId',
  'recoveryKeyReady',
  'reviewHash',
  'sectionCount',
  'totalBodyBytes',
  'state',
  'checkpoint',
  'uploadedSections',
  'uploadedBodyBytes',
  'uploadedChainHash',
  'preparedSections',
  'wordCount',
  'cleanedSections',
  'createdAt',
  'updatedAt',
];
export function adventureImportFail(code, reason) {
  const error = new GenerationError(
    code,
    'Não foi possível concluir a importação. Confira a preparação antes de tentar novamente.',
  );
  error.details = { reason };
  throw error;
}
export const importInvalid = (reason = 'invalid-input') =>
  adventureImportFail('invalid-argument', reason);
export const importInconsistent = () => adventureImportFail('failed-precondition', 'inconsistent');
export function importClosed(value, keys, optional = []) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key)) ||
    keys.some((key) => !optional.includes(key) && !Object.hasOwn(value, key))
  )
    importInvalid();
  return value;
}
export function importId(value) {
  try {
    return validateId(value);
  } catch {
    importInvalid('invalid-id');
  }
}
export function importHash(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) importInvalid();
  return value;
}
export function importInteger(value, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) importInvalid();
  return value === 0 ? 0 : value;
}
export function importSum(...values) {
  let sum = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(sum + value))
      adventureImportFail('resource-exhausted', 'counter-overflow');
    sum += value;
  }
  return sum;
}
export function importString(value, maximum, required = false) {
  if (
    typeof value !== 'string' ||
    !value.isWellFormed() ||
    value.length > maximum ||
    (required && !value.trim())
  )
    importInvalid();
  return value.trim();
}
export function importUniverseId(value) {
  if (value === null) return null;
  try {
    return universeDocumentId(value);
  } catch {
    importInvalid();
  }
}
export function importProject(value) {
  importClosed(value, ['title', 'synopsis', 'universeId']);
  return {
    title: importString(value.title, 300, true),
    synopsis: importString(value.synopsis, 4000),
    universeId: importUniverseId(value.universeId),
  };
}
export function importSource(value) {
  importClosed(value, ['mediaType', 'sha256', 'byteLength']);
  if (!adventureImportMediaTypes.includes(value.mediaType)) importInvalid();
  return {
    mediaType: value.mediaType,
    sha256: importHash(value.sha256),
    byteLength: importInteger(value.byteLength, 1),
  };
}
export function normalizeAdventureImportStart(value) {
  importClosed(value, [
    'operationId',
    'project',
    'source',
    'sectionCount',
    'totalBodyBytes',
    'reviewHash',
  ]);
  return {
    operationId: importId(value.operationId),
    project: importProject(value.project),
    source: importSource(value.source),
    sectionCount: importInteger(value.sectionCount, 1),
    totalBodyBytes: importInteger(value.totalBodyBytes, 1),
    reviewHash: importHash(value.reviewHash),
  };
}
export function normalizeAdventureImportMutation(value, append = false) {
  importClosed(value, [
    'importId',
    'jobToken',
    'operationId',
    'expectedCheckpoint',
    ...(append ? ['index', 'section'] : []),
  ]);
  const normalized = {
    importId: importId(value.importId),
    jobToken: importHash(value.jobToken),
    operationId: importId(value.operationId),
    expectedCheckpoint: importInteger(value.expectedCheckpoint),
  };
  if (append) {
    normalized.index = importInteger(value.index);
    normalized.section = adventureImportSection(value.section).section;
    if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > 900000)
      importInvalid('payload-too-large');
  }
  return normalized;
}
export function adventureImportSection(value) {
  importClosed(value, ['title', 'content']);
  const title = importString(value.title, 300, true),
    content = value.content;
  if (typeof content !== 'string' || !content.isWellFormed()) importInvalid();
  const bodyBytes = Buffer.byteLength(content, 'utf8');
  if (bodyBytes > 800000) importInvalid('payload-too-large');
  const bodyHash = digest(content),
    body = { content, hash: bodyHash, revision: 1 };
  // JSON bytes plus conservative Firestore path/field/type overhead, well below 1 MiB.
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') + 2048 > 900000)
    importInvalid('payload-too-large');
  return {
    section: { title, content },
    body,
    bodyHash,
    bodyBytes,
    wordCount: countVisibleWords(content),
  };
}
export const adventureImportRequestHash = (action, request) => digest({ action, request });
export function adventureImportIds(uid, importId, index) {
  const common = { version: 1, uid, importId };
  return {
    adventureId: digest({ ...common, kind: 'adventure-import' }),
    ...(index === undefined
      ? {}
      : {
          partId: digest({ ...common, index, kind: 'part' }),
          sceneId: digest({ ...common, index, kind: 'scene' }),
        }),
  };
}
export function adventureImportBorn(snapshot) {
  const stamp = snapshot?.createTime;
  if (
    !Number.isSafeInteger(stamp?.seconds) ||
    stamp.seconds < 0 ||
    !Number.isInteger(stamp.nanoseconds) ||
    stamp.nanoseconds < 0 ||
    stamp.nanoseconds >= 1000000000
  )
    importInconsistent();
  return { seconds: stamp.seconds, nanoseconds: stamp.nanoseconds };
}
export const adventureImportJobToken = (uid, importId, snapshot) =>
  digest({ version: 1, uid, importId, createTime: adventureImportBorn(snapshot) });
export const adventureImportChain = (previous, index, text) =>
  digest({
    version: 1,
    previous,
    index,
    title: text.section.title,
    bodyHash: text.bodyHash,
    bodyBytes: text.bodyBytes,
  });
export const adventureImportReviewHash = (start, sectionsHash) =>
  digest({
    version: 1,
    project: start.project,
    source: start.source,
    sectionCount: start.sectionCount,
    totalBodyBytes: start.totalBodyBytes,
    sectionsHash,
  });
export const adventureImportKeyId = () => randomBytes(32).toString('hex');
export function importDate(now, previous = -1) {
  const date = Math.max(now(), previous + 1);
  if (!Number.isSafeInteger(date) || date < 0 || date > 8640000000000000) importInconsistent();
  return date;
}
export function adventureImportProgress(uid, id, snapshot) {
  const job = snapshot.data();
  try {
    if (
      !job ||
      job.schemaVersion !== 1 ||
      job.ownerId !== uid ||
      job.importId !== id ||
      job.adventureId !== adventureImportIds(uid, id).adventureId ||
      !Object.hasOwn(adventureImportPhases, job.state) ||
      typeof job.recoveryKeyReady !== 'boolean'
    )
      importInconsistent();
    importInteger(job.checkpoint);
    importHash(job.keyId);
    importHash(job.reviewHash);
    importHash(job.uploadedChainHash);
    importSource(job.source);
    if (importString(job.project?.title, 300, true) !== job.project.title) importInconsistent();
    importUniverseId(job.project.universeId);
    for (const field of ['sectionCount', 'totalBodyBytes']) importInteger(job[field], 1);
    for (const field of [
      'uploadedSections',
      'uploadedBodyBytes',
      'preparedSections',
      'wordCount',
      'cleanedSections',
    ])
      importInteger(job[field]);
    for (const field of ['createdAt', 'updatedAt']) {
      importInteger(job[field]);
      if (job[field] > 8640000000000000) importInconsistent();
    }
    if (
      job.updatedAt < job.createdAt ||
      job.uploadedSections > job.sectionCount ||
      job.uploadedBodyBytes > job.totalBodyBytes ||
      job.preparedSections > job.uploadedSections ||
      job.cleanedSections > job.uploadedSections ||
      (['preparing', 'ready', 'activated'].includes(job.state) &&
        (job.uploadedSections !== job.sectionCount ||
          job.uploadedBodyBytes !== job.totalBodyBytes)) ||
      (['ready', 'activated'].includes(job.state) && job.preparedSections !== job.sectionCount) ||
      (['activated', 'deleting', 'deleted'].includes(job.state) && job.recoveryKeyReady) ||
      (job.state === 'deleted' && job.cleanedSections !== job.uploadedSections)
    )
      importInconsistent();
  } catch (error) {
    if (error.code) importInconsistent();
    throw error;
  }
  return {
    schemaVersion: 1,
    ownerId: uid,
    importId: id,
    jobToken: adventureImportJobToken(uid, id, snapshot),
    adventureId: job.adventureId,
    state: job.state,
    phase: adventureImportPhases[job.state],
    checkpoint: job.checkpoint,
    title: job.project.title,
    universeId: job.project.universeId,
    source: job.source,
    keyId: job.keyId,
    recoveryKeyReady: job.recoveryKeyReady,
    reviewHash: job.reviewHash,
    sectionCount: job.sectionCount,
    totalBodyBytes: job.totalBodyBytes,
    uploadedSections: job.uploadedSections,
    uploadedBodyBytes: job.uploadedBodyBytes,
    uploadedChainHash: job.uploadedChainHash,
    preparedSections: job.preparedSections,
    wordCount: job.wordCount,
    cleanedSections: job.cleanedSections,
    cleanupComplete: job.state === 'deleted',
    result: job.state === 'activated' ? { adventureId: job.adventureId, revision: 1 } : null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
export function adventureImportRawSourceHash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
