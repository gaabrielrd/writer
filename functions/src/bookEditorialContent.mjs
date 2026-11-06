import { bookContentInvalid as bad } from './bookBackupSchema.mjs';
import {
  bookEditorialArtifactReferences,
  normalizeBookEditorialArtifact,
  normalizeBookEditorialLink,
} from './bookEditorialProtocol.mjs';
const count = (value) => {
  if (!Number.isSafeInteger(value) || value < 0) bad();
  return value;
};
const hex = (value) => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) bad();
  return value;
};
const closed = (value, keys) => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    bad();
};
export function createBookEditorialContentState() {
  return { schemaVersion: 1, artifacts: 0, links: 0, closed: false, walk: null };
}
export function validateBookEditorialContentState(value) {
  closed(value, ['schemaVersion', 'artifacts', 'links', 'closed', 'walk']);
  if (value.schemaVersion !== 1 || typeof value.closed !== 'boolean') bad();
  count(value.artifacts);
  count(value.links);
  if (value.walk !== null) {
    closed(value.walk, ['origin', 'at', 'steps']);
    hex(value.walk.origin);
    hex(value.walk.at);
    count(value.walk.steps);
    if (!value.closed || value.walk.steps > value.artifacts) bad();
  }
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
};
/** Trusted temporary index ports only. No project body, checkpoint wire or grant is retained here. */
export function createBookEditorialContent({
  state,
  bookId,
  add,
  get,
  edge,
  row,
  hashJSON,
  totals,
  warnings,
  bookBinding,
}) {
  const bump = (object, key) => {
    object[key] = count(object[key] + 1);
  };
  async function replacement(from, to) {
    hex(from);
    hex(to);
    if (from === to) bad();
    const previous = await get(['editorial-replacement', from]);
    if (previous) {
      if (previous.next !== to) bad();
      return;
    }
    await add(['editorial-replacement', from], { next: to });
    await row({ kind: 'editorial-replacement-chain', id: from });
  }
  async function accept(kind, record, input) {
    if (state.closed) bad();
    if (kind === 'book-editorial') {
      if (
        record.id !== bookId ||
        input.bookId !== bookId ||
        input.presence !== 'captured' ||
        input.artifacts !== state.artifacts ||
        input.links !== state.links
      )
        bad();
      state.closed = true;
      return 0;
    }
    if (record.id !== input.id) bad();
    if (kind === 'book-editorial-artifact') {
      const value = normalizeBookEditorialArtifact(input);
      await add(['editorial-artifact', value.id], {
        kind: value.kind,
        revision: value.revision,
        availability: value.availability.state,
        role: value.kind === 'document' ? (value.content?.role ?? null) : null,
        hash: hashJSON(value),
      });
      if (value.kind === 'document' && value.content?.readerGuide) {
        const guide = value.content.readerGuide,
          key = ['editorial-reader-guide-key', guide.key];
        const binding = {
          lineage: value.lineage?.id ?? value.id,
          editionKey: value.content.editionKey ?? null,
        };
        const previous = await get(key);
        if (
          previous &&
          (previous.lineage !== binding.lineage || previous.editionKey !== binding.editionKey)
        )
          bad();
        if (!previous) await add(key, binding);
        for (const relation of guide.entry?.relationships ?? [])
          await row({
            kind: 'editorial-reader-guide-link',
            target: relation.targetKey,
            editionKey: binding.editionKey,
          });
      }
      if (value.lineage) {
        if (value.kind === 'contract' && value.lineage.role === 'current')
          await add(['editorial-contract-head'], { id: value.id });
        if (value.kind === 'plan' && value.content) {
          const key = ['editorial-lineage-plan-kind', value.lineage.id],
            previous = await get(key);
          if (previous && previous.kind !== value.content.kind) bad();
          if (!previous) await add(key, { kind: value.content.kind });
        }
        if (value.kind === 'document' && value.content) {
          const key = ['editorial-lineage-document-role', value.lineage.id],
            previous = await get(key);
          if (previous && previous.role !== value.content.role) bad();
          const readerGuideKey = value.content.readerGuide?.key ?? null,
            editionKey = value.content.editionKey ?? null;
          if (
            previous &&
            ((previous.readerGuideKey ?? null) !== readerGuideKey ||
              (previous.editionKey ?? null) !== editionKey)
          )
            bad();
          if (!previous) await add(key, { role: value.content.role, readerGuideKey, editionKey });
        }
        if (value.kind === 'decision' && value.content?.annotation) {
          const key = ['editorial-lineage-decision-family', value.lineage.id],
            previous = await get(key);
          if (previous && previous.family !== value.content.annotation.family) bad();
          if (!previous) await add(key, { family: value.content.annotation.family });
        }
        await add(
          ['editorial-lineage-version', value.kind, value.lineage.id, String(value.revision)],
          { id: value.id },
        );
        if (value.lineage.role === 'current')
          await add(['editorial-lineage-head', value.kind, value.lineage.id], {
            id: value.id,
            revision: value.revision,
          });
        await row({
          kind: 'editorial-lineage',
          family: value.kind,
          lineage: value.lineage.id,
          id: value.id,
          revision: value.revision,
        });
      }
      state.artifacts = count(state.artifacts + 1);
      bump(totals, 'editorialArtifacts');
      if (value.availability.state === 'unavailable') bump(warnings, 'editorialUnavailable');
      if (value.kind === 'decision' && value.content?.supersedes)
        await replacement(value.id, value.content.supersedes);
      return bookEditorialArtifactReferences(value, bookId).length;
    }
    if (kind !== 'book-editorial-link') bad();
    const value = normalizeBookEditorialLink(input);
    await add(['editorial-link', value.id], { hash: hashJSON(value) });
    state.links = count(state.links + 1);
    bump(totals, 'editorialLinks');
    await row({ kind: 'editorial-link', from: value.from, to: value.to, relation: value.relation });
    if (
      value.relation === 'supersedes' &&
      [value.from, value.to].every(
        (ref) =>
          ref.kind === 'artifact' &&
          ref.scope.kind === 'book' &&
          ref.scope.id === bookId &&
          ref.state === 'recorded',
      )
    )
      await replacement(value.from.id, value.to.id);
    return 2;
  }
  function descriptors(kind, value) {
    if (kind === 'book-editorial-link')
      return [
        { ref: value.from, expected: null },
        { ref: value.to, expected: null },
      ];
    const refs = bookEditorialArtifactReferences(value, bookId);
    if (value.kind === 'document' && value.content?.readerGuide?.entry) {
      const guide = value.content.readerGuide.entry;
      const expected = [
        ...value.content.references.map(() => null),
        null,
        ...guide.evidenceIds.map(() => 'evidence'),
        ...[...guide.facts, ...guide.relationships, ...guide.appearances].flatMap(() => [
          null,
          'evidence',
        ]),
      ];
      if (expected.length !== refs.length) bad();
      return refs.map((ref, at) => ({ ref, expected: expected[at] }));
    }
    const reportEvidenceEnd =
      value.kind === 'report' && value.content
        ? value.content.references.length +
          [...value.content.findings, ...value.content.observations].reduce(
            (n, row) => n + row.evidenceIds.length,
            0,
          )
        : 0;
    return refs.map((ref, at) => ({
      ref,
      expected:
        value.kind === 'report' && at >= reportEvidenceEnd
          ? 'report'
          : value.kind === 'decision'
            ? at < (value.content.references?.length ?? 0)
              ? null
              : value.content.supersedes && at === (value.content.references?.length ?? 0)
                ? 'decision'
                : 'evidence'
            : (value.kind === 'report' && at >= value.content.references.length) ||
                (value.kind === 'document' &&
                  value.content.preparation &&
                  at > value.content.references.length)
              ? 'evidence'
              : null,
    }));
  }
  async function reference({ ref, expected }) {
    if (ref.state === 'unavailable') {
      bump(warnings, 'editorialUnavailable');
      return;
    }
    if (ref.scope.kind !== 'book' || ref.scope.id !== bookId) {
      bump(warnings, 'editorialExternal');
      return;
    }
    if (ref.kind !== 'artifact' || ref.contentHash !== null)
      bump(warnings, 'editorialUnverifiedVersions');
    if (ref.kind === 'book') return;
    if (ref.kind === 'image') {
      const book = bookBinding();
      if (!book || book.cover.kind !== 'library' || book.coverImageId !== ref.id) bad();
      return;
    }
    const key =
      ref.kind === 'artifact'
        ? ['editorial-artifact', ref.id]
        : ref.kind === 'persona'
          ? ['profile', ref.id]
          : ref.kind === 'historyVersion'
            ? ['version', ref.id]
            : ['node', nativeKinds[ref.kind], ref.parentId ?? '', ref.id];
    if (key.some((value) => typeof value !== 'string')) bad();
    await edge(
      key,
      true,
      false,
      ref.kind === 'artifact' ? { editorial: true, kind: expected, revision: ref.revision } : null,
    );
  }
  async function advance(kind, value, start, end) {
    const refs = descriptors(kind, value);
    for (let at = start; at < end; at++) await reference(refs[at]);
    return refs.length;
  }
  async function validateEdge(target, expected) {
    if (!target) bad();
    if (expected.kind && target.kind !== expected.kind) bad();
    if (expected.revision !== null && target.revision !== expected.revision) bad();
    if (target.availability === 'unavailable') bump(warnings, 'editorialUnavailable');
  }
  async function artifactMeta(ref) {
    if (
      ref.state !== 'recorded' ||
      ref.scope.kind !== 'book' ||
      ref.scope.id !== bookId ||
      ref.kind !== 'artifact'
    )
      return null;
    const value = await get(['editorial-artifact', ref.id]);
    if (!value) bad();
    return value;
  }
  async function oneRow(item) {
    if (item.kind === 'editorial-reader-guide-link') {
      const target = await get(['editorial-reader-guide-key', item.target]);
      if (!target) bump(warnings, 'editorialUnavailable');
      else if (target.editionKey !== item.editionKey) bad();
      return true;
    }
    if (item.kind === 'editorial-lineage') {
      const head = await get(['editorial-lineage-head', item.family, item.lineage]);
      if (head && item.revision > head.revision) bad();
      return true;
    }
    if (item.kind === 'editorial-link') {
      const from = await artifactMeta(item.from),
        to = await artifactMeta(item.to);
      if (item.relation === 'supersedes' && from && to && from.kind !== to.kind) bad();
      if (item.relation === 'supports' && from && from.kind !== 'evidence') bad();
      if (item.relation === 'supports' && to && !['report', 'decision'].includes(to.kind)) bad();
      if (item.relation === 'reviews' && from && from.kind !== 'report') bad();
      if (
        item.relation === 'publishes' &&
        from &&
        (from.kind !== 'document' || from.role !== 'publicationManifest')
      )
        bad();
      return true;
    }
    if (item.kind !== 'editorial-replacement-chain') bad();
    if (state.walk === null) {
      const first = await get(['editorial-replacement', item.id]);
      if (!first) bad();
      state.walk = { origin: item.id, at: hex(first.next), steps: 0 };
    }
    const walk = state.walk;
    if (walk.origin !== item.id || walk.at === item.id || walk.steps >= state.artifacts) bad();
    const next = await get(['editorial-replacement', walk.at]);
    if (!next) {
      state.walk = null;
      return true;
    }
    walk.at = hex(next.next);
    walk.steps = count(walk.steps + 1);
    return false;
  }
  return { accept, descriptors, advance, validateEdge, oneRow };
}
