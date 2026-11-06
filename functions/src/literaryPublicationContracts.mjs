import { writeLiteraryBackupProcess } from './literaryBackupFence.mjs';
import {
  workScope,
  workProject,
  workId,
  workFail,
  digest,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import { literaryNativeBirth } from './literarySourceOrigins.mjs';
import { readLiteraryIntegrationFence } from './literaryIntegrationSources.mjs';
export const LITERARY_PUBLICATION_COLLECTIONS = Object.freeze([
  'literaryPublications',
  'literaryPublicationCandidates',
  'literaryPublicationChapters',
  'literaryPublicationUnits',
  'literaryPublicationBodies',
  'literaryPublicationRemovals',
  'literaryPublicationGuideDependencies',
  'literaryPublicationGuide',
  'literaryPublicationGuideVersions',
  'literaryPublicationGuideProofs',
  'literaryPublicationConfirmations',
]);
export function literaryPublicationScope(db, uid, data, keys) {
  const c = workScope(db, uid, data, keys);
  if (c.target.kind !== 'book') workFail('invalid-argument', 'A publicação exige um livro.');
  return c;
}
export const literaryPublicationRef = (c, kind, id) =>
  c.db.doc(c.path + '/' + kind + '/' + workId(id));
export const literaryPublicationEntryId = (jobId, key) =>
  digest({ domain: 'literary-publication-entry-v1', jobId, key });
export const literaryPublicationEntry = (c, kind, jobId, key) =>
  literaryPublicationRef(c, 'literaryPublication' + kind, literaryPublicationEntryId(jobId, key));
export const literaryPublicRevision = (c, jobId) =>
  c.db.doc('publicBooks/' + c.target.id + '/revisions/' + workId(jobId));
export function publicationStamp(row) {
  const changed = row.updateTime;
  if (!Number.isSafeInteger(changed?.seconds) || !Number.isSafeInteger(changed?.nanoseconds))
    workFail('failed-precondition', 'Versão nativa da publicação indisponível.');
  return { birth: literaryNativeBirth(row), changed: [changed.seconds, changed.nanoseconds] };
}
export function publicationText(value, max) {
  if (
    typeof value !== 'string' ||
    !value.isWellFormed() ||
    !value.trim() ||
    value.trim().length > max
  )
    workFail('invalid-argument', 'Confira os campos de publicação.');
  return value.trim();
}
export const publicationHash = (value) => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    workFail('invalid-argument', 'Confira a versão aprovada.');
  return value;
};
export async function readLiteraryPublicationBook(tx, c) {
  const root = await workProject(tx, c),
    book = await readWorkMetadata(tx, c.ref, []);
  return {
    root,
    bookToken: digest({
      domain: 'literary-publication-book-v1',
      uid: c.uid,
      target: c.target,
      birth: literaryNativeBirth(book),
    }),
  };
}
export async function readLiteraryPublicationSource(tx, c) {
  const fence = await readLiteraryIntegrationFence(tx, c),
    book = await readWorkMetadata(tx, c.ref, []),
    pointer = await tx.get(c.db.doc('publicBooks/' + c.target.id)),
    p = pointer.data();
  if (!['draft', 'published'].includes(fence.root.status ?? 'draft'))
    workFail('failed-precondition', 'O livro não pode ser publicado neste estado.');
  let previous = null;
  if (pointer.exists) {
    if (typeof p.revisionId !== 'string')
      workFail('failed-precondition', 'A edição pública atual está inconsistente.');
    const header = (
      await readWorkMetadata(tx, literaryPublicRevision(c, workId(p.revisionId)), ['chapterCount'])
    ).data();
    if (!header || !Number.isSafeInteger(header.chapterCount) || header.chapterCount < 0)
      workFail('failed-precondition', 'A edição pública atual precisa ser conferida.');
    previous = { revisionId: p.revisionId, chapterCount: header.chapterCount };
  }
  const privacyVersion = fence.root.publicationPrivacyVersion ?? 0;
  if (!Number.isSafeInteger(privacyVersion) || privacyVersion < 0)
    workFail('failed-precondition', 'Privacidade de publicação inválida.');
  const bookToken = digest({
      domain: 'literary-publication-book-v1',
      uid: c.uid,
      target: c.target,
      birth: literaryNativeBirth(book),
    }),
    publicPointer = pointer.exists ? digest({ stamp: publicationStamp(pointer), value: p }) : null;
  return {
    root: fence.root,
    bookToken,
    manuscriptFence: fence.token,
    previous,
    publicPointer,
    privacyVersion,
    token: digest({
      domain: 'literary-publication-source-v1',
      bookToken,
      manuscriptFence: fence.token,
      publicPointer,
      privacyVersion,
      title: fence.root.title ?? null,
      status: fence.root.status ?? 'draft',
    }),
  };
}
export async function readLiteraryPublicationIntegration(tx, c, id) {
  await workProject(tx, c);
  const row = await readWorkMetadata(
      tx,
      c.db.doc(c.path + '/literaryIntegrationJobs/' + workId(id)),
      [
        'jobId',
        'level',
        'actId',
        'state',
        'sourceFence',
        'authorAccepted',
        'blocking',
        'dismissedBlocking',
        'finalRequestId',
        'completedAt',
        'units',
        'verifiedUnits',
        'analyses',
        'verifiedAnalyses',
        'mainUnits',
        'mainReadUnits',
      ],
    ),
    value = row.data();
  if (
    !value ||
    value.jobId !== id ||
    value.state !== 'done' ||
    value.authorAccepted !== true ||
    !value.finalRequestId ||
    !Number.isSafeInteger(value.blocking) ||
    value.blocking > (value.dismissedBlocking ?? 0) ||
    !Number.isSafeInteger(value.units) ||
    value.units < 1 ||
    value.verifiedUnits !== value.units ||
    !Number.isSafeInteger(value.analyses) ||
    value.analyses < 1 ||
    value.verifiedAnalyses !== value.analyses ||
    !Number.isSafeInteger(value.mainUnits) ||
    value.mainUnits < 1 ||
    value.mainReadUnits !== value.mainUnits
  )
    workFail(
      'failed-precondition',
      'Escolha uma integração concluída e aceita, sem bloqueios pendentes.',
    );
  return {
    id,
    level: value.level,
    actId: value.actId ?? null,
    sourceFence: value.sourceFence,
    token: digest({
      domain: 'literary-publication-integration-v1',
      stamp: publicationStamp(row),
      value,
    }),
  };
}
export async function assertLiteraryPublicationUnitCoverage(tx, c, accepted, unit, opened) {
  const jobId = accepted.id,
    linkId = digest({ jobId, kind: unit.resource.kind, id: unit.resource.id }),
    link = (
      await readWorkMetadata(tx, c.db.doc(c.path + '/literaryIntegrationUnitLinks/' + linkId), [
        'jobId',
        'resource',
        'unitIndex',
        'chapterId',
        'role',
      ])
    ).data();
  if (
    !link ||
    link.jobId !== jobId ||
    link.chapterId !== unit.chapterId ||
    digest(link.resource) !== digest(unit.resource) ||
    !Number.isSafeInteger(link.unitIndex) ||
    link.unitIndex < 0
  )
    workFail('failed-precondition', 'Uma fonte não pertence à integração aprovada.');
  const record = (
    await readWorkMetadata(
      tx,
      c.db.doc(c.path + '/literaryIntegrationUnits/' + digest({ jobId, index: link.unitIndex })),
      ['jobId', 'index', 'resource', 'chapterId', 'chapterToken', 'token', 'coverage'],
    )
  ).data();
  if (
    !record ||
    record.jobId !== jobId ||
    record.index !== link.unitIndex ||
    record.chapterId !== unit.chapterId ||
    digest(record.resource) !== digest(unit.resource) ||
    record.chapterToken !== unit.chapterToken ||
    record.token !== unit.token ||
    record.coverage?.complete !== true ||
    record.coverage.sourceToken !== opened.token
  )
    workFail(
      'failed-precondition',
      'Uma versão do manuscrito não corresponde à leitura integral aprovada.',
    );
}
export function literaryPublicationSummary(job) {
  return {
    jobId: job.jobId,
    progressRevision: job.progressRevision ?? 0,
    title: job.title ?? null,
    authorName: job.authorName ?? null,
    integrationId: job.integration?.id ?? null,
    policy: job.policy ?? null,
    unitId: job.unitId ?? null,
    state: job.state,
    phase: job.phase ?? null,
    candidates: job.candidates ?? 0,
    verifiedCandidates: job.verifiedCandidates ?? 0,
    chapterCount: job.chapterCount ?? 0,
    compiledChapters: job.compiledChapters ?? 0,
    unitCount: job.unitCount ?? 0,
    verifiedUnits: job.verifiedUnits ?? 0,
    verifiedChapters: job.verifiedChapters ?? 0,
    actCount: job.actCount ?? 0,
    wordCount: job.wordCount ?? 0,
    removalCount: job.removalCount ?? 0,
    removalHash: job.removalHash ?? null,
    manifestHash: job.manifestHash ?? null,
    createdAt: job.createdAt,
    preparedAt: job.preparedAt ?? null,
    publishedAt: job.publishedAt ?? null,
    revisionId: job.jobId,
    publicationUrl: job.publicationUrl ?? null,
    publicationConfirmed: job.state === 'published',
    guideRevision: job.guideRevision ?? 0,
    guideCount: job.guideCount ?? 0,
    verifiedGuideEntries: job.verifiedGuideEntries ?? 0,
    guideHash: job.guideHash ?? null,
    editionHash: job.editionHash ?? null,
    message: job.message ?? null,
  };
}
export function publicationActName(act) {
  if (typeof act.name === 'string' && act.name.trim()) return publicationText(act.name, 300);
  if (!Number.isSafeInteger(act.order) || act.order < 1)
    workFail('failed-precondition', 'Confira o número do ato.');
  if (Math.floor(act.order / 1000) > 300)
    workFail('failed-precondition', 'Defina um nome de ato de até 300 caracteres.');
  let remaining = act.order,
    result = '';
  for (const [number, symbol] of [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ]) {
    result += symbol.repeat(Math.floor(remaining / number));
    remaining %= number;
  }
  return publicationText(result, 300);
}
// A native finalizer may only expose a fully checked editorial revision. During
// compilation the public staging documents are deliberately not reader-visible.
export async function assertLiteraryPublicationReady(tx, c, revisionId, sourceToken) {
  const root = await workProject(tx, c);
  if (root.hasLiteraryPublications !== true) return null;
  const job = (await tx.get(literaryPublicationRef(c, 'literaryPublications', revisionId))).data();
  if (
    !job ||
    job.state !== 'verified' ||
    job.publicationSourceToken !== sourceToken ||
    job.verifiedChapters !== job.chapterCount ||
    job.verifiedUnits !== job.unitCount
  )
    workFail(
      'failed-precondition',
      'Conclua o manifesto e confirme a publicação na produção literária.',
    );
  const current = await readLiteraryPublicationSource(tx, c);
  if (current.token !== job.sourceFence)
    workFail('failed-precondition', 'A fonte desta publicação mudou.');
  return job;
}

