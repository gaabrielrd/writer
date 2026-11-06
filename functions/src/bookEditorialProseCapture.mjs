import { createHash } from 'node:crypto';
import { bookBackupIdentity, bookBackupChanged } from './bookBackupContext.mjs';
import { readWorkMetadata, workId, workFail, digest } from './workProgressContracts.mjs';
import { literaryProseCaptureFields, authorizeLiteraryProseCapture } from './literaryProse.mjs';
import { normalizeLiteraryWritingManifest } from './literaryWritingProtocol.mjs';
import { createLiteraryReferenceReader } from './literaryReferences.mjs';
import {
  bookEditorialRecordIdentity,
  projectBookEditorialPlanReference,
  bookEditorialProseArtifactIdentity,
} from './bookEditorialProjection.mjs';
import {
  normalizeBookEditorialArtifact,
  normalizeBookEditorialReading,
} from './bookEditorialProtocol.mjs';
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
    'A proposta literária salva está inconsistente. Preserve a origem.',
  );
const states = ['running', 'done', 'applied', 'error', 'stale', 'revoked', 'canceled'];
const modes = ['draftScene', 'reviseScene', 'reviewStructure', 'reviewProse'];
const ref = (bookId, kind, id, revision = null, state = 'unavailable', purpose = 'source') => ({
  kind,
  id,
  parentId: null,
  scope: { kind: 'book', id: bookId },
  revision,
  contentHash: null,
  state,
  purpose,
});
const sourceDocId = (reference) =>
  reference.kind === 'volumeUnit'
    ? 'volume-unit:' + digest({ id: reference.id, scopeId: reference.scopeId })
    : reference.kind + ':' + reference.id + ':' + (reference.purpose ?? 'source');
