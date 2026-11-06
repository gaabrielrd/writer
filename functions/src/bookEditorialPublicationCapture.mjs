import { createHash } from 'node:crypto';
import { bookBackupIdentity, bookBackupChanged } from './bookBackupContext.mjs';
import { readWorkMetadata, workId, workFail, digest } from './workProgressContracts.mjs';
import {
  readLiteraryPublicationBook,
  literaryPublicationEntryId,
} from './literaryPublicationContracts.mjs';
import { readLiteraryIntegrationChapter } from './literaryIntegrationSources.mjs';
import { normalizeLiteraryReaderGuide } from './literaryReaderGuideProtocol.mjs';
import { normalizeBookEditorialArtifact } from './bookEditorialProtocol.mjs';
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
const stable = (value) => digest(canonical(value ?? null));
const fail = () =>
  workFail(
    'failed-precondition',
    'O registro editorial da publicação está inconsistente. Preserve a origem.',
  );
const count = (value) => {
  if (!Number.isSafeInteger(value) || value < 0) fail();
  return value;
};
const text = (value, max = 4000) => {
  if (typeof value !== 'string' || value.length > max || !value.isWellFormed()) fail();
  return value;
};
const jobFields = [
  'schemaVersion',
  'jobId',
  'bookToken',
  'state',
  'phase',
  'title',
  'authorName',
  'policy',
  'unitId',
  'checks',
  'chapterCount',
  'compiledChapters',
  'removalCount',
  'unitCount',
  'verifiedUnits',
  'verifiedChapters',
  'verifiedCandidates',
  'actCount',
  'wordCount',
  'guideCount',
  'guideRevision',
  'verifiedGuideEntries',
  'createdAt',
  'publishedAt',
  'previous.revisionId',
  'previous.chapterCount',
];
const guideFields = [
  'version',
  'jobId',
  'id',
  'bookToken',
  'revision',
  'deleted',
  'entryHash',
  'updatedAt',
];
const families = {
  job: { collection: 'literaryPublications', fields: jobFields },
  chapter: {
    collection: 'literaryPublicationChapters',
    fields: [
      'jobId',
      'chapterId',
      'identityToken',
      'index',
      'title',
      'actId',
      'compiled',
      'wordCount',
    ],
  },
  removal: {
    collection: 'literaryPublicationRemovals',
    fields: ['jobId', 'chapterId', 'title', 'previousRevisionId'],
  },
  guide: { collection: 'literaryPublicationGuide', fields: guideFields },
  'guide-version': { collection: 'literaryPublicationGuideVersions', fields: guideFields },
};
const ref = (bookId, kind, id, state = 'unavailable', purpose = 'source') => ({
  kind,
  id,
  parentId: null,
  scope: { kind: 'book', id: bookId },
  revision: null,
  contentHash: null,
  state,
  purpose,
});
/** Own author guide/manifest history follows the native book-origin gate, not a fresh publication consent. */
export async function readBookEditorialPublicationCapture(
  tx,
  c,
  { id, family, bookBirth, itemToken, tokenForRow },
) {
  const definition = families[family];
  if (!definition) fail();
  const row = await readWorkMetadata(
    tx,
    c.db.doc(c.path + '/' + definition.collection + '/' + id),
    definition.fields,
  );
  if (!row.exists || tokenForRow(row) !== itemToken) bookBackupChanged(true);
  const value = row.data(),
    jobId = workId(family === 'job' ? id : value.jobId),
    guideFamily = family.startsWith('guide');
  const origin = await readLiteraryPublicationBook(tx, c);
  const parent =
      family === 'job'
        ? row
        : await readWorkMetadata(
            tx,
            c.db.doc(c.path + '/literaryPublications/' + jobId),
            jobFields,
          ),
    job = parent.data();
  const pins = [{ parent: bookBackupIdentity(parent) }];
  const editionKeyFor = (sourceId) =>
    digest({
      domain: 'writer-editorial-publication-edition-key-v1',
      bookId: c.target.id,
      bookBirth,
      jobId: workId(sourceId),
    });
  const editionKey = editionKeyFor(jobId);
  const guideKey = (entryId) =>
    digest({ domain: 'writer-editorial-reader-guide-key-v1', editionKey, id: workId(entryId) });
  const ownKey = guideFamily ? guideKey(value.id) : null;
  const revision = guideFamily ? count(value.revision) : null;
  if (guideFamily && !revision) fail();
  const identity = (part) =>
    guideFamily
      ? digest({ domain: 'writer-editorial-reader-guide-version-v1', key: ownKey, revision, part })
      : digest({
          domain: 'writer-editorial-publication-artifact-v1',
          bookId: c.target.id,
          bookBirth,
          birth: bookBackupIdentity(row).created,
          id,
          family,
          part,
        });
  const make = (kind, part, content, extra = {}) =>
    normalizeBookEditorialArtifact({
      schemaVersion: 1,
      id: identity(part),
      kind,
      revision: part === 'document' && guideFamily ? revision : null,
      createdAt: null,
      updatedAt: part === 'document' && guideFamily ? value.updatedAt : null,
      provenance: 'author',
      availability: { state: 'included' },
      content,
      ...(part === 'document' && guideFamily
        ? { lineage: { id: ownKey, role: family === 'guide' ? 'current' : 'version' } }
        : {}),
      ...extra,
    });
  const missing = (reason) =>
    normalizeBookEditorialArtifact({
      schemaVersion: 1,
      id: identity('document'),
      kind: 'document',
      revision,
      createdAt: null,
      updatedAt: null,
      provenance: 'unknown',
      availability: { state: 'unavailable', reason },
      content: null,
    });
  const chapterCurrent = async (chapterId, expected) => {
    if (!/^[a-f0-9]{64}$/.test(expected ?? '')) return false;
    try {
      const current = await readLiteraryIntegrationChapter(tx, c, chapterId);
      pins.push({ chapterId, currentIdentity: current.identityToken, currentToken: current.token });
      return current.identityToken === expected;
    } catch (error) {
      if (!['permission-denied', 'not-found', 'failed-precondition'].includes(error.code))
        throw error;
      return false;
    }
  };
  let artifacts,
    state = 'artifact',
    head = null;
  let unavailable =
    !parent.exists || job.jobId !== jobId || job.bookToken !== origin.bookToken
      ? 'source-unavailable'
      : job.schemaVersion !== 1
        ? 'unsupported-legacy-schema'
        : null;
  if (guideFamily && value.bookToken !== origin.bookToken) unavailable = 'source-unavailable';
  if (guideFamily && value.version !== 1) unavailable = 'unsupported-legacy-schema';
  if (unavailable) artifacts = [missing(unavailable)];
  else if (guideFamily) {
    if (
      typeof value.deleted !== 'boolean' ||
      !/^[a-f0-9]{64}$/.test(value.entryHash ?? '') ||
      (family === 'guide'
        ? literaryPublicationEntryId(jobId, value.id) !== id
        : digest({ jobId, id: value.id, revision }) !== id)
    )
      fail();
    const opened = await tx.get(row.ref),
      raw = opened.data();
    if (stable(bookBackupIdentity(opened)) !== stable(bookBackupIdentity(row)))
      bookBackupChanged(true);
    if (
      stable(Object.fromEntries(guideFields.map((key) => [key, raw[key]]))) !== stable(value) ||
      raw.deleted !== (raw.guide === null) ||
      digest(raw.guide) !== raw.entryHash
    )
      fail();
    const guide = raw.guide === null ? null : normalizeLiteraryReaderGuide(raw.guide);
    if (stable(guide) !== stable(raw.guide)) fail();
    if (family === 'guide-version') {
      const observed = await readWorkMetadata(
        tx,
        c.db.doc(
          c.path + '/literaryPublicationGuide/' + literaryPublicationEntryId(jobId, value.id),
        ),
        guideFields,
      );
      head = bookBackupIdentity(observed);
      if (observed.exists) {
        const current = observed.data();
        if (
          current.jobId !== jobId ||
          current.id !== value.id ||
          current.bookToken !== value.bookToken ||
          count(current.revision) < revision
        )
          fail();
        if (current.revision === revision) {
          if (stable(current) !== stable(value)) fail();
          state = 'current-alias';
        }
      }
    }
    const chapters = new Map();
    const chapter = async (chapterId) => {
      workId(chapterId);
      if (!chapters.has(chapterId)) {
        const prepared = await readWorkMetadata(
          tx,
          c.db.doc(
            c.path + '/literaryPublicationChapters/' + literaryPublicationEntryId(jobId, chapterId),
          ),
          families.chapter.fields,
        );
        const descriptor = prepared.data();
        let available = false;
        if (
          prepared.exists &&
          descriptor.jobId === jobId &&
          descriptor.chapterId === chapterId &&
          /^[a-f0-9]{64}$/.test(descriptor.identityToken ?? '')
        ) {
          available = await chapterCurrent(chapterId, descriptor.identityToken);
        }
        pins.push({ prepared: bookBackupIdentity(prepared), available });
        chapters.set(
          chapterId,
          ref(c.target.id, 'chapter', chapterId, available ? 'recorded' : 'unavailable'),
        );
      }
      return chapters.get(chapterId);
    };
    const evidence = [];
    const citation = async (source, role, index) => {
      const evidenceId = identity('evidence:' + role + ':' + index);
      evidence.push(
        make('evidence', 'evidence:' + role + ':' + index, {
          source: await chapter(source.chapterId),
          quote: source.quote,
          start: null,
          end: null,
          offsetUnit: 'not-recorded',
          classification: 'unclassified',
          rationale:
            'Citação informada pelo autor no guia histórico. Posição não registrada; não comprova presença no texto atual.',
        }),
      );
      return evidenceId;
    };
    let entry = null;
    if (guide) {
      entry = {
        name: guide.name,
        aliases: guide.aliases,
        category: guide.category,
        summary: guide.summary,
        certainty: guide.certainty,
        disambiguation: guide.disambiguation,
        revealAfter: await chapter(guide.revealAfterChapterId),
        evidenceIds: [],
        facts: [],
        relationships: [],
        appearances: [],
      };
      for (const [index, source] of guide.evidence.entries())
        entry.evidenceIds.push(await citation(source, 'summary', index));
      for (const [index, source] of guide.facts.entries())
        entry.facts.push({
          text: source.text,
          certainty: source.certainty,
          chapter: await chapter(source.chapterId),
          evidenceId: await citation(source, 'fact', index),
        });
      for (const [index, source] of guide.relationships.entries())
        entry.relationships.push({
          targetKey: guideKey(source.targetId),
          description: source.description,
          certainty: source.certainty,
          chapter: await chapter(source.chapterId),
          evidenceId: await citation(source, 'relationship', index),
        });
      for (const [index, source] of guide.appearances.entries())
        entry.appearances.push({
          kind: source.kind,
          chapter: await chapter(source.chapterId),
          evidenceId: await citation(source, 'appearance', index),
        });
    }
    artifacts = [
      make('document', 'document', {
        role: 'readerGuide',
        title: guide ? guide.name : 'Entrada retirada do guia do leitor',
        sections: [],
        references: [],
        editionKey,
        readerGuide: { key: ownKey, entry },
      }),
      ...evidence,
    ];
  } else if (family === 'job') {
    const checkpoint = make(
      'checkpoint',
      'checkpoint',
      {
        process: 'publication',
        phase: text(job.state, 100),
        counters: {},
        currentUnit: null,
        references: [],
        haltReason: null,
        nextAction: null,
        controlsDisabled: true,
      },
      { createdAt: job.createdAt ?? null },
    );
    artifacts = [checkpoint];
    if (job.policy != null) {
      if (!['book', 'act', 'chapter'].includes(job.policy)) fail();
      const references =
        job.policy === 'book'
          ? [ref(c.target.id, 'book', c.target.id, 'recorded', 'subject')]
          : [ref(c.target.id, job.policy, workId(job.unitId), 'unavailable', 'subject')];
      const sections = [
        { label: 'Título registrado', text: text(job.title, 300) },
        { label: 'Nome autoral registrado', text: text(job.authorName, 160) },
        { label: 'Unidade registrada', text: job.policy },
        { label: 'Estado histórico', text: text(job.state, 100) },
      ];
      for (const key of [
        'chapterCount',
        'compiledChapters',
        'removalCount',
        'unitCount',
        'verifiedUnits',
        'verifiedChapters',
        'verifiedCandidates',
        'actCount',
        'wordCount',
        'guideCount',
        'guideRevision',
        'verifiedGuideEntries',
      ])
        if (job[key] !== undefined) sections.push({ label: key, text: String(count(job[key])) });
      for (const key of ['finalTextReviewed', 'navigationReviewed', 'publicationAuthorized'])
        if (typeof job.checks?.[key] === 'boolean')
          sections.push({
            label: 'Declaração autoral histórica: ' + key,
            text: job.checks[key] ? 'sim' : 'não',
          });
      sections.push({
        label: 'Limite do registro',
        text: 'Registro privado. Não reativa consentimento, publicação, ponteiros públicos ou verificação de qualidade.',
      });
      artifacts.push(
        make(
          'document',
          'document',
          {
            role: 'publicationManifest',
            title: 'Manifesto histórico da edição',
            editionKey,
            ...(job.previous?.revisionId
              ? { previousEditionKey: editionKeyFor(job.previous.revisionId) }
              : {}),
            sections,
            references,
          },
          { createdAt: job.createdAt ?? null },
        ),
      );
      artifacts[0] = normalizeBookEditorialArtifact({
        ...checkpoint,
        content: {
          ...checkpoint.content,
          references: [ref(c.target.id, 'artifact', identity('document'), 'recorded', 'subject')],
        },
      });
    } else if (job.state !== 'canceled') fail();
  } else {
    const chapterId = workId(value.chapterId);
    if (id !== literaryPublicationEntryId(jobId, chapterId)) fail();
    const sections = [
      {
        label: 'Título registrado',
        text: value.title === null && family === 'removal' ? '' : text(value.title, 300),
      },
    ];
    const references = [ref(c.target.id, 'chapter', chapterId, 'unavailable', 'subject')];
    if (family === 'chapter') {
      if (typeof value.compiled !== 'boolean') fail();
      references[0].state = (await chapterCurrent(chapterId, value.identityToken))
        ? 'recorded'
        : 'unavailable';
      sections.push(
        { label: 'Posição no manifesto', text: String(count(value.index)) },
        { label: 'Compilação registrada', text: value.compiled ? 'sim' : 'não' },
      );
      if (value.wordCount !== undefined)
        sections.push({ label: 'Palavras registradas', text: String(count(value.wordCount)) });
      if (value.actId)
        references.push(ref(c.target.id, 'act', workId(value.actId), 'unavailable', 'subject'));
    } else {
      workId(value.previousRevisionId);
      sections.push({
        label: 'Retirada registrada',
        text: 'Retirada da edição anterior; não exclui prosa ou restaura estado público.',
      });
    }
    artifacts = [
      make('document', 'document', {
        role: 'publicationManifest',
        title:
          family === 'chapter'
            ? 'Capítulo do manifesto histórico'
            : 'Retirada do manifesto histórico',
        editionKey,
        ...(family === 'removal'
          ? { previousEditionKey: editionKeyFor(value.previousRevisionId) }
          : {}),
        sections,
        references,
      }),
    ];
  }
  const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, artifacts }), 'utf8');
  if (artifacts.length > 57 || bytes.length > 1024 * 1024) fail();
  return {
    artifact: artifacts[0],
    artifacts,
    bytes,
    state,
    head,
    pins,
    contentHash: createHash('sha256').update(bytes).digest('hex'),
  };
}