export async function readLiteraryPublicationJob(tx, c, jobId) {
  const actual = await readLiteraryPublicationBook(tx, c),
    job = (await tx.get(literaryPublicationRef(c, 'literaryPublications', workId(jobId)))).data();
  if (!job || job.bookToken !== actual.bookToken)
    workFail('not-found', 'Edição editorial indisponível.');
  return { job, root: actual.root, bookToken: actual.bookToken };
}
export async function assertLiteraryPublicationCurrent(tx, c, job) {
  const actual = await readLiteraryPublicationSource(tx, c),
    accepted = await readLiteraryPublicationIntegration(tx, c, job.integration.id);
  if (
    actual.bookToken !== job.bookToken ||
    actual.token !== job.sourceFence ||
    accepted.token !== job.integration.token ||
    accepted.sourceFence !== actual.manuscriptFence
  )
    workFail(
      'failed-precondition',
      'A edição mudou. Preserve este manifesto e prepare uma nova versão.',
    );
  return actual;
}

export function persistLiteraryPublicationStep(tx, c, target, previous, next) {
  const revision = (previous?.progressRevision ?? 0) + 1;
  if (!Number.isSafeInteger(revision) || revision < 1)
    workFail('failed-precondition', 'O checkpoint excedeu o limite.');
  next.progressRevision = revision;
  writeLiteraryBackupProcess(tx, c, 'publication', 'set', target, next);
  return next;
}
