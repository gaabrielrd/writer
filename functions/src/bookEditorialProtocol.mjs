import {
  LITERARY_GATE_CRITERIA,
  LITERARY_GATE_OPTIONAL_CRITERIA,
} from './literaryGateProtocol.mjs';
import {
  EDITORIAL_FIELDS,
  EDITORIAL_STATUSES,
  EDITORIAL_CATEGORIES,
  MAX_EDITORIAL_BYTES,
} from './literaryEditorialFields.mjs';
import { LITERARY_PLAN_SCHEMA } from './literaryPlanFields.mjs';
import { normalizeLiteraryCollaboration } from './literaryCollaborationProtocol.mjs';
import { normalizeLiteraryPublicationPolicy } from './literaryPublicationPolicyProtocol.mjs';
// This is portable content validation, never authorization or a native job DTO.
export const BOOK_EDITORIAL_VERSION = 1;
export const BOOK_EDITORIAL_ITEM_BYTES = 8 * 1024 * 1024;
export const BOOK_EDITORIAL_ARTIFACT_KINDS = Object.freeze([
  'contract',
  'plan',
  'document',
  'decision',
  'evidence',
  'report',
  'checkpoint',
  'prose',
]);
export const BOOK_EDITORIAL_REFERENCE_KINDS = Object.freeze([
  'book',
  'act',
  'chapter',
  'scene',
  'arc',
  'arcMilestone',
  'event',
  'lore',
  'historyVersion',
  'persona',
  'image',
  'artifact',
  'sceneLink',
  'narrativeLink',
  'narrativeControl',
]);
export const BOOK_EDITORIAL_RELATIONS = Object.freeze([
  'references',
  'supersedes',
  'supports',
  'reviews',
  'derives',
  'corrects',
  'contains',
  'publishes',
]);
const encoder = new TextEncoder();
const invalid = () => {
  throw new TypeError('Conteúdo editorial portátil inválido.');
};
function closed(value, required, optional = []) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Reflect.ownKeys(value).some(
      (key) => typeof key !== 'string' || ![...required, ...optional].includes(key),
    ) ||
    required.some((key) => !Object.hasOwn(value, key))
  )
    invalid();
  for (const key of Reflect.ownKeys(value))
    if (!Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')) invalid();
  return value;
}
function text(value, max = 80000, required = false) {
  if (
    typeof value !== 'string' ||
    !value.isWellFormed() ||
    value.length > max ||
    (required && !value.trim())
  )
    invalid();
  return value;
}
function id(value) {
  text(value, 1500, true);
  if (encoder.encode(value).length > 1500 || value.includes('/') || ['.', '..'].includes(value))
    invalid();
  return value;
}
function hash(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) invalid();
  return value;
}
function count(value) {
  if (!Number.isSafeInteger(value) || value < 0) invalid();
  return value;
}
function optionalCount(value) {
  return value === null ? null : count(value);
}
function date(value) {
  if (value === null) return null;
  count(value);
  if (!Number.isFinite(new Date(value).getTime())) invalid();
  return value;
}
function one(value, values) {
  if (!values.includes(value)) invalid();
  return value;
}
function list(value, normalize, max = 65536) {
  if (!Array.isArray(value) || value.length > max) invalid();
  return value.map(normalize);
}
function unique(value, key = (item) => item) {
  if (new Set(value.map(key)).size !== value.length) invalid();
  return value;
}
function bounded(value, max = BOOK_EDITORIAL_ITEM_BYTES) {
  if (encoder.encode(JSON.stringify(value)).length > max) invalid();
  return value;
}
function fields(value, schema) {
  const keys = Object.keys(schema);
  closed(value, keys);
  return Object.fromEntries(
    keys.map((key) => [key, text(value[key], key === 'examples' ? 12000 : 6000)]),
  );
}
/** No sourceToken/contextToken/native path exists in this reference shape. */
export function normalizeBookEditorialReference(raw) {
  closed(raw, ['kind', 'id', 'parentId', 'scope', 'revision', 'contentHash', 'state', 'purpose']);
  closed(raw.scope, ['kind', 'id']);
  const kind = one(raw.kind, BOOK_EDITORIAL_REFERENCE_KINDS),
    scope = {
      kind: one(raw.scope.kind, ['book', 'universe', 'library']),
      id: raw.scope.id === null ? null : id(raw.scope.id),
    };
  const value = {
    kind,
    id: kind === 'artifact' ? hash(raw.id) : id(raw.id),
    parentId: raw.parentId === null ? null : id(raw.parentId),
    scope,
    revision: optionalCount(raw.revision),
    contentHash: raw.contentHash === null ? null : hash(raw.contentHash),
    state: one(raw.state, ['recorded', 'unavailable']),
    purpose: raw.purpose === null ? null : one(raw.purpose, ['source', 'subject']),
  };
  if (
    scope.id === null &&
    !(scope.kind === 'universe' && kind === 'lore' && value.state === 'unavailable')
  )
    invalid();
  if (
    ['sceneLink', 'narrativeLink', 'narrativeControl'].includes(kind) &&
    (scope.kind !== 'book' || value.state !== 'unavailable')
  )
    invalid();
  if (
    (scope.kind === 'universe' && kind !== 'lore') ||
    (scope.kind === 'library' && !['persona', 'image'].includes(kind))
  )
    invalid();
  if (
    (kind === 'arcMilestone') !== (value.parentId !== null) ||
    (kind === 'book' && (scope.kind !== 'book' || value.id !== scope.id)) ||
    (kind === 'artifact' && scope.kind !== 'book')
  )
    invalid();
  return value;
}
const references = (value) =>
  unique(list(value, normalizeBookEditorialReference), (item) => JSON.stringify(item));
