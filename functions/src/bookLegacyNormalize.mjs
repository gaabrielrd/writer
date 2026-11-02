import { readBookLegacyCatalogItem, legacyPick as pick } from './bookLegacyCatalog.mjs';
import { encodeBookBackupJSON } from './bookBackupStructure.mjs';
import { BOOK_RESOURCE_KINDS } from './bookBackupResources.mjs';
import {
  bookContentInvalid as bad,
  bookContentClosed as closed,
  bookContentCount as count,
  bookContentId as id,
  validateBookBackupJSONItem as validate,
} from './bookBackupSchema.mjs';
const phases = [
  'profiles',
  'groups',
  'metadata',
  'acts',
  'chapters',
  'group-control',
  'lore',
  'sources',
  'scenes',
  'arcs',
  'milestones',
  'events',
  'resources-summary',
  'bind-book',
  'bind-chapters',
  'bind-sources',
  'personas-summary',
  'universe',
  'history',
  'draft',
  'cover',
  'done',
];
const scopes = ['book', 'chapter', 'scene-source'];
const chapterFields = [
  'title',
  'order',
  'content',
  'createdAt',
  'updatedAt',
  'actId',
  'personaComplement',
  'contentMode',
  'assemblyRevision',
  'structureRevision',
  'rankSlot',
];
const bookFields = [
  'title',
  'genre',
  'synopsis',
  'createdAt',
  'updatedAt',
  'personaId',
  'universeId',
];
const common = ['schemaVersion', 'revision', 'title', 'createdAt', 'updatedAt'];
const sectionFor = {
  profiles: 'personas',
  'group-control': 'groups',
  'bind-chapters': 'chapters',
  'bind-sources': 'sources',
};
const fanout = ['scenes', 'arcs', 'milestones', 'events'];
function hashOf(value, hash) {
  const h = hash.create();
  try {
    h.update(
      value instanceof Uint8Array
        ? value
        : new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)),
    );
    const result = h.digest();
    if (typeof result !== 'string' || !/^[a-f0-9]{64}$/.test(result)) bad();
    return result;
  } finally {
    h.destroy();
  }
}
function descriptor(catalog) {
  if (
    catalog.schemaVersion !== 1 ||
    catalog.provenance?.format !== 'writer-book-backup' ||
    ![1, 2, 3, 4, 5, 6].includes(catalog.provenance.version)
  )
    bad();
  id(catalog.bookId);
  closed(catalog.counts, [
    'chapters',
    'lore',
    'personas',
    'acts',
    'groups',
    'scenes',
    'sources',
    'arcs',
    'milestones',
    'events',
  ]);
  Object.values(catalog.counts).forEach(count);
  return {
    schemaVersion: 1,
    counts: catalog.counts,
    provenance: catalog.provenance,
    bookId: catalog.bookId,
    bookPersonaId: catalog.bookPersonaId,
    bookUniverseId: catalog.bookUniverseId,
    cover: catalog.cover,
    present: [...catalog.present],
  };
}
export function createBookLegacyNormalizationState(catalog, { hash, version = 2 }) {
  if (![1, 2].includes(version)) bad();
  const view = descriptor(catalog);
  return {
    schemaVersion: version,
    contextHash: hashOf(view, hash),
    phase: 'profiles',
    position: 0,
    part: 0,
    reference: 0,
    sourceHash: null,
    emitted: 0,
    resources: Object.fromEntries(BOOK_RESOURCE_KINDS.map((k) => [k, 0])),
    bindings: Object.fromEntries(scopes.map((k) => [k, 0])),
    usedProfiles: 0,
    legacyWarnings: {
      resolvedLabelsIgnored: 0,
      unusedProfiles: 0,
      renderedAssemblies: 0,
      derivedRankBuffers: count(
        view.counts.scenes + view.counts.arcs + view.counts.milestones + view.counts.events,
      ),
    },
  };
}
function checkedCursor(cursor, catalog, hash) {
  closed(cursor, [
    'schemaVersion',
    'contextHash',
    'phase',
    'position',
    'part',
    'reference',
    'sourceHash',
    'emitted',
    'resources',
    'bindings',
    'usedProfiles',
    'legacyWarnings',
  ]);
  if (
    ![1, 2].includes(cursor.schemaVersion) ||
    cursor.contextHash !== hashOf(descriptor(catalog), hash) ||
    !phases.includes(cursor.phase) ||
    new TextEncoder().encode(JSON.stringify(cursor)).length > 16384
  )
    bad();
  for (const key of ['position', 'part', 'reference', 'emitted', 'usedProfiles'])
    count(cursor[key]);
  closed(cursor.resources, BOOK_RESOURCE_KINDS);
  closed(cursor.bindings, scopes);
  closed(cursor.legacyWarnings, [
    'resolvedLabelsIgnored',
    'unusedProfiles',
    'renderedAssemblies',
    'derivedRankBuffers',
  ]);
  for (const values of [cursor.resources, cursor.bindings, cursor.legacyWarnings])
    Object.values(values).forEach(count);
  const section = sectionFor[cursor.phase] ?? cursor.phase;
  if (
    cursor.position > (Object.hasOwn(catalog.counts, section) ? catalog.counts[section] : 0) ||
    cursor.usedProfiles > catalog.counts.personas ||
    cursor.legacyWarnings.renderedAssemblies > catalog.counts.chapters ||
    cursor.legacyWarnings.unusedProfiles > catalog.counts.personas ||
    cursor.legacyWarnings.derivedRankBuffers !==
      count(
        catalog.counts.scenes +
          catalog.counts.arcs +
          catalog.counts.milestones +
          catalog.counts.events,
      ) ||
    (cursor.sourceHash !== null &&
      (typeof cursor.sourceHash !== 'string' || !/^[a-f0-9]{64}$/.test(cursor.sourceHash)))
  )
    bad();
  if (fanout.includes(cursor.phase)) {
    if (
      cursor.part > (cursor.phase === 'scenes' ? 3 : 1) ||
      (cursor.part === 0) !== (cursor.sourceHash === null) ||
      (cursor.part !== (cursor.phase === 'scenes' ? 3 : 1) && cursor.reference !== 0)
    )
      bad();
  } else if (cursor.part !== 0 || cursor.reference !== 0 || cursor.sourceHash !== null) bad();
  return structuredClone(cursor);
}
/** One preprocessing action or one logical record. Cursor contains metadata only. */
async function normalizationStep(source, catalog, cursor, { index, hash, signal }, writable) {
  const next = checkedCursor(cursor, catalog, hash),
    { bookId, counts } = catalog;
  const check = () => signal?.throwIfAborted();
  check();
  const item = (section, position = 0) =>
    readBookLegacyCatalogItem(source, catalog, section, position, { index, signal });
  const get = async (key) => {
    check();
    const v = await index.get(key);
    check();
    return v;
  };
  const add = async (key, v) => {
    check();
    if (writable) await index.add(key, v);
    else {
      const existing = await index.get(key);
      if (existing === undefined || hashOf(existing, hash) !== hashOf(v, hash)) bad();
    }
    check();
  };
  const digest = (v) => hashOf(v, hash),
    address = (values) => digest(JSON.stringify(values));
  const move = () => {
    next.phase = phases[phases.indexOf(next.phase) + 1];
    next.position = 0;
    next.part = 0;
    next.reference = 0;
    next.sourceHash = null;
  };
  const advance = () => {
    next.position = count(next.position + 1);
    next.part = 0;
    next.reference = 0;
    next.sourceHash = null;
  };
  const origin = () => ({
    schemaVersion: 1,
    phase: next.phase,
    position: next.position,
    part: next.part,
    reference: next.reference,
  });
  function output(kind, entityId, value, where = origin()) {
    let bytes;
    try {
      ({ bytes } = encodeBookBackupJSON(value));
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) bad();
      throw error;
    }
    next.emitted = count(next.emitted + 1);
    return {
      record: { kind, id: entityId, part: 0 },
      value,
      bytes,
      valueHash: digest(bytes),
      origin: where,
    };
  }
  function resource(kind, entityId, data, parentId = null) {
    next.resources[kind] = count(next.resources[kind] + 1);
    return output('book-' + kind, address([kind, parentId, entityId]), {
      schemaVersion: 1,
      kind,
      parentId,
      id: entityId,
      data,
    });
  }
  function witness(value) {
    const actual = digest(value);
    if (next.sourceHash !== null && next.sourceHash !== actual) bad();
    next.sourceHash = actual;
  }
  async function availability(personaId, overrides = []) {
    if (next.schemaVersion < 2 || !personaId) return undefined;
    const found = await get(['legacy-profile', personaId]);
    if (!found) return { schemaVersion: 1, personaId, reason: 'profile-not-recorded' };
    if (!Array.isArray(overrides)) bad();
    const profile = await item('personas', found.position);
    if (overrides.some((o) => !profile.traits.some((t) => t.id === o.traitId)))
      return { schemaVersion: 1, personaId, reason: 'legacy-overrides' };
    return undefined;
  }
  // v1 replay retains its literal old output. v2 carries explicit portable absence.
  async function original(position) {
    const value = await item('sources', position);
    closed(value, ['id', 'content', 'hash', 'original']);
    id(value.id);
    closed(
      value.original,
      ['title', 'order'],
      chapterFields.filter((k) => k !== 'content').concat(['id', 'bookId', 'wordCount']),
    );
    if (
      Object.hasOwn(value.original, 'content') ||
      (value.original.id !== undefined && value.original.id !== value.id) ||
      (value.original.bookId !== undefined && value.original.bookId !== bookId)
    )
      bad();
    if (value.original.wordCount !== undefined) count(value.original.wordCount);
    const marker = await availability(
      value.original.personaComplement?.personaId,
      value.original.personaComplement?.overrides,
    );
    return {
      id: value.id,
      data: {
        hash: value.hash,
        original: {
          ...pick(
            value.original,
            chapterFields.filter((k) => k !== 'content'),
          ),
          content: value.content,
          ...(marker ? { personaAvailability: marker } : {}),
        },
      },
    };
  }
  async function chapter(position) {
    const value = await item('chapters', position);
    closed(
      value,
      ['id', 'title', 'order', 'content'],
      chapterFields.filter((k) => !['title', 'order', 'content'].includes(k)),
    );
    id(value.id);
    if (
      (value.personaComplement && catalog.provenance.version < 3) ||
      (value.actId && catalog.provenance.version < 4) ||
      (value.contentMode === 'scenes' && catalog.provenance.version < 5)
    )
      bad();
    const data = pick(value, chapterFields),
      group = await get(['legacy-group', value.id]);
    if (group) {
      if (
        group.contentMode !== (value.contentMode ?? 'legacy') ||
        group.order !== value.order ||
        group.titleHash !== digest(value.title) ||
        group.actId !== (value.actId ?? null)
      )
        bad();
      for (const key of ['assemblyRevision', 'structureRevision'])
        if (value[key] !== undefined && value[key] !== group[key]) bad();
      data.rankSlot = group.rankSlot;
    }
    const marker = await availability(
      data.personaComplement?.personaId,
      data.personaComplement?.overrides,
    );
    if (marker) data.personaAvailability = marker;
    return { id: value.id, data };
  }

  async function bind(scope, ownerId, personaId) {
    if (!personaId) return null;
    const found = await get(['legacy-profile', personaId]);
    if (!found) return null;
    const profile = await item('personas', found.position),
      used = await get(['legacy-used-profile', personaId]);
    if (!used) {
      await add(['legacy-used-profile', personaId], {});
      next.usedProfiles = count(next.usedProfiles + 1);
    }
    next.bindings[scope] = count(next.bindings[scope] + 1);
    return output('book-persona', address([scope, ownerId]), {
      schemaVersion: 1,
      scope,
      ownerId,
      personaId,
      profile,
    });
  }
  let result = null;
  // At most the fixed phase count can be skipped; no loop over an unbounded section.
  for (let skipped = 0; skipped < phases.length; skipped++) {
    const phase = next.phase,
      section = sectionFor[phase] ?? phase;
    if (phase === 'done') break;
    if (Object.hasOwn(counts, section) && next.position === counts[section]) {
      move();
      continue;
    }
    if (phase === 'profiles') {
      const profile = await item('personas', next.position);
      validate(
        'book-persona',
        { schemaVersion: 1, scope: 'book', ownerId: bookId, personaId: profile?.id, profile },
        bookId,
      );
      await add(['legacy-profile', profile.id], { position: next.position });
      advance();
    } else if (phase === 'groups') {
      const group = await item('groups', next.position);
      closed(
        group,
        [
          'id',
          'title',
          'kind',
          'contentMode',
          'assemblyRevision',
          'structureRevision',
          'wordCount',
          'sceneCount',
          'rankSlot',
          'order',
          'updatedAt',
        ],
        ['actId'],
      );
      if (group.id === null ? group.kind !== 'unassigned' : group.kind !== 'chapter') bad();
      if (group.id !== null) id(group.id);
      if (!['A', 'B'].includes(group.rankSlot) || !['legacy', 'scenes'].includes(group.contentMode))
        bad();
      ['assemblyRevision', 'structureRevision', 'wordCount', 'sceneCount'].forEach((k) =>
        count(group[k]),
      );
      validate('chapter', pick(group, chapterFields), bookId);
      await add(['legacy-group', group.id ?? ''], {
        contentMode: group.contentMode,
        order: group.order,
        titleHash: digest(group.title),
        actId: group.actId ?? null,
        rankSlot: group.rankSlot,
        assemblyRevision: group.assemblyRevision,
        structureRevision: group.structureRevision,
      });
      advance();
    } else if (phase === 'metadata') {
      const book = await item('book'),
        marker = await availability(book.personaId);
      result = output('book-metadata', bookId, {
        book: { ...pick(book, bookFields), ...(marker ? { personaAvailability: marker } : {}) },
        progress: {},
        cover: catalog.cover,
      });
      move();
    } else if (phase === 'acts') {
      const act = await item('acts', next.position);
      closed(act, ['id', 'name', 'order'], ['createdAt', 'updatedAt']);
      id(act.id);
      result = output('act', act.id, pick(act, ['name', 'order', 'createdAt', 'updatedAt']));
      advance();
    } else if (phase === 'chapters') {
      const value = await chapter(next.position);
      await add(['legacy-chapter', value.id], {});
      if (value.data.contentMode === 'scenes')
        next.legacyWarnings.renderedAssemblies = count(next.legacyWarnings.renderedAssemblies + 1);
      result = output('chapter', value.id, value.data);
      advance();
    } else if (phase === 'group-control') {
      const group = await item('groups', next.position);
      if (group.id === null)
        result = resource('scene-control', 'unassigned', { rankSlot: group.rankSlot });
      else if (!(await get(['legacy-chapter', group.id]))) bad();
      advance();
    } else if (phase === 'lore') {
      const lore = await item('lore', next.position);
      const fields = [
        'name',
        'category',
        'aliases',
        'summary',
        'details',
        'structuredDetails',
        'relations',
        'isPublic',
        'createdAt',
        'updatedAt',
      ];
      closed(
        lore,
        ['id', 'name', 'category'],
        fields.filter((k) => !['name', 'category'].includes(k)),
      );
      id(lore.id);
      result = resource('lore', lore.id, pick(lore, fields));
      advance();
    } else if (phase === 'sources') {
      const value = await original(next.position);
      result = resource('scene-source', value.id, value.data);
      advance();
    } else if (phase === 'scenes') {
      const scene = await item('scenes', next.position);
      closed(
        scene,
        [
          'id',
          ...common,
          'parentId',
          'stage',
          'archived',
          'rank',
          'wordCount',
          'bodyHash',
          'bodyBytes',
          'content',
          'planning',
          'references',
        ],
        ['formerParentId'],
      );
      id(scene.id);
      count(scene.wordCount);
      if (!Array.isArray(scene.references)) bad();
      witness(scene);
      if (next.part === 0) {
        const data = {
          ...pick(
            scene,
            common.concat([
              'parentId',
              'stage',
              'archived',
              'bodyHash',
              'bodyBytes',
              'formerParentId',
            ]),
          ),
          rankA: scene.rank,
          rankB: scene.rank,
        };
        result = resource('scene', scene.id, data);
        next.part = 1;
      } else if (next.part === 1) {
        result = resource(
          'scene-body',
          'current',
          { content: scene.content, hash: scene.bodyHash },
          scene.id,
        );
        next.part = 2;
      } else if (next.part === 2) {
        result = resource('scene-planning', 'current', scene.planning, scene.id);
        if (scene.references.length) next.part = 3;
        else advance();
      } else {
        const reference = scene.references[next.reference];
        closed(reference, ['id', 'reference', 'available'], ['name', 'category']);
        id(reference.id);
        if (
          typeof reference.available !== 'boolean' ||
          (reference.name !== undefined && typeof reference.name !== 'string') ||
          (reference.category !== undefined && typeof reference.category !== 'string')
        )
          bad();
        if (reference.name !== undefined || reference.category !== undefined)
          next.legacyWarnings.resolvedLabelsIgnored = count(
            next.legacyWarnings.resolvedLabelsIgnored + 1,
          );
        result = resource('scene-reference', reference.id, reference.reference, scene.id);
        next.reference = count(next.reference + 1);
        if (next.reference === scene.references.length) advance();
      }
    } else if (['arcs', 'milestones', 'events'].includes(phase)) {
      const kind = { arcs: 'arc', milestones: 'milestone', events: 'event' }[phase];
      const fields = {
        arc: ['initialState', 'objective', 'plannedOutcome'],
        milestone: ['arcId', 'notes'],
        event: ['description', 'dateLabel'],
      }[kind];
      const value = await item(phase, next.position);
      closed(value, ['id', 'kind', ...common, 'rank', 'references', ...fields]);
      id(value.id);
      if (value.kind !== kind || !Array.isArray(value.references)) bad();
      witness(value);
      if (next.part === 0) {
        result = resource(
          kind,
          value.id,
          { ...pick(value, common.concat(fields)), rankA: value.rank, rankB: value.rank },
          kind === 'milestone' ? value.arcId : null,
        );
        if (value.references.length) next.part = 1;
        else advance();
      } else {
        if (next.reference >= value.references.length) bad();
        const sourceRef = {
            kind,
            id: value.id,
            ...(kind === 'milestone' ? { arcId: value.arcId } : {}),
          },
          reference = value.references[next.reference];
        result = resource('narrative-link', address([sourceRef, reference]), {
          source: sourceRef,
          reference,
        });
        next.reference = count(next.reference + 1);
        if (next.reference === value.references.length) advance();
      }
    } else if (phase === 'resources-summary') {
      result = output('book-resources', bookId, {
        schemaVersion: 1,
        counts: structuredClone(next.resources),
      });
      move();
    } else if (phase === 'bind-book') {
      result = await bind('book', bookId, catalog.bookPersonaId);
      move();
    } else if (phase === 'bind-chapters') {
      const value = await chapter(next.position);
      result = await bind('chapter', value.id, value.data.personaComplement?.personaId);
      advance();
    } else if (phase === 'bind-sources') {
      const value = await original(next.position);
      result = await bind(
        'scene-source',
        value.id,
        value.data.original.personaComplement?.personaId,
      );
      advance();
    } else if (phase === 'personas-summary') {
      result = output('book-personas', bookId, {
        schemaVersion: 1,
        owners: { book: 1, chapter: counts.chapters, 'scene-source': counts.sources },
        bindings: structuredClone(next.bindings),
      });
      move();
    } else if (phase === 'universe') {
      result = output('book-universe', bookId, {
        schemaVersion: 1,
        origin: catalog.bookUniverseId
          ? { kind: 'unavailable', id: catalog.bookUniverseId }
          : { kind: 'none' },
      });
      move();
    } else if (phase === 'history') {
      result = output('work-history', bookId, {
        schemaVersion: 1,
        versions: 0,
        byteLength: 0,
        chunkCount: 0,
      });
      move();
    } else if (phase === 'draft') {
      result = output('book-draft', bookId, { schemaVersion: 1, state: 'none' });
      move();
    } else if (phase === 'cover') {
      result = output('book-cover', bookId, { schemaVersion: 1, cover: catalog.cover });
      move();
      next.legacyWarnings.unusedProfiles = counts.personas - next.usedProfiles;
    } else bad();
    break;
  }
  check();
  return { cursor: checkedCursor(next, catalog, hash), item: result };
}

/** Advance with buffered/private index effects; the host commits them atomically. */
export function readBookLegacyNormalizationStep(source, catalog, cursor, options) {
  return normalizationStep(source, catalog, cursor, options, true);
}
/** Re-read a confirmed item for relation batches/materialization without index writes. */
export async function readBookLegacyNormalizedItem(
  source,
  catalog,
  beforeCursor,
  expected,
  options,
) {
  closed(expected, ['record', 'valueHash']);
  closed(expected.record, ['kind', 'id', 'part']);
  const step = await normalizationStep(source, catalog, beforeCursor, options, false),
    item = step.item;
  if (
    !item ||
    item.valueHash !== expected.valueHash ||
    item.record.kind !== expected.record.kind ||
    item.record.id !== expected.record.id ||
    item.record.part !== expected.record.part
  )
    bad();
  return item;
}
