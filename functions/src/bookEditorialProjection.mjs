import { LITERARY_PROGRESS_STAGES } from './literaryProgress.mjs';
import { digest, workId, workRevision } from './workProgressContracts.mjs';
import { EDITORIAL_FIELDS } from './literaryEditorialFields.mjs';
import { LITERARY_PLAN_SCHEMA } from './literaryPlanFields.mjs';
import { literaryReference } from './literaryPlanningSchema.mjs';
import { validateLiteraryVolumeReference } from './literaryVolumeProtocol.mjs';
import {
  normalizeBookEditorialArtifact,
  normalizeBookEditorialReference,
} from './bookEditorialProtocol.mjs';
const invalid = () => {
  throw new TypeError('Origem editorial não representável no backup.');
};
const own = (value, key) => Object.hasOwn(value, key);
function lineage(bookId, bookBirth, kind, id) {
  workId(bookId);
  workId(id);
  if (
    !bookBirth ||
    !Number.isSafeInteger(bookBirth.seconds) ||
    bookBirth.seconds < 0 ||
    !Number.isInteger(bookBirth.nanoseconds) ||
    bookBirth.nanoseconds < 0 ||
    bookBirth.nanoseconds >= 1e9
  )
    invalid();
  return digest({
    domain: 'writer-editorial-lineage-v1',
    bookId,
    bookBirth: { seconds: bookBirth.seconds, nanoseconds: bookBirth.nanoseconds },
    kind,
    id,
  });
}
function envelope(bookId, bookBirth, kind, id, value, role, content) {
  if (!['current', 'version'].includes(role)) invalid();
  const revision = workRevision(value.revision);
  if (revision < 1) invalid();
  const identity = bookEditorialRecordIdentity({ bookId, bookBirth, kind, id, revision });
  return normalizeBookEditorialArtifact({
    schemaVersion: 1,
    id: identity.id,
    kind,
    revision,
    createdAt: own(value, 'createdAt') ? value.createdAt : null,
    updatedAt: own(value, 'updatedAt') ? value.updatedAt : null,
    provenance: 'unknown',
    availability: { state: 'included' },
    lineage: { id: identity.lineage, role },
    content,
  });
}
/** Whitelist saved author-owned content only. Native execution context is never spread. */
export function projectBookEditorialContract({ bookId, bookBirth, value, role }) {
  const source = value?.contract;
  if (!source) invalid();
  const content = {
    schemaVersion: source.schemaVersion,
    fields: Object.fromEntries(
      Object.keys(EDITORIAL_FIELDS).map((key) => [key, source.fields?.[key]]),
    ),
    decisions: source.decisions.map((row) => ({
      id: row.id,
      text: row.text,
      category: row.category,
      status: row.status,
      source: row.source,
      supersedes: row.supersedes,
    })),
  };
  for (const key of ['collaborationPolicy', 'publicationPolicy'])
    if (own(source, key)) content[key] = source[key];
  return envelope(bookId, bookBirth, 'contract', 'current', value, role, content);
}
/** Convert identity descriptors; sourceToken is never a portable content hash.
 * An unknown legacy universe remains null/unavailable, rather than another world.
 */
export function projectBookEditorialPlanReference(bookId, universeId, raw, state) {
  if (!['recorded', 'unavailable'].includes(state)) invalid();
  const reference = literaryReference(raw);
  let kind = reference.kind,
    id = reference.id,
    scope;
  if (kind === 'volumeUnit') {
    const source = validateLiteraryVolumeReference(reference);
    kind = source.kind;
    id = source.id;
    scope = { kind: 'book', id: source.bookId };
  } else if (kind === 'globalLore') {
    kind = 'lore';
    scope = { kind: 'universe', id: reference.scopeId ?? universeId ?? null };
    if (scope.id === null) state = 'unavailable';
  } else {
    if (kind === 'localLore') kind = 'lore';
    scope = { kind: 'book', id: reference.scopeId ?? bookId };
  }
  return normalizeBookEditorialReference({
    kind,
    id,
    parentId: null,
    scope,
    revision: reference.revision,
    contentHash: null,
    state,
    purpose: reference.purpose,
  });
}
export function projectBookEditorialPlan({
  bookId,
  bookBirth,
  universeId = null,
  id,
  value,
  role,
  referenceStates,
}) {
  const source = value?.plan;
  if (
    !source ||
    !Object.hasOwn(LITERARY_PLAN_SCHEMA, source.kind) ||
    value.id !== id ||
    value.schemaVersion !== 1 ||
    !Array.isArray(source.references) ||
    !Array.isArray(referenceStates) ||
    referenceStates.length !== source.references.length
  )
    invalid();
  const content = {
    kind: source.kind,
    title: source.title,
    status: source.status,
    fields: Object.fromEntries(
      Object.keys(LITERARY_PLAN_SCHEMA[source.kind].fields).map((key) => [
        key,
        source.fields?.[key],
      ]),
    ),
    references: [
      ...new Map(
        source.references.map((reference, index) => {
          const ref = projectBookEditorialPlanReference(
            bookId,
            universeId,
            reference,
            referenceStates[index],
          );
          return [JSON.stringify(ref), ref];
        }),
      ).values(),
    ],
  };
  return envelope(bookId, bookBirth, 'plan', id, value, role, content);
}

