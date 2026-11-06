import {
  normalizeBookEditorialArtifact,
  normalizeBookEditorialLink,
  normalizeBookEditorialReference,
} from './bookEditorialProtocol.mjs';
const encoder = new TextEncoder();
const invalid = () => {
  throw new TypeError('Remapeamento editorial portátil inválido.');
};
function id(value) {
  if (
    typeof value !== 'string' ||
    !value ||
    !value.isWellFormed() ||
    value.includes('/') ||
    ['.', '..'].includes(value) ||
    encoder.encode(value).length > 1500
  )
    invalid();
  return value;
}
function hash(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) invalid();
  return value;
}
const nativeKinds = {
  act: 'act',
  chapter: 'chapter',
  scene: 'scene',
  arc: 'arc',
  arcMilestone: 'milestone',
  event: 'event',
  lore: 'lore',
  historyVersion: 'version',
  persona: 'persona',
  image: 'image',
};
/** Host supplies its verified restore identity projection, never callbacks from file data. */
export function createBookEditorialRemapper(input) {
  const keys = ['sourceBookId', 'bookId', 'hashBytes', 'mapResource'];
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input)) ||
    Object.keys(input).length !== keys.length ||
    Reflect.ownKeys(input).some(
      (key) =>
        !keys.includes(key) || !Object.hasOwn(Object.getOwnPropertyDescriptor(input, key), 'value'),
    )
  )
    invalid();
  const { sourceBookId, bookId, hashBytes, mapResource } = input;
  id(sourceBookId);
  id(bookId);
  if (
    sourceBookId === bookId ||
    typeof hashBytes !== 'function' ||
    typeof mapResource !== 'function'
  )
    invalid();
  const derive = (kind, original, parent = null) => {
    const value = hash(
      hashBytes(
        encoder.encode(
          JSON.stringify({
            domain: 'writer-restored-editorial-v1',
            sourceBookId,
            bookId,
            kind,
            parent,
            original,
          }),
        ),
      ),
    );
    if (value === original) invalid();
    return value;
  };
  function reference(raw) {
    const value = normalizeBookEditorialReference(raw);
    // Neither the same UID nor a matching external ID adopts a live library/universe.
    if (value.kind === 'artifact' && value.scope.kind === 'book' && value.scope.id === sourceBookId)
      return { ...value, id: derive('artifact', value.id), scope: { kind: 'book', id: bookId } };
    if (
      value.state === 'unavailable' ||
      value.scope.kind !== 'book' ||
      value.scope.id !== sourceBookId
    )
      return { ...value, state: 'unavailable' };
    if (value.kind === 'book') return { ...value, id: bookId, scope: { kind: 'book', id: bookId } };
    const next = mapResource(nativeKinds[value.kind], value.id, value.parentId);
    if (next === null) return { ...value, state: 'unavailable' };
    id(next);
    if (next === value.id) invalid();
    const parent = value.parentId === null ? null : mapResource('arc', value.parentId, null);
    if (parent === null && value.parentId !== null) return { ...value, state: 'unavailable' };
    if (parent !== null) {
      id(parent);
      if (parent === value.parentId) invalid();
    }
    return { ...value, id: next, parentId: parent, scope: { kind: 'book', id: bookId } };
  }
  function artifact(raw) {
    const item = normalizeBookEditorialArtifact(raw),
      original = item.id;
    item.id = derive('artifact', original);
    if (item.lineage) item.lineage = { ...item.lineage, id: derive('lineage', item.lineage.id) };
    if (item.content) {
      const body = item.content;
      if (['plan', 'document', 'report', 'checkpoint'].includes(item.kind))
        body.references = body.references.map(reference);
      if (item.kind === 'contract')
        body.decisions = body.decisions.map((row) => ({
          ...row,
          id: derive('decision', row.id),
          supersedes: row.supersedes === null ? null : derive('decision', row.supersedes),
        }));
      if (item.kind === 'decision') {
        if (body.references) body.references = body.references.map(reference);
        if (body.supersedes) body.supersedes = derive('artifact', body.supersedes);
        body.evidenceIds = body.evidenceIds.map((value) => derive('artifact', value));
      }
      if (item.kind === 'document' && body.preparation) {
        body.preparation.chapter = reference(body.preparation.chapter);
        body.preparation.criteria = body.preparation.criteria.map((row) => ({
          ...row,
          evidenceIds: row.evidenceIds.map((value) => derive('artifact', value)),
        }));
      }
      if (item.kind === 'document' && body.previousEditionKey)
        body.previousEditionKey = derive('edition-key', body.previousEditionKey);
      if (item.kind === 'document' && body.editionKey)
        body.editionKey = derive('edition-key', body.editionKey);
      if (item.kind === 'document' && body.readerGuide) {
        body.readerGuide.key = derive('reader-guide-key', body.readerGuide.key);
        const guide = body.readerGuide.entry;
        if (guide) {
          guide.revealAfter = reference(guide.revealAfter);
          guide.evidenceIds = guide.evidenceIds.map((value) => derive('artifact', value));
          for (const row of [...guide.facts, ...guide.relationships, ...guide.appearances]) {
            row.chapter = reference(row.chapter);
            row.evidenceId = derive('artifact', row.evidenceId);
            if (Object.hasOwn(row, 'targetKey'))
              row.targetKey = derive('reader-guide-key', row.targetKey);
          }
        }
      }
      if (item.kind === 'evidence') body.source = reference(body.source);
      if (item.kind === 'prose' && body.source) body.source = reference(body.source);
      if (item.kind === 'checkpoint' && body.currentUnit)
        body.currentUnit = reference(body.currentUnit);
      if (item.kind === 'report') {
        body.findings = body.findings.map((row) => ({
          ...row,
          id: derive('finding', row.id, original),
          evidenceIds: row.evidenceIds.map((value) => derive('artifact', value)),
          ...(row.reportSources ? { reportSources: row.reportSources.map(reference) } : {}),
        }));
        body.observations = body.observations.map((row) => ({
          ...row,
          evidenceIds: row.evidenceIds.map((value) => derive('artifact', value)),
          ...(row.reportSources ? { reportSources: row.reportSources.map(reference) } : {}),
        }));
      }
    }
    return {
      schemaVersion: 1,
      record: normalizeBookEditorialArtifact(item),
      restoration: {
        execution: 'disabled',
        publication: 'private',
        review: 'required',
        historical: true,
      },
    };
  }
  function link(raw) {
    const item = normalizeBookEditorialLink(raw);
    return normalizeBookEditorialLink({
      ...item,
      id: derive('link', item.id),
      from: reference(item.from),
      to: reference(item.to),
    });
  }
  function identity(kind, original) {
    if (!['artifact', 'link'].includes(kind)) invalid();
    return derive(kind, hash(original));
  }
  return Object.freeze({ artifact, link, reference, identity });
}