function contract(raw) {
  closed(
    raw,
    ['schemaVersion', 'fields', 'decisions'],
    ['collaborationPolicy', 'publicationPolicy'],
  );
  if (raw.schemaVersion !== 1) invalid();
  const decisions = unique(
    list(
      raw.decisions,
      (row) => {
        closed(row, ['id', 'text', 'category', 'status', 'source', 'supersedes']);
        return {
          id: id(row.id),
          text: text(row.text, 4000, true),
          category: one(row.category, EDITORIAL_CATEGORIES),
          status: one(row.status, EDITORIAL_STATUSES),
          source: text(row.source, 1000, true),
          supersedes: row.supersedes === null ? null : id(row.supersedes),
        };
      },
      150,
    ),
    (row) => row.id,
  );
  const byId = new Map(decisions.map((row) => [row.id, row]));
  for (const row of decisions) {
    const seen = new Set([row.id]);
    let next = row.supersedes;
    while (next !== null) {
      if (!byId.has(next) || seen.has(next)) invalid();
      seen.add(next);
      next = byId.get(next).supersedes;
    }
  }
  const value = { schemaVersion: 1, fields: fields(raw.fields, EDITORIAL_FIELDS), decisions };
  if (Object.hasOwn(raw, 'collaborationPolicy') && raw.collaborationPolicy === undefined) invalid();
  if (Object.hasOwn(raw, 'publicationPolicy') && raw.publicationPolicy === undefined) invalid();
  if (Object.hasOwn(raw, 'collaborationPolicy'))
    value.collaborationPolicy = normalizeLiteraryCollaboration(raw.collaborationPolicy);
  if (Object.hasOwn(raw, 'publicationPolicy'))
    value.publicationPolicy = normalizeLiteraryPublicationPolicy(raw.publicationPolicy);
  return bounded(value, MAX_EDITORIAL_BYTES);
}
function plan(raw) {
  closed(raw, ['kind', 'title', 'status', 'fields', 'references']);
  if (!Object.hasOwn(LITERARY_PLAN_SCHEMA, raw.kind)) invalid();
  const refs = references(raw.references);
  if (refs.length > 12) invalid();
  return {
    kind: raw.kind,
    title: text(raw.title, 300, true),
    status: one(raw.status, EDITORIAL_STATUSES),
    fields: fields(raw.fields, LITERARY_PLAN_SCHEMA[raw.kind].fields),
    references: refs,
  };
}
function preparation(raw) {
  closed(raw, ['chapter', 'historicalAcceptance', 'historicalReady', 'notes', 'criteria']);
  if (typeof raw.historicalAcceptance !== 'boolean' || typeof raw.historicalReady !== 'boolean')
    invalid();
  const chapter = normalizeBookEditorialReference(raw.chapter);
  if (chapter.kind !== 'chapter') invalid();
  const criteria = unique(
    list(
      raw.criteria,
      (row) => {
        closed(row, ['id', 'result', 'rationale', 'evidenceIds']);
        if (!Object.hasOwn(LITERARY_GATE_CRITERIA, row.id)) invalid();
        const result = one(row.result, ['pass', 'fail', 'gap', 'notApplicable']),
          rationale = text(row.rationale, 2000, result !== 'gap'),
          evidenceIds = unique(list(row.evidenceIds, hash, 3));
        if (
          (result === 'pass' && !evidenceIds.length) ||
          (result === 'notApplicable' && !LITERARY_GATE_OPTIONAL_CRITERIA.includes(row.id))
        )
          invalid();
        return { id: row.id, result, rationale, evidenceIds };
      },
      Object.keys(LITERARY_GATE_CRITERIA).length,
    ),
    (row) => row.id,
  );
  if (
    criteria.length !== Object.keys(LITERARY_GATE_CRITERIA).length ||
    raw.historicalReady !==
      criteria.every((row) => ['pass', 'notApplicable'].includes(row.result)) ||
    (raw.historicalAcceptance && !raw.historicalReady)
  )
    invalid();
  return {
    chapter,
    historicalAcceptance: raw.historicalAcceptance,
    historicalReady: raw.historicalReady,
    notes: text(raw.notes, 6000),
    criteria,
  };
}
function readerGuide(raw) {
  closed(raw, ['key', 'entry']);
  const key = hash(raw.key);
  if (raw.entry === null) return { key, entry: null };
  const input = raw.entry;
  closed(input, [
    'name',
    'aliases',
    'category',
    'summary',
    'certainty',
    'disambiguation',
    'revealAfter',
    'evidenceIds',
    'facts',
    'relationships',
    'appearances',
  ]);
  const chapter = (value) => {
    const ref = normalizeBookEditorialReference(value);
    if (ref.kind !== 'chapter' || ref.scope.kind !== 'book') invalid();
    return ref;
  };
  const certainty = (value) => one(value, ['fact', 'uncertain']);
  const row = (value, required, optional = []) => closed(value, required, optional);
  const entry = {
    name: text(input.name, 200, true),
    aliases: unique(list(input.aliases, (value) => text(value, 200, true), 20)),
    category: one(input.category, ['character', 'location', 'concept', 'other']),
    summary: text(input.summary, 140, true),
    certainty: certainty(input.certainty),
    disambiguation: text(input.disambiguation, 140),
    revealAfter: chapter(input.revealAfter),
    evidenceIds: unique(list(input.evidenceIds, hash, 8)),
    facts: list(
      input.facts,
      (value) => {
        row(value, ['text', 'certainty', 'chapter', 'evidenceId']);
        return {
          text: text(value.text, 300, true),
          certainty: certainty(value.certainty),
          chapter: chapter(value.chapter),
          evidenceId: hash(value.evidenceId),
        };
      },
      12,
    ),
    relationships: list(
      input.relationships,
      (value) => {
        row(value, ['targetKey', 'description', 'certainty', 'chapter', 'evidenceId']);
        return {
          targetKey: hash(value.targetKey),
          description: text(value.description, 300, true),
          certainty: certainty(value.certainty),
          chapter: chapter(value.chapter),
          evidenceId: hash(value.evidenceId),
        };
      },
      12,
    ),
    appearances: list(
      input.appearances,
      (value) => {
        row(value, ['kind', 'chapter', 'evidenceId']);
        return {
          kind: one(value.kind, ['direct', 'document', 'mention', 'uncertain']),
          chapter: chapter(value.chapter),
          evidenceId: hash(value.evidenceId),
        };
      },
      24,
    ),
  };
  if (!entry.evidenceIds.length) invalid();
  return { key, entry };
}
function document(raw) {
  closed(
    raw,
    ['role', 'title', 'sections', 'references'],
    ['preparation', 'readerGuide', 'editionKey', 'previousEditionKey'],
  );
  const value = {
    role: one(raw.role, [
      'architecture',
      'series',
      'preparation',
      'progress',
      'readerGuide',
      'publicationManifest',
    ]),
    title: text(raw.title, 300, true),
    sections: list(raw.sections, (section) => {
      closed(section, ['label', 'text']);
      return { label: text(section.label, 300, true), text: text(section.text, 180000) };
    }),
    references: references(raw.references),
  };
  if (Object.hasOwn(raw, 'preparation')) {
    if (value.role !== 'preparation') invalid();
    value.preparation = preparation(raw.preparation);
  }
  if (Object.hasOwn(raw, 'readerGuide')) {
    if (value.role !== 'readerGuide') invalid();
    value.readerGuide = readerGuide(raw.readerGuide);
  }
  if (Object.hasOwn(raw, 'editionKey')) {
    if (!['readerGuide', 'publicationManifest'].includes(value.role)) invalid();
    value.editionKey = hash(raw.editionKey);
  }
  if (Object.hasOwn(raw, 'previousEditionKey')) {
    if (value.role !== 'publicationManifest') invalid();
    value.previousEditionKey = hash(raw.previousEditionKey);
  }
  return value;
}
function decision(raw) {
  closed(
    raw,
    ['status', 'category', 'text', 'rationale', 'supersedes', 'evidenceIds'],
    ['annotation', 'references'],
  );
  const value = {
    status: one(raw.status, [
      'proposal',
      'working',
      'approved',
      'gap',
      'needs-review',
      'reviewed',
      'dismissed',
      'open',
      'fixed',
      'accepted',
      'investigating',
      'planned',
      'retained',
      'deferred',
      'correctionConfirmed',
    ]),
    category: raw.category === null ? null : one(raw.category, EDITORIAL_CATEGORIES),
    text: text(raw.text, 12000, true),
    rationale: text(raw.rationale, 12000),
    supersedes: raw.supersedes === null ? null : hash(raw.supersedes),
    evidenceIds: unique(list(raw.evidenceIds, hash)),
  };
  if (Object.hasOwn(raw, 'references')) value.references = references(raw.references);
  if (Object.hasOwn(raw, 'annotation')) {
    const source = raw.annotation;
    closed(source, ['family', 'action', 'state', 'targetType'], ['correction']);
    const family = one(source.family, ['finding', 'impact']),
      action =
        source.action === null
          ? null
          : one(source.action, ['investigate', 'correct', 'retain', 'defer']);
    const state = one(
      source.state,
      family === 'finding'
        ? ['investigating', 'planned', 'retained', 'deferred', 'correctionConfirmed']
        : ['needs-review', 'reviewed', 'dismissed'],
    );
    if (
      state !== value.status ||
      (family === 'finding' && action === null) ||
      (family === 'impact' && action !== null)
    )
      invalid();
    if (
      family === 'finding' &&
      !{
        investigate: ['investigating'],
        correct: ['planned', 'correctionConfirmed'],
        retain: ['retained'],
        defer: ['deferred'],
      }[action].includes(state)
    )
      invalid();
    if (
      family === 'impact' &&
      ['reviewed', 'dismissed'].includes(state) &&
      !value.evidenceIds.length
    )
      invalid();
    value.annotation = {
      family,
      action,
      state,
      targetType: source.targetType === null ? null : text(source.targetType, 160, true),
    };
    if (Object.hasOwn(source, 'correction')) {
      if (family !== 'finding' || action !== 'correct' || state !== 'correctionConfirmed')
        invalid();
      closed(source.correction, ['note', 'confirmedAt']);
      value.annotation.correction = {
        note: source.correction.note === null ? null : text(source.correction.note, 4000),
        confirmedAt: date(source.correction.confirmedAt),
      };
    }
  }
  return value;
}
function evidence(raw) {
  closed(
    raw,
    ['source', 'quote', 'start', 'end', 'offsetUnit', 'classification', 'rationale'],
    ['context'],
  );
  let context;
  if (Object.hasOwn(raw, 'context')) {
    closed(raw.context, ['format', 'documentId', 'offsetBase']);
    if (
      !['plain', 'canonical-json'].includes(raw.context.format) ||
      (raw.start === null) !== (raw.context.offsetBase === null)
    )
      invalid();
    context = {
      format: raw.context.format,
      documentId: text(raw.context.documentId, 4000, true),
      offsetBase: raw.context.offsetBase === null ? null : count(raw.context.offsetBase),
    };
    if (context.offsetBase !== null && context.offsetBase > raw.start) invalid();
  }
  const start = optionalCount(raw.start),
    end = optionalCount(raw.end);
  if (
    (start === null) !== (end === null) ||
    (start !== null && end < start) ||
    (start === null ? raw.offsetUnit !== 'not-recorded' : raw.offsetUnit !== 'utf16')
  )
    invalid();
  return {
    source: normalizeBookEditorialReference(raw.source),
    quote: text(raw.quote, 180000),
    start,
    end,
    offsetUnit: raw.offsetUnit,
    classification: one(raw.classification, [
      'observed',
      'interpretation',
      'proposal',
      'unclassified',
    ]),
    rationale: text(raw.rationale, 12000),
    ...(context ? { context } : {}),
  };
}
export function normalizeBookEditorialReading(raw) {
  closed(raw, [
    'unit',
    'sourceCharacters',
    'segment',
    'segmentCount',
    'start',
    'end',
    'coreStart',
    'coreEnd',
    'completeScene',
    'previousSceneIncluded',
  ]);
  if (
    raw.unit !== 'scene' ||
    typeof raw.completeScene !== 'boolean' ||
    typeof raw.previousSceneIncluded !== 'boolean'
  )
    invalid();
  const value = {
    unit: 'scene',
    ...Object.fromEntries(
      ['sourceCharacters', 'segment', 'segmentCount', 'start', 'end', 'coreStart', 'coreEnd'].map(
        (key) => [key, count(raw[key])],
      ),
    ),
    completeScene: raw.completeScene,
    previousSceneIncluded: raw.previousSceneIncluded,
  };
  if (
    !value.segmentCount ||
    value.segment >= value.segmentCount ||
    value.start > value.coreStart ||
    value.coreStart > value.coreEnd ||
    value.coreEnd > value.end ||
    value.end > value.sourceCharacters ||
    value.completeScene !== (value.coreStart === 0 && value.coreEnd === value.sourceCharacters) ||
    (value.completeScene && (value.segment !== 0 || value.segmentCount !== 1)) ||
    (value.sourceCharacters > 0 && value.coreStart === value.coreEnd)
  )
    invalid();
  return value;
}
function reportSources(raw) {
  const values = references(raw);
  if (values.some((value) => value.kind !== 'artifact' || value.scope.kind !== 'book')) invalid();
  return values;
}
function report(raw) {
  closed(
    raw,
    ['role', 'title', 'summary', 'findings', 'observations', 'claimedCoverage', 'references'],
    ['reading'],
  );
  closed(raw.claimedCoverage, ['scope', 'completed', 'total', 'limitations']);
  const completed = count(raw.claimedCoverage.completed),
    total = count(raw.claimedCoverage.total);
  if (completed > total) invalid();
  if (Object.hasOwn(raw, 'reading')) {
    const reading = normalizeBookEditorialReading(raw.reading);
    if (
      raw.claimedCoverage.scope !== (reading.completeScene ? 'unit' : 'excerpt') ||
      completed !== 1 ||
      total !== reading.segmentCount
    )
      invalid();
  }
  return {
    role: one(raw.role, ['review', 'integration', 'impact', 'analysis']),
    title: text(raw.title, 300, true),
    summary: text(raw.summary, 180000),
    findings: unique(
      list(raw.findings, (item) => {
        closed(
          item,
          ['id', 'severity', 'problem', 'action', 'status', 'evidenceIds'],
          ['reportSources'],
        );
        return {
          id: id(item.id),
          status:
            item.status === null
              ? null
              : one(item.status, [
                  'proposal',
                  'open',
                  'needs-review',
                  'reviewed',
                  'fixed',
                  'dismissed',
                  'accepted',
                ]),
          severity: one(item.severity, ['blocking', 'warning', 'suggestion']),
          problem: text(item.problem, 12000, true),
          action: text(item.action, 12000),
          evidenceIds: unique(list(item.evidenceIds, hash)),
          ...(Object.hasOwn(item, 'reportSources')
            ? { reportSources: reportSources(item.reportSources) }
            : {}),
        };
      }),
      (item) => item.id,
    ),
    observations: list(raw.observations, (item) => {
      closed(item, ['axis', 'text', 'evidenceIds'], ['reportSources']);
      return {
        axis: text(item.axis, 160, true),
        text: text(item.text, 12000, true),
        evidenceIds: unique(list(item.evidenceIds, hash)),
        ...(Object.hasOwn(item, 'reportSources')
          ? { reportSources: reportSources(item.reportSources) }
          : {}),
      };
    }),
    claimedCoverage: {
      scope: one(raw.claimedCoverage.scope, [
        'excerpt',
        'unit',
        'chapter',
        'act',
        'book',
        'registered-dependencies',
        'selected-sources',
        'chapter-scenes',
        'unit-segment',
        'chapter-boundary',
        'architecture-segment',
        'evidence-synthesis',
        'unknown',
      ]),
      completed,
      total,
      limitations: list(raw.claimedCoverage.limitations, (item) => text(item, 4000, true)),
    },
    references: references(raw.references),
    ...(Object.hasOwn(raw, 'reading')
      ? { reading: normalizeBookEditorialReading(raw.reading) }
      : {}),
  };
}
function checkpoint(raw) {
  closed(raw, [
    'process',
    'phase',
    'counters',
    'currentUnit',
    'references',
    'haltReason',
    'nextAction',
    'controlsDisabled',
  ]);
  if (raw.controlsDisabled !== true) invalid();
  closed(
    raw.counters,
    [],
    [
      'steps',
      'applications',
      'creditsSpent',
      'plannedUnits',
      'capturedUnits',
      'verifiedUnits',
      'reviewedUnits',
      'acceptedUnits',
      'adoptedUnits',
      'completedUnits',
      'analyses',
      'words',
    ],
  );
  return {
    process: one(raw.process, [
      'planning',
      'text-assistance',
      'preservation',
      'draft',
      'review',
      'integration',
      'workflow',
      'sequence',
      'publication',
      'impact',
    ]),
    phase: text(raw.phase, 160, true),
    counters: Object.fromEntries(
      Object.keys(raw.counters)
        .sort()
        .map((key) => [key, count(raw.counters[key])]),
    ),
    currentUnit: raw.currentUnit === null ? null : normalizeBookEditorialReference(raw.currentUnit),
    references: references(raw.references),
    haltReason: raw.haltReason === null ? null : text(raw.haltReason, 4000, true),
    nextAction: raw.nextAction === null ? null : text(raw.nextAction, 4000, true),
    controlsDisabled: true,
  };
}
function prose(raw) {
  closed(raw, ['role', 'format', 'text', 'rationale', 'source'], ['reading']);
  const reading = Object.hasOwn(raw, 'reading') ? normalizeBookEditorialReading(raw.reading) : null;
  if (
    reading &&
    (raw.role !== 'saved-copy' ||
      raw.format !== 'plain' ||
      typeof raw.text !== 'string' ||
      raw.text.length !== reading.end - reading.start)
  )
    invalid();
  return {
    role: one(raw.role, ['proposal', 'saved-copy', 'prior-version']),
    format: one(raw.format, ['plain', 'html']),
    text: text(raw.text, BOOK_EDITORIAL_ITEM_BYTES),
    rationale: text(raw.rationale, 12000),
    source: raw.source === null ? null : normalizeBookEditorialReference(raw.source),
    ...(reading ? { reading } : {}),
  };
}
const content = { contract, plan, document, decision, evidence, report, checkpoint, prose };
export function normalizeBookEditorialArtifact(raw) {
  closed(
    raw,
    [
      'schemaVersion',
      'id',
      'kind',
      'revision',
      'createdAt',
      'updatedAt',
      'provenance',
      'availability',
      'content',
    ],
    ['generation', 'lineage'],
  );
  if (raw.schemaVersion !== BOOK_EDITORIAL_VERSION) invalid();
  const kind = one(raw.kind, BOOK_EDITORIAL_ARTIFACT_KINDS);
  closed(
    raw.availability,
    ['state'],
    Object.hasOwn(raw.availability ?? {}, 'reason') ? ['reason'] : [],
  );
  const state = one(raw.availability.state, ['included', 'unavailable']);
  if (
    (state === 'unavailable') !== Object.hasOwn(raw.availability, 'reason') ||
    (state === 'unavailable') !== (raw.content === null)
  )
    invalid();
  const availability =
    state === 'included'
      ? { state }
      : {
          state,
          reason: one(raw.availability.reason, [
            'source-unavailable',
            'source-revoked',
            'not-recorded',
            'unsupported-legacy-schema',
          ]),
        };
  const value = {
    schemaVersion: 1,
    id: hash(raw.id),
    kind,
    revision: optionalCount(raw.revision),
    createdAt: date(raw.createdAt),
    updatedAt: date(raw.updatedAt),
    provenance: one(raw.provenance, ['author', 'ai', 'mixed', 'unknown']),
    availability,
    content: state === 'included' ? content[kind](raw.content) : null,
  };
  if (Object.hasOwn(raw, 'lineage')) {
    if (
      !['contract', 'plan', 'document', 'decision'].includes(kind) ||
      value.revision === null ||
      value.revision < 1
    )
      invalid();
    closed(raw.lineage, ['id', 'role']);
    value.lineage = {
      id: hash(raw.lineage.id),
      role: one(raw.lineage.role, ['current', 'version']),
    };
  }
  if (Object.hasOwn(raw, 'generation')) {
    closed(raw.generation, ['snapshot', 'provider', 'model', 'reasoning']);
    if (raw.generation.snapshot !== 'historical') invalid();
    value.generation = {
      snapshot: 'historical',
      provider: one(raw.generation.provider, ['platform', 'byok']),
      model: text(raw.generation.model, 200, true),
      reasoning:
        raw.generation.reasoning === null ? null : text(raw.generation.reasoning, 80, true),
    };
  }
  return bounded(value);
}
export function normalizeBookEditorialLink(raw) {
  closed(raw, ['schemaVersion', 'id', 'from', 'to', 'relation']);
  if (raw.schemaVersion !== 1) invalid();
  return bounded({
    schemaVersion: 1,
    id: hash(raw.id),
    from: normalizeBookEditorialReference(raw.from),
    to: normalizeBookEditorialReference(raw.to),
    relation: one(raw.relation, BOOK_EDITORIAL_RELATIONS),
  });
}
export function normalizeBookEditorialControl(raw) {
  closed(raw, ['schemaVersion', 'bookId', 'presence', 'artifacts', 'links']);
  if (raw.schemaVersion !== 1) invalid();
  const value = {
    schemaVersion: 1,
    bookId: id(raw.bookId),
    presence: one(raw.presence, ['captured', 'absent-in-legacy']),
    artifacts: count(raw.artifacts),
    links: count(raw.links),
  };
  if (value.presence === 'absent-in-legacy' && (value.artifacts || value.links)) invalid();
  return value;
}
export function bookEditorialArtifactReferences(raw, bookId) {
  id(bookId);
  const item = normalizeBookEditorialArtifact(raw);
  if (item.availability.state !== 'included') return [];
  const body = item.content,
    values = [];
  const artifact = (id) => ({
    kind: 'artifact',
    id,
    parentId: null,
    scope: { kind: 'book', id: bookId },
    revision: null,
    contentHash: null,
    state: 'recorded',
    purpose: 'source',
  });
  if (['plan', 'document', 'report', 'checkpoint'].includes(item.kind))
    values.push(...body.references);
  if (item.kind === 'document' && body.preparation) {
    values.push(body.preparation.chapter);
    for (const row of body.preparation.criteria) values.push(...row.evidenceIds.map(artifact));
  }
  if (item.kind === 'document' && body.readerGuide?.entry) {
    const guide = body.readerGuide.entry;
    values.push(guide.revealAfter, ...guide.evidenceIds.map(artifact));
    for (const row of [...guide.facts, ...guide.relationships, ...guide.appearances])
      values.push(row.chapter, artifact(row.evidenceId));
  }
  if (item.kind === 'evidence') values.push(body.source);
  if (item.kind === 'prose' && body.source) values.push(body.source);
  if (item.kind === 'checkpoint' && body.currentUnit) values.push(body.currentUnit);
  if (item.kind === 'decision') {
    values.push(...(body.references ?? []));
    if (body.supersedes) values.push(artifact(body.supersedes));
    values.push(...body.evidenceIds.map(artifact));
  }
  if (item.kind === 'report') {
    for (const finding of body.findings) values.push(...finding.evidenceIds.map(artifact));
    for (const observation of body.observations)
      values.push(...observation.evidenceIds.map(artifact));
    for (const row of [...body.findings, ...body.observations])
      values.push(...(row.reportSources ?? []));
  }
  return values;
}