/** Shared deterministic identities for source projection and archival references. */
export function bookEditorialRecordIdentity({ bookId, bookBirth, kind, id, revision }) {
  if (!['contract', 'plan', 'document', 'decision'].includes(kind) || workRevision(revision) < 1)
    invalid();
  const logical = lineage(bookId, bookBirth, kind, id);
  return {
    lineage: logical,
    id: digest({ domain: 'writer-editorial-artifact-v1', lineage: logical, revision }),
  };
}
const progressLogicalId = (noteId) =>
  digest({ domain: 'writer-editorial-progress-document-v1', noteId: workId(noteId) });
export function bookEditorialProgressIdentity({ bookId, bookBirth, noteId, revision }) {
  return bookEditorialRecordIdentity({
    bookId,
    bookBirth,
    kind: 'document',
    id: progressLogicalId(noteId),
    revision,
  });
}
export function projectBookEditorialProgressNote({
  bookId,
  bookBirth,
  id,
  value,
  role,
  association,
  resourceState,
}) {
  const notes = value?.notes,
    source = value?.artifact;
  if (
    value?.version !== 1 ||
    !source ||
    !LITERARY_PROGRESS_STAGES.includes(source.stage) ||
    !notes ||
    !Array.isArray(notes.blockers) ||
    notes.blockers.length > 12 ||
    typeof notes.nextStep !== 'string' ||
    notes.nextStep.length > 4000 ||
    notes.blockers.some((text) => typeof text !== 'string' || text.length > 600) ||
    value.blockerCount !== notes.blockers.length ||
    value.hasNextStep !== !!notes.nextStep ||
    !['recorded', 'unavailable'].includes(resourceState)
  )
    invalid();
  if (!source.resource || !['book', 'chapter', 'act'].includes(source.resource.kind)) invalid();
  const subject = normalizeBookEditorialReference(association);
  if (subject.kind !== 'artifact' || subject.scope.kind !== 'book' || subject.scope.id !== bookId)
    invalid();
  const resource = normalizeBookEditorialReference({
    kind: source.resource.kind,
    id: source.resource.id,
    parentId: null,
    scope: { kind: 'book', id: source.resource.kind === 'book' ? source.resource.id : bookId },
    revision: null,
    contentHash: null,
    state: resourceState,
    purpose: 'subject',
  });
  const content = {
    role: 'progress',
    title: 'Anotação de progresso',
    sections: [
      { label: 'Etapa', text: source.stage },
      ...notes.blockers.map((text) => ({ label: 'Bloqueio', text })),
      { label: 'Próximo passo', text: notes.nextStep },
    ],
    references: [subject, resource],
  };
  return envelope(bookId, bookBirth, 'document', progressLogicalId(id), value, role, content);
}

/** Internal archival IDs only; birth witnesses are never portable authorization. */
export function bookEditorialProseArtifactIdentity({ bookId, bookBirth, birth, id, part }) {
  return digest({
    domain: 'writer-editorial-prose-artifact-v1',
    bookId,
    bookBirth,
    birth,
    id,
    part,
  });
}
export function bookEditorialReviewArtifactIdentity({
  bookId,
  bookBirth,
  birth,
  id,
  family,
  part,
}) {
  return digest({
    domain: 'writer-editorial-review-artifact-v1',
    bookId,
    bookBirth,
    birth,
    id,
    family,
    part,
  });
}

export function bookEditorialIntegrationArtifactIdentity({
  bookId,
  bookBirth,
  birth,
  id,
  family,
  part,
}) {
  return digest({
    domain: 'writer-editorial-integration-artifact-v1',
    bookId,
    bookBirth,
    birth,
    id,
    family,
    part,
  });
}
