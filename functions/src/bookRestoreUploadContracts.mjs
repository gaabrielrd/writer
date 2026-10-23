import { createHash } from 'node:crypto';
import { GenerationError, validateId } from './generation.mjs';
import { digest } from './sceneContracts.mjs';
import { BOOK_RESOURCE_KINDS } from './bookBackupResources.mjs';
import { BOOK_PERSONA_SCOPES } from './bookBackupPersonas.mjs';
export const BOOK_RESTORE_CHUNK_BYTES = 65536;
export const BOOK_RESTORE_SEED = digest({ version: 1, kind: 'book-restore-upload' });
export const BOOK_RESTORE_METHODS = [
  'startBookRestore',
  'resolveBookRestoreStart',
  'getBookRestore',
  'listBookRestores',
  'appendBookRestoreChunk',
  'advanceBookRestoreIntegrity',
  'advanceBookRestoreValidation',
  'resolveBookRestoreOperation',
  'cancelBookRestore',
  'advanceBookRestoreCleanup',
];
export function restoreFail(code, reason) {
  const error = new GenerationError(
    code,
    'Não foi possível concluir a preparação da cópia do livro.',
  );
  error.details = { reason };
  throw error;
}
export const invalid = (reason = 'invalid-input') => restoreFail('invalid-argument', reason);
export const inconsistent = () => restoreFail('failed-precondition', 'identity-conflict');
export function closed(value, required, optional = []) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    required.some((k) => !Object.hasOwn(value, k)) ||
    Object.keys(value).some((k) => ![...required, ...optional].includes(k))
  )
    invalid();
  return value;
}
export function restoreId(value) {
  try {
    return validateId(value);
  } catch {
    return invalid('invalid-id');
  }
}
export function restoreHash(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) invalid();
  return value;
}
export function integer(value, min = 0) {
  if (!Number.isSafeInteger(value) || value < min) invalid();
  return value === 0 ? 0 : value;
}
export function sum(a, b) {
  integer(a);
  integer(b);
  if (!Number.isSafeInteger(a + b)) restoreFail('resource-exhausted', 'counter-overflow');
  return a + b;
}
export function date(now, previous = -1) {
  const value = Math.max(now(), previous + 1);
  if (!Number.isSafeInteger(value) || value < 0 || !Number.isFinite(new Date(value).getTime()))
    inconsistent();
  return value;
}
export function authorize(uid) {
  if (
    typeof uid !== 'string' ||
    !uid ||
    uid.length > 128 ||
    !uid.isWellFormed() ||
    uid.includes('/') ||
    uid.includes('\\') ||
    ['.', '..'].includes(uid) ||
    [...uid].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    restoreFail('unauthenticated', 'auth-required');
}
export function source(value) {
  closed(value, ['format', 'version', 'byteLength', 'sha256']);
  if (
    value.format === 'writer-book-archive'
      ? value.version !== 1
      : value.format !== 'writer-book-backup' || ![1, 2, 3, 4, 5, 6].includes(value.version)
  )
    invalid('unsupported-source');
  return {
    format: value.format,
    version: value.version,
    byteLength: integer(value.byteLength, 1),
    sha256: restoreHash(value.sha256),
  };
}
export function startInput(value) {
  closed(value, ['operationId', 'source', 'reviewHash']);
  return {
    operationId: restoreId(value.operationId),
    source: source(value.source),
    reviewHash: restoreHash(value.reviewHash),
  };
}
export function mutationInput(value, extra = []) {
  closed(value, ['restoreId', 'jobToken', 'operationId', 'expectedCheckpoint', ...extra]);
  return {
    restoreId: restoreId(value.restoreId),
    jobToken: restoreHash(value.jobToken),
    operationId: restoreId(value.operationId),
    expectedCheckpoint: integer(value.expectedCheckpoint),
  };
}
export function chunkInput(value) {
  const result = mutationInput(value, ['index', 'chunkHash', 'chunkBase64']);
  result.index = integer(value.index);
  result.chunkHash = restoreHash(value.chunkHash);
  return { ...result, bytes: decodeRestoreBytes(value.chunkBase64, result.chunkHash) };
}
export function decodeRestoreBytes(encoded, hash) {
  if (
    typeof encoded !== 'string' ||
    encoded.length > 4 * Math.ceil(BOOK_RESTORE_CHUNK_BYTES / 3) ||
    !encoded ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
  )
    invalid('invalid-chunk');
  const bytes = Buffer.from(encoded, 'base64');
  if (
    bytes.toString('base64') !== encoded ||
    bytes.length > BOOK_RESTORE_CHUNK_BYTES ||
    sha256(bytes) !== hash
  )
    invalid('invalid-chunk');
  return bytes;
}

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function requestHash(action, request) {
  const { bytes, ...metadata } = request;
  void bytes;
  return digest({ schemaVersion: 1, action, request: metadata });
}
export const targetId = (uid, id, fingerprint) =>
  'restore-' + digest({ schemaVersion: 1, uid, restoreId: id, startFingerprint: fingerprint });
export const chunkId = (index) => String(integer(index)).padStart(15, '0');
export function born(snapshot) {
  const value = snapshot?.createTime;
  if (
    !value ||
    !Number.isSafeInteger(value.seconds) ||
    value.seconds < 0 ||
    !Number.isInteger(value.nanoseconds) ||
    value.nanoseconds < 0 ||
    value.nanoseconds >= 1e9
  )
    inconsistent();
  return { seconds: value.seconds, nanoseconds: value.nanoseconds };
}
export const bornEqual = (a, b) => digest(born(a)) === digest(born(b));
export const jobToken = (uid, id, snapshot, fingerprint) =>
  digest({
    schemaVersion: 1,
    uid,
    restoreId: id,
    born: born(snapshot),
    startFingerprint: fingerprint,
  });
export function chunkChain(previous, index, hash, length) {
  return digest({ version: 1, previous, index, hash, byteLength: length });
}
export function jobShape(uid, id, job) {
  if (!job || job.ownerId !== uid || job.restoreId !== id)
    restoreFail('not-found', 'restore-unavailable');
  if (
    job.schemaVersion !== 1 ||
    ![1, 2, 3, 4, 5, 6, 7, 8, 9].includes(job.cleanupVersion) ||
    ![
      'uploading',
      'uploaded',
      'checking',
      'bytes-verified',
      'rejected',
      'validating',
      'content-verified',
      'content-rejected',
      'cancelling',
      'cancelled',
    ].includes(job.state)
  )
    inconsistent();
  source(job.source);
  if (
    requestHash('startBookRestore', {
      operationId: id,
      source: source(job.source),
      reviewHash: job.reviewHash,
    }) !== job.startFingerprint
  )
    inconsistent();
  restoreHash(job.startFingerprint);
  restoreHash(job.reviewHash);
  restoreHash(job.keyId);
  restoreHash(job.uploadedChainHash);
  [
    'checkpoint',
    'uploadedChunks',
    'uploadedBytes',
    'cleanedChunks',
    'createdAt',
    'updatedAt',
  ].forEach((k) => integer(job[k]));
  if (
    job.bookId !== targetId(uid, id, job.startFingerprint) ||
    typeof job.keyEverCreated !== 'boolean' ||
    typeof job.recoveryReady !== 'boolean' ||
    job.cleanedChunks > job.uploadedChunks ||
    job.uploadedBytes > job.source.byteLength ||
    job.uploadedChunks > Math.ceil(job.source.byteLength / BOOK_RESTORE_CHUNK_BYTES)
  )
    inconsistent();
  if (
    job.keyEverCreated
      ? typeof job.keyFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(job.keyFingerprint)
      : job.keyFingerprint !== null || job.recoveryReady
  )
    inconsistent();
  if (['cancelling', 'cancelled'].includes(job.state) && job.recoveryReady) inconsistent();
  if (
    [
      'uploaded',
      'checking',
      'bytes-verified',
      'rejected',
      'validating',
      'content-verified',
      'content-rejected',
    ].includes(job.state) &&
    (job.uploadedBytes !== job.source.byteLength ||
      job.uploadedChunks !== Math.ceil(job.source.byteLength / BOOK_RESTORE_CHUNK_BYTES))
  )
    inconsistent();
  if (
    job.state === 'uploading' &&
    (job.uploadedBytes !== job.uploadedChunks * BOOK_RESTORE_CHUNK_BYTES ||
      job.uploadedBytes >= job.source.byteLength ||
      job.cleanedChunks !== 0)
  )
    inconsistent();
  if (
    !Number.isFinite(new Date(job.createdAt).getTime()) ||
    !Number.isFinite(new Date(job.updatedAt).getTime()) ||
    job.updatedAt < job.createdAt
  )
    inconsistent();
  if (job.cleanupVersion === 1) {
    if (
      ['checking', 'bytes-verified', 'rejected'].includes(job.state) ||
      [
        'integrityVersion',
        'checkedChunks',
        'checkedBytes',
        'checkedChainHash',
        'integrityStateHash',
        'integrityDigest',
        'integrityFailure',
        'cleanupPhase',
      ].some((k) => Object.hasOwn(job, k))
    )
      inconsistent();
  } else {
    if (
      job.integrityVersion !== 1 ||
      ![
        'checkedChunks',
        'checkedBytes',
        'checkedChainHash',
        'integrityStateHash',
        'integrityDigest',
        'integrityFailure',
        'cleanupPhase',
      ].every((k) => Object.hasOwn(job, k))
    )
      inconsistent();
    integer(job.checkedChunks);
    integer(job.checkedBytes);
    restoreHash(job.checkedChainHash);
    if (
      job.checkedChunks < 1 ||
      job.checkedChunks > job.uploadedChunks ||
      job.checkedBytes !==
        (job.checkedChunks === job.uploadedChunks
          ? job.source.byteLength
          : job.checkedChunks * BOOK_RESTORE_CHUNK_BYTES) ||
      ![
        'chunks',
        'proofs',
        'state',
        'done',
        ...(job.cleanupVersion >= 3
          ? [
              'validation-index',
              'validation-items',
              'validation-state',
              ...(job.cleanupVersion >= 4
                ? [
                    'artifacts',
                    ...(job.cleanupVersion >= 5 ? ['body-artifacts'] : []),
                    ...(job.cleanupVersion >= 7 ? ['resource-children'] : []),
                  ]
                : []),
            ]
          : []),
      ].includes(job.cleanupPhase) ||
      ![null, 'file-hash-mismatch', 'upload-chain-mismatch'].includes(job.integrityFailure) ||
      ![
        'checking',
        'bytes-verified',
        'rejected',
        'cancelling',
        'cancelled',
        ...(job.cleanupVersion >= 3 ? ['validating', 'content-verified', 'content-rejected'] : []),
      ].includes(job.state)
    )
      inconsistent();
    if (job.integrityStateHash !== null) restoreHash(job.integrityStateHash);
    if (job.integrityDigest !== null) restoreHash(job.integrityDigest);
    if (
      [
        'checking',
        'bytes-verified',
        'rejected',
        'validating',
        'content-verified',
        'content-rejected',
      ].includes(job.state) &&
      (job.cleanupPhase !== 'chunks' || job.cleanedChunks !== 0)
    )
      inconsistent();
    if (
      job.state === 'checking' &&
      (job.checkedChunks >= job.uploadedChunks ||
        job.integrityStateHash === null ||
        job.integrityDigest !== null ||
        job.integrityFailure !== null)
    )
      inconsistent();
    if (
      ['bytes-verified', 'rejected'].includes(job.state) &&
      (job.checkedChunks !== job.uploadedChunks ||
        job.integrityStateHash !== null ||
        job.integrityDigest === null)
    )
      inconsistent();
    if (
      ['bytes-verified', 'validating', 'content-verified', 'content-rejected'].includes(
        job.state,
      ) &&
      (job.integrityFailure !== null ||
        job.integrityDigest !== job.source.sha256 ||
        job.checkedChainHash !== job.uploadedChainHash)
    )
      inconsistent();
    if (job.state === 'rejected' && job.integrityFailure === null) inconsistent();
    if (
      job.state === 'cancelled' &&
      (job.cleanupPhase !== 'done' || job.integrityStateHash !== null)
    )
      inconsistent();
  }
  if (job.cleanupVersion >= 3) {
    if (
      ![1, 2].includes(job.validationVersion) ||
      (job.validationVersion === 2) !== (job.source.format === 'writer-book-backup') ||
      !Object.hasOwn(job, 'validationStateHash') ||
      !Object.hasOwn(job, 'validationSummary')
    )
      inconsistent();
    restoreId(job.validationBirthOperationId);
    restoreValidationMeta(job.validationMeta, job.validationVersion);
    if (
      !['validating', 'content-verified', 'content-rejected', 'cancelling', 'cancelled'].includes(
        job.state,
      ) ||
      job.validationMeta.checkedChunks > job.checkedChunks
    )
      inconsistent();
    if (job.validationStateHash !== null) restoreHash(job.validationStateHash);
    if (
      job.state === 'validating' &&
      (![
        ...(job.validationVersion === 2
          ? ['legacy-scan', 'legacy-catalog', 'legacy-normalize']
          : ['frames']),
        'semantic',
        'recheck',
      ].includes(job.validationMeta.phase) ||
        job.validationStateHash === null ||
        job.validationSummary !== null)
    )
      inconsistent();
    if (
      job.state === 'content-verified' &&
      (job.validationMeta.phase !== 'done' ||
        job.validationMeta.checkedChunks !== job.checkedChunks ||
        job.validationMeta.reportHash === null ||
        job.validationStateHash === null ||
        !job.validationSummary)
    )
      inconsistent();
    if (
      job.state === 'content-rejected' &&
      (job.validationMeta.phase !== 'rejected' ||
        job.validationMeta.failure === null ||
        job.validationStateHash !== null ||
        job.validationSummary !== null)
    )
      inconsistent();
    if (job.state === 'cancelled' && job.validationStateHash !== null) inconsistent();
    if (job.validationSummary !== null) {
      closed(job.validationSummary, [
        'sourceBookId',
        'totals',
        'warnings',
        ...(job.validationVersion === 2 ? ['source', 'legacyWarnings'] : []),
      ]);
      if (job.validationVersion === 2) restoreLegacyValidationSummary(job.validationSummary, job);
      if (
        typeof job.validationSummary.sourceBookId !== 'string' ||
        !job.validationSummary.sourceBookId ||
        !job.validationSummary.totals ||
        !job.validationSummary.warnings ||
        Buffer.byteLength(JSON.stringify(job.validationSummary)) > 16384
      )
        inconsistent();
    }
  } else if (
    [
      'validationVersion',
      'validationBirthOperationId',
      'validationMeta',
      'validationStateHash',
      'validationSummary',
    ].some((k) => Object.hasOwn(job, k))
  )
    inconsistent();
  if (job.cleanupVersion >= 4) {
    integer(job.validationCheckpoint);
    if (
      job.validationCheckpoint >= job.checkpoint ||
      !['content-verified', 'cancelling', 'cancelled'].includes(job.state)
    )
      inconsistent();
    preparationProgress(job.preparation);
    if (job.cleanupVersion === 9 && job.preparation.phase === 'universe') {
      const p = job.preparation.personas,
        totals = job.validationSummary.totals;
      if (
        p.profileCount !== totals.profiles ||
        BOOK_PERSONA_SCOPES.some((scope) => p.bindings[scope] !== totals.bindings[scope])
      )
        inconsistent();
    }
    if (
      job.preparation.schemaVersion !==
      (job.cleanupVersion === 9
        ? 5
        : job.cleanupVersion === 8
          ? 4
          : job.cleanupVersion === 7
            ? 3
            : job.cleanupVersion === 6
              ? 2
              : 1)
    )
      inconsistent();
    if (
      job.preparation.itemIndex > job.validationMeta.items ||
      (job.preparation.schemaVersion >= 2 &&
        job.preparation.loreItemIndex >= job.validationMeta.items) ||
      job.preparation.cleanedArtifacts > job.preparation.artifactCount ||
      (job.state === 'content-verified' && job.preparation.cleanedArtifacts !== 0) ||
      (job.state === 'cancelled' &&
        job.preparation.cleanedArtifacts !== job.preparation.artifactCount)
    )
      inconsistent();
  } else if (Object.hasOwn(job, 'preparation') || Object.hasOwn(job, 'validationCheckpoint'))
    inconsistent();
  return job;
}
export function preparationProgress(value) {
  closed(value, [
    'schemaVersion',
    'phase',
    'itemIndex',
    'artifactCount',
    'cleanedArtifacts',
    'actCount',
    'chapterCount',
    'wordCount',
    'timestamp',
    ...(value?.schemaVersion >= 2
      ? ['loreCount', 'loreRelationCount', 'relationOffset', 'loreItemIndex']
      : []),
    ...(value?.schemaVersion >= 3 ? ['resourceStartIndex', 'resourceCounts'] : []),
    ...(value?.schemaVersion >= 4 ? ['counts'] : []),
    ...(value?.schemaVersion === 5 ? ['resourceEndIndex', 'personas'] : []),
  ]);
  if (
    ![1, 2, 3, 4, 5].includes(value.schemaVersion) ||
    !(
      value.schemaVersion === 1
        ? ['structure', 'resources']
        : value.schemaVersion === 2
          ? ['resources', 'scenes']
          : value.schemaVersion === 3
            ? ['scenes', 'resource-counts']
            : value.schemaVersion === 4
              ? ['resource-counts', 'personas']
              : ['personas', 'universe']
    ).includes(value.phase)
  )
    inconsistent();
  if (value.schemaVersion >= 2) {
    for (const key of ['loreCount', 'loreRelationCount', 'relationOffset', 'loreItemIndex'])
      integer(value[key]);
    if (
      (value.schemaVersion === 2 && value.loreItemIndex < value.itemIndex) ||
      value.relationOffset > value.loreRelationCount ||
      (['scenes', 'resource-counts', 'personas', 'universe'].includes(value.phase) &&
        value.relationOffset !== 0)
    )
      inconsistent();
  }
  for (const key of [
    'itemIndex',
    'artifactCount',
    'cleanedArtifacts',
    'actCount',
    'chapterCount',
    'wordCount',
    'timestamp',
  ])
    integer(value[key]);
  if (!Number.isFinite(new Date(value.timestamp).getTime())) inconsistent();
  if (value.schemaVersion >= 3) {
    integer(value.resourceStartIndex);
    const end = value.schemaVersion >= 5 ? integer(value.resourceEndIndex) : value.itemIndex;
    closed(value.resourceCounts, BOOK_RESOURCE_KINDS);
    let total = 0;
    for (const kind of BOOK_RESOURCE_KINDS) total = sum(total, value.resourceCounts[kind]);
    if (
      value.resourceStartIndex > end ||
      end > value.itemIndex ||
      value.resourceStartIndex > value.loreItemIndex ||
      value.resourceCounts.lore > value.loreCount ||
      (value.phase === 'scenes'
        ? value.itemIndex > value.loreItemIndex
        : end !== value.loreItemIndex + 1) ||
      total !== end - value.resourceStartIndex - (value.phase === 'scenes' ? 0 : 1)
    )
      inconsistent();
  }
  if (value.schemaVersion >= 4) {
    const c = value.counts,
      end = value.schemaVersion >= 5 ? value.resourceEndIndex : value.itemIndex;
    closed(c, [
      'schemaVersion',
      'step',
      'itemIndex',
      'sceneCount',
      'linkCount',
      'linkId',
      'linkCursor',
    ]);
    if (c.schemaVersion !== 1 || !['scenes', 'links', 'finish', 'done'].includes(c.step))
      inconsistent();
    for (const key of ['itemIndex', 'sceneCount', 'linkCount']) integer(c[key]);
    if (c.linkId !== null) restoreHash(c.linkId);
    if (c.linkCursor !== null) restoreHash(c.linkCursor);
    if (
      (c.linkCount === 0
        ? c.linkId !== null || c.linkCursor !== null
        : c.linkId === null || c.linkCursor !== digest(['narrative-link', c.linkId])) ||
      c.itemIndex < value.resourceStartIndex ||
      c.itemIndex > end ||
      c.sceneCount > value.resourceCounts.scene ||
      c.linkCount > value.resourceCounts['narrative-link'] ||
      (c.step === 'scenes'
        ? c.itemIndex > value.loreItemIndex || c.linkCount !== 0
        : c.itemIndex !== end || c.sceneCount !== value.resourceCounts.scene) ||
      (value.schemaVersion >= 5
        ? c.step !== 'done'
        : (value.phase === 'personas') !== (c.step === 'done'))
    )
      inconsistent();
  }
  if (value.schemaVersion === 5) {
    const p = value.personas;
    closed(p, ['schemaVersion', 'profileCount', 'bindings']);
    if (p.schemaVersion !== 1) inconsistent();
    integer(p.profileCount);
    closed(p.bindings, BOOK_PERSONA_SCOPES);
    let total = 0;
    for (const scope of BOOK_PERSONA_SCOPES) total = sum(total, p.bindings[scope]);
    if (
      p.profileCount > total ||
      p.bindings.book > 1 ||
      p.bindings.chapter > value.chapterCount ||
      p.bindings['scene-source'] > value.resourceCounts['scene-source']
    )
      inconsistent();
  }
  return structuredClone(value);
}
export function restoreValidationMeta(value, version = 1) {
  closed(value, ['phase', 'frames', 'items', 'checkedChunks', 'failure', 'reportHash']);
  if (
    ![1, 2].includes(version) ||
    ![
      ...(version === 2 ? ['legacy-scan', 'legacy-catalog', 'legacy-normalize'] : ['frames']),
      'semantic',
      'recheck',
      'done',
      'rejected',
    ].includes(value.phase)
  )
    inconsistent();
  for (const key of ['frames', 'items', 'checkedChunks']) integer(value[key]);
  if (
    ![
      null,
      'invalid-format',
      'unsupported-version',
      'invalid-record',
      'limit-exceeded',
      'integrity-mismatch',
      'incomplete-archive',
    ].includes(value.failure)
  )
    inconsistent();
  if (value.reportHash !== null) restoreHash(value.reportHash);
  if (
    value.phase === 'done'
      ? value.failure !== null || value.reportHash === null
      : value.reportHash !== null
  )
    inconsistent();
  if (value.phase === 'rejected' ? value.failure === null : value.failure !== null) inconsistent();
  return value;
}
export const validationProgress = (job) =>
  job.cleanupVersion >= 3 ? { ...job.validationMeta, summary: job.validationSummary } : null;
export const integrityProgress = (job) => ({
  checkedChunks: job.checkedChunks ?? 0,
  checkedBytes: job.checkedBytes ?? 0,
  failure: job.integrityFailure ?? null,
  cleanupPhase: job.cleanupPhase ?? 'chunks',
});

export function progress(uid, id, snapshot) {
  const job = jobShape(uid, id, snapshot.data());
  return {
    schemaVersion: 1,
    ownerId: uid,
    restoreId: id,
    bookId: job.bookId,
    jobToken: jobToken(uid, id, snapshot, job.startFingerprint),
    source: { ...job.source },
    reviewHash: job.reviewHash,
    keyId: job.keyId,
    recoveryReady: job.recoveryReady,
    state: job.state,
    checkpoint: job.checkpoint,
    uploadedChunks: job.uploadedChunks,
    uploadedBytes: job.uploadedBytes,
    cleanedChunks: job.cleanedChunks,
    integrity: integrityProgress(job),
    validation: validationProgress(job),
    ...(job.cleanupVersion >= 4 ? { preparation: preparationProgress(job.preparation) } : {}),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function restoreLegacyValidationSummary(summary, job) {
  const value = summary.source;
  closed(value, [
    'format',
    'version',
    'size',
    'fingerprint',
    'bookId',
    'universeCandidate',
    'availability',
    'ignoredGlobalEntries',
    'publicationDiscarded',
  ]);
  if (
    value.format !== 'writer-book-backup' ||
    value.version !== job.source.version ||
    value.size !== job.source.byteLength ||
    value.fingerprint !== job.source.sha256 ||
    value.bookId !== summary.sourceBookId ||
    typeof value.publicationDiscarded !== 'boolean'
  )
    inconsistent();
  integer(value.ignoredGlobalEntries);
  if (value.universeCandidate !== null) {
    closed(value.universeCandidate, ['id', 'incarnation']);
    if (
      typeof value.universeCandidate.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(value.universeCandidate.id) ||
      value.universeCandidate.incarnation !== 'not-recorded'
    )
      inconsistent();
  }
  closed(value.availability, ['history', 'progress', 'draft', 'cover', 'inactiveRanks']);
  if (
    value.availability.history !== 'not-recorded' ||
    value.availability.progress !== 'not-recorded' ||
    value.availability.draft !== 'not-separable' ||
    !['not-recorded', 'url-only', 'none-declared'].includes(value.availability.cover) ||
    !['not-recorded', 'not-applicable'].includes(value.availability.inactiveRanks)
  )
    inconsistent();
  closed(summary.legacyWarnings, [
    'resolvedLabelsIgnored',
    'unusedProfiles',
    'renderedAssemblies',
    'derivedRankBuffers',
  ]);
  Object.values(summary.legacyWarnings).forEach((v) => integer(v));
}