function reading(raw) {
  if (
    !raw ||
    raw.scope !== 'scene-segment' ||
    raw.wholeChapter !== false ||
    raw.wholeBook !== false
  )
    fail();
  return normalizeBookEditorialReading({
    unit: 'scene',
    sourceCharacters: raw.sourceCharacters,
    segment: raw.segment,
    segmentCount: raw.segmentCount,
    start: raw.start,
    end: raw.end,
    coreStart: raw.coreStart,
    coreEnd: raw.coreEnd,
    completeScene: raw.completeScene,
    previousSceneIncluded: raw.previousSceneIncluded,
  });
}
function frozenGeneration(raw) {
  if (raw === undefined) return {};
  if (
    raw?.version !== 1 ||
    raw.requested?.provider !== 'platform' ||
    raw.effective?.provider !== 'gemini' ||
    typeof raw.effective.model !== 'string' ||
    (raw.effective.reasoning !== null && typeof raw.effective.reasoning !== 'string')
  )
    fail();
  return {
    generation: {
      snapshot: 'historical',
      provider: 'platform',
      model: raw.effective.model,
      reasoning: raw.effective.reasoning,
    },
  };
}
function transfer(artifacts, pins) {
  const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, artifacts }), 'utf8');
  if (!artifacts.length || artifacts.length > 45 || bytes.length > 2 * 1024 * 1024) fail();
  return {
    artifact: artifacts[0],
    artifacts,
    bytes,
    state: 'artifact',
    contentHash: createHash('sha256').update(bytes).digest('hex'),
    head: null,
    pins,
  };
}
/** Internal only. The existing native grant is checked before cached result/source bodies. */
export async function readBookEditorialProseCapture(
  tx,
  c,
  { id, bookBirth, root, itemToken, tokenForRow },
) {
  const path = c.path + '/literaryProseRequests/' + id;
  const row = await readWorkMetadata(tx, c.db.doc(path), [
    ...literaryProseCaptureFields,
    'schemaVersion',
  ]);
  if (!row.exists || tokenForRow(row) !== itemToken) bookBackupChanged(true);
  const header = row.data();
  if (header.requestId !== id || !states.includes(header.state)) fail();
  const identity = (part) =>
    bookEditorialProseArtifactIdentity({
      bookId: c.target.id,
      bookBirth,
      birth: bookBackupIdentity(row).created,
      id,
      part,
    });
  const pins = [];
  // Native cancellation may precede the first request: no instruction or target ever existed.
  if (
    header.state === 'canceled' &&
    header.mode == null &&
    header.chapterId == null &&
    header.sceneId == null &&
    header.instruction == null
  ) {
    const known = header.schemaVersion === 1;
    return transfer(
      [
        normalizeBookEditorialArtifact({
          schemaVersion: 1,
          id: identity('checkpoint'),
          kind: 'checkpoint',
          revision: null,
          createdAt: header.createdAt ?? null,
          updatedAt: null,
          provenance: 'unknown',
          availability: known
            ? { state: 'included' }
            : { state: 'unavailable', reason: 'unsupported-legacy-schema' },
          content: known
            ? {
                process: 'text-assistance',
                phase: 'canceled',
                counters: {},
                currentUnit: null,
                references: [],
                haltReason: null,
                nextAction: null,
                controlsDisabled: true,
              }
            : null,
        }),
      ],
      [{ cancellation: 'before-input' }],
    );
  }
  if (!modes.includes(header.mode)) fail();
  const chapterId = workId(header.chapterId),
    sceneId = workId(header.sceneId);
  let unavailable = header.schemaVersion === 1 ? null : 'unsupported-legacy-schema';
  if (!unavailable && ['canceled', 'revoked', 'stale', 'running'].includes(header.state))
    unavailable = header.state === 'revoked' ? 'source-revoked' : 'not-recorded';
  let manifest = null;
  if (!unavailable && header.manifest) {
    if (header.manifest.version !== 1) unavailable = 'unsupported-legacy-schema';
    else {
      try {
        manifest = normalizeLiteraryWritingManifest(header.manifest);
      } catch {
        fail();
      }
      if (
        manifest.target.id !== c.target.id ||
        manifest.resource.kind !== 'scene' ||
        manifest.resource.id !== sceneId
      )
        fail();
    }
  }
  if (!unavailable) {
    try {
      const origin = await authorizeLiteraryProseCapture(tx, c, header);
      pins.push({ authorization: 'native', origin: origin.token, assembly: origin.assemblyToken });
    } catch (error) {
      if (['permission-denied', 'not-found'].includes(error.code)) unavailable = 'source-revoked';
      else throw error;
    }
  }
  // An unavailable response never discards the author's original instruction.
  const subject = ref(
    c.target.id,
    'scene',
    sceneId,
    null,
    unavailable ? 'unavailable' : 'recorded',
    'subject',
  );
  const make = (kind, part, content, provenance, extra = {}) =>
    normalizeBookEditorialArtifact({
      schemaVersion: 1,
      id: identity(part),
      kind,
      revision: null,
      createdAt: null,
      updatedAt: null,
      provenance,
      availability: { state: 'included' },
      content,
      ...extra,
    });
  const artifacts = [
    make(
      'document',
      'instruction',
      {
        role: 'preparation',
        title: 'Instrução autoral para assistência de texto',
        sections: [
          { label: 'Operação solicitada', text: header.mode },
          { label: 'Instrução', text: header.instruction },
        ],
        references: [
          subject,
          ref(
            c.target.id,
            'chapter',
            chapterId,
            null,
            unavailable ? 'unavailable' : 'recorded',
            'subject',
          ),
        ],
      },
      'author',
      { createdAt: header.createdAt ?? null },
    ),
    make(
      'checkpoint',
      'checkpoint',
      {
        process: header.mode.startsWith('review') ? 'review' : 'draft',
        phase: header.state,
        counters: {},
        currentUnit: subject,
        references: [],
        haltReason: null,
        nextAction: null,
        controlsDisabled: true,
      },
      'unknown',
    ),
  ];
  const missing = (kind, part, reason) =>
    normalizeBookEditorialArtifact({
      schemaVersion: 1,
      id: identity(part),
      kind,
      revision: null,
      createdAt: null,
      updatedAt: null,
      provenance: 'unknown',
      availability: { state: 'unavailable', reason },
      content: null,
    });
  if (unavailable) {
    pins.push({ unavailable });
    artifacts.push(missing('prose', 'source-copy', unavailable));
    artifacts.push(missing('report', 'report', unavailable));
    if (!header.mode.startsWith('review'))
      artifacts.push(missing('prose', 'proposal', unavailable));
  } else {
    const body = await tx.get(row.ref),
      value = body.data();
    if (stable(bookBackupIdentity(body)) !== stable(bookBackupIdentity(row)))
      bookBackupChanged(true);
    const covered = reading(header.coverage),
      generation = frozenGeneration(header.generation);
    if (
      typeof value.sourceText !== 'string' ||
      value.sourceText.length !== covered.end - covered.start ||
      !Array.isArray(value.documents) ||
      value.documents.length > 64 ||
      stable(value.coverage) !== stable(header.coverage) ||
      stable(value.generation) !== stable(header.generation)
    )
      fail();
    const documents = new Map();
    for (const document of value.documents) {
      if (!document || typeof document.id !== 'string' || typeof document.text !== 'string') fail();
      if (!documents.has(document.id)) documents.set(document.id, document);
    }
    if (
      documents.get('manuscript')?.text !== value.sourceText ||
      documents.get('manuscript')?.revision !== header.sourceRevision ||
      covered.previousSceneIncluded !== !!header.previous
    )
      fail();
    const sourceRefs = new Map();
    const nativeRead = await createLiteraryReferenceReader(tx, c, root);
    if (manifest)
      for (const entry of manifest.references) {
        const found = await nativeRead(entry.reference);
        const version =
          entry.reference.purpose === 'subject' &&
          ['act', 'chapter', 'scene'].includes(entry.reference.kind)
            ? found?.identityToken
            : found?.versionToken;
        const matches =
          !!found &&
          found.identityToken === entry.identityToken &&
          version === entry.versionToken &&
          (entry.reference.revision == null ||
            entry.reference.revision === found.reference.revision);
        pins.push({
          source: sourceDocId(entry.reference),
          identity: found?.identityToken ?? null,
          version: found?.versionToken ?? null,
        });
        sourceRefs.set(
          sourceDocId(entry.reference),
          projectBookEditorialPlanReference(
            c.target.id,
            root.universeId ?? null,
            entry.reference,
            matches ? 'recorded' : 'unavailable',
          ),
        );
      }
    async function sceneReference(nativeId, revision) {
      const current = await readWorkMetadata(tx, c.db.doc(c.path + '/scenes/' + nativeId), [
        'revision',
      ]);
      pins.push({ scene: nativeId, native: bookBackupIdentity(current) });
      return ref(
        c.target.id,
        'scene',
        nativeId,
        revision,
        current.exists && current.data().revision === revision ? 'recorded' : 'unavailable',
      );
    }
    const manuscript = await sceneReference(sceneId, header.sourceRevision);
    sourceRefs.set('manuscript', manuscript);
    sourceRefs.set('scenePlan', manuscript);
    if (header.previous) {
      const previous = documents.get('previousScene');
      if (!previous) fail();
      sourceRefs.set(
        'previousScene',
        await sceneReference(workId(header.previous.sceneId), previous.revision),
      );
    }
    async function sourceReference(documentId) {
      if (sourceRefs.has(documentId)) return sourceRefs.get(documentId);
      const plan = manifest?.plans.find((item) => 'plan:' + item.id === documentId);
      const kind =
        documentId === 'contract' && manifest?.contractRevision > 0
          ? 'contract'
          : plan
            ? 'plan'
            : null;
      let result;
      if (kind) {
        const nativeId = kind === 'contract' ? 'current' : plan.id,
          revision = kind === 'contract' ? manifest.contractRevision : plan.revision;
        const current = await readWorkMetadata(
          tx,
          c.db.doc(
            c.path +
              (kind === 'contract' ? '/literaryProduction/current' : '/literaryPlans/' + nativeId),
          ),
          ['id', 'revision'],
        );
        const saved = await readWorkMetadata(
          tx,
          c.db.doc(
            c.path +
              (kind === 'contract'
                ? '/literaryContractVersions/' + revision
                : '/literaryPlanVersions/' + digest({ id: nativeId, revision })),
          ),
          ['id', 'revision'],
        );
        const matches = (candidate) =>
          candidate.exists &&
          candidate.data().revision === revision &&
          (kind === 'contract' || candidate.data().id === nativeId);
        pins.push({
          source: documentId,
          current: bookBackupIdentity(current),
          saved: bookBackupIdentity(saved),
        });
        result = ref(
          c.target.id,
          'artifact',
          bookEditorialRecordIdentity({
            bookId: c.target.id,
            bookBirth,
            kind,
            id: nativeId,
            revision,
          }).id,
          revision,
          matches(current) || matches(saved) ? 'recorded' : 'unavailable',
        );
      } else result = ref(c.target.id, 'artifact', identity('unrecorded-source:' + documentId));
      sourceRefs.set(documentId, result);
      return result;
    }
    artifacts.push(
      make(
        'prose',
        'source-copy',
        {
          role: 'saved-copy',
          format: 'plain',
          text: value.sourceText,
          rationale:
            'Segmento original fornecido à assistência; não representa leitura integral do capítulo ou livro.',
          source: manuscript,
          reading: covered,
        },
        'unknown',
      ),
    );
    if (value.result == null) {
      if (header.state !== 'error') fail();
      artifacts.push(missing('report', 'report', 'not-recorded'));
      if (!header.mode.startsWith('review'))
        artifacts.push(missing('prose', 'proposal', 'not-recorded'));
    } else {
      const result = value.result;
      if (
        result.complete !== true ||
        typeof result.text !== 'string' ||
        result.text.length > 80000 ||
        typeof result.rationale !== 'string' ||
        result.rationale.length > 6000 ||
        !Array.isArray(result.findings) ||
        result.findings.length > 40 ||
        (header.mode.startsWith('review') ? result.text !== '' : !result.text.trim())
      )
        fail();
      const findings = [];
      for (let index = 0; index < result.findings.length; index++) {
        const finding = result.findings[index],
          document = documents.get(finding.sourceId);
        if (
          !document ||
          typeof finding.quote !== 'string' ||
          !finding.quote.trim() ||
          finding.quote.length > 1200 ||
          !Number.isSafeInteger(finding.offset) ||
          !['blocking', 'warning', 'suggestion'].includes(finding.severity) ||
          typeof finding.problem !== 'string' ||
          !finding.problem.trim() ||
          finding.problem.length > 2000 ||
          typeof finding.action !== 'string' ||
          !finding.action.trim() ||
          finding.action.length > 2000
        )
          fail();
        const local = finding.offset - (document.id === 'manuscript' ? covered.start : 0);
        if (local < 0 || document.text.slice(local, local + finding.quote.length) !== finding.quote)
          fail();
        const evidenceId = identity('evidence:' + index),
          source = await sourceReference(document.id);
        artifacts.push(
          make(
            'evidence',
            'evidence:' + index,
            {
              source,
              quote: finding.quote,
              start: finding.offset,
              end: finding.offset + finding.quote.length,
              offsetUnit: 'utf16',
              classification: 'unclassified',
              rationale: finding.problem,
              context: {
                format: 'plain',
                documentId: document.id,
                offsetBase: document.id === 'manuscript' ? covered.start : 0,
              },
            },
            'ai',
          ),
        );
        findings.push({
          id: identity('finding:' + index),
          status: null,
          severity: finding.severity,
          problem: finding.problem,
          action: finding.action,
          evidenceIds: [evidenceId],
        });
      }
      artifacts.push(
        make(
          'report',
          'report',
          {
            role: header.mode.startsWith('review') ? 'review' : 'analysis',
            title: 'Análise salva da assistência de texto',
            summary: result.rationale,
            findings,
            observations:
              typeof value.sceneTitle === 'string' && value.sceneTitle.trim()
                ? [{ axis: 'Título da cena na captura', text: value.sceneTitle, evidenceIds: [] }]
                : [],
            claimedCoverage: {
              scope: covered.completeScene ? 'unit' : 'excerpt',
              completed: 1,
              total: covered.segmentCount,
              limitations: [
                'Somente as fontes e o segmento fornecidos nesta operação; sem certificação do capítulo ou livro.',
              ],
            },
            references: [
              subject,
              ref(c.target.id, 'artifact', identity('instruction'), null, 'recorded'),
              ref(c.target.id, 'artifact', identity('source-copy'), null, 'recorded'),
              ...(!header.mode.startsWith('review')
                ? [ref(c.target.id, 'artifact', identity('proposal'), null, 'recorded', 'subject')]
                : []),
            ],
            reading: covered,
          },
          'ai',
          generation,
        ),
      );
      if (!header.mode.startsWith('review'))
        artifacts.push(
          make(
            'prose',
            'proposal',
            {
              role: 'proposal',
              format: 'plain',
              text: result.text,
              rationale: result.rationale,
              source: manuscript,
            },
            'ai',
            generation,
          ),
        );
    }
  }
  // The producer will unpack the transfer bundle. Keep its associations explicit in the archive.
  const checkpoint = artifacts[1];
  artifacts[1] = normalizeBookEditorialArtifact({
    ...checkpoint,
    content: {
      ...checkpoint.content,
      references: artifacts
        .filter((item) => item !== checkpoint && item.kind !== 'evidence')
        .map((item) =>
          ref(
            c.target.id,
            'artifact',
            item.id,
            null,
            item.availability.state === 'included' ? 'recorded' : 'unavailable',
            item.kind === 'report' || item.id === identity('proposal') ? 'subject' : 'source',
          ),
        ),
    },
  });
  return transfer(artifacts, pins);
}
