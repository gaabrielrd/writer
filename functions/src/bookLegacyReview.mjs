import { createBookLegacyCatalog, legacyPick as pick } from './bookLegacyCatalog.mjs';
import { validateBookLegacyRecordContent } from './bookBackupContent.mjs';
import { encodeBookBackupJSON } from './bookBackupStructure.mjs';
import { BOOK_RESOURCE_KINDS } from './bookBackupResources.mjs';
import {
  bookContentInvalid as bad,
  bookContentClosed as closed,
  bookContentCount as count,
  bookContentId as id,
  validateBookBackupJSONItem as validate,
} from './bookBackupSchema.mjs';
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
const scopes = ['book', 'chapter', 'scene-source'];
function* json(kind, id, value) {
  const { bytes } = encodeBookBackupJSON(value);
  for (let at = 0; at < bytes.length; at += 65536)
    yield { kind, id, part: at / 65536, payload: bytes.slice(at, at + 65536) };
}
export async function inspectBookLegacyContent(source, options) {
  const { index, hash, signal } = options;
  const check = () => signal?.throwIfAborted();
  const digest = (value) => {
    const h = hash.create();
    try {
      h.update(new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)));
      return h.digest();
    } finally {
      h.destroy();
    }
  };
  const address = (values) => digest(JSON.stringify(values));
  const catalog = await createBookLegacyCatalog(source, options),
    { bookId, counts } = catalog;
  const resources = Object.fromEntries(BOOK_RESOURCE_KINDS.map((k) => [k, 0])),
    bindings = Object.fromEntries(scopes.map((k) => [k, 0]));
  const owners = { book: 1, chapter: counts.chapters, 'scene-source': counts.sources };
  const legacyWarnings = {
    resolvedLabelsIgnored: 0,
    unusedProfiles: 0,
    renderedAssemblies: 0,
    derivedRankBuffers: counts.scenes + counts.arcs + counts.milestones + counts.events,
  };
  let usedProfiles = 0;
  const get = async (key) => {
    check();
    const value = await index.get(key);
    check();
    return value;
  };
  const add = async (key, value) => {
    check();
    await index.add(key, value);
    check();
  };
  function* resource(kind, entityId, data, parentId = null) {
    resources[kind] = count(resources[kind] + 1);
    yield* json('book-' + kind, address([kind, parentId, entityId]), {
      schemaVersion: 1,
      kind,
      parentId,
      id: entityId,
      data,
    });
  }
  async function original(position) {
    const value = await catalog.item('sources', position);
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
        },
      },
    };
  }
  async function chapter(position) {
    const value = await catalog.item('chapters', position);
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
    return { id: value.id, data };
  }
  for (let i = 0; i < counts.personas; i++) {
    const profile = await catalog.item('personas', i);
    validate(
      'book-persona',
      { schemaVersion: 1, scope: 'book', ownerId: bookId, personaId: profile?.id, profile },
      bookId,
    );
    await add(['legacy-profile', profile.id], { position: i });
  }
  for (let i = 0; i < counts.groups; i++) {
    const group = await catalog.item('groups', i);
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
  }
  async function* bind(scope, ownerId, personaId) {
    if (!personaId) return;
    const profilePosition = await get(['legacy-profile', personaId]);
    if (!profilePosition) return;
    const profile = await catalog.item('personas', profilePosition.position);
    const used = await get(['legacy-used-profile', personaId]);
    if (!used) {
      await add(['legacy-used-profile', personaId], {});
      usedProfiles = count(usedProfiles + 1);
    }
    bindings[scope] = count(bindings[scope] + 1);
    yield* json('book-persona', address([scope, ownerId]), {
      schemaVersion: 1,
      scope,
      ownerId,
      personaId,
      profile,
    });
  }
  async function* records() {
    const book = await catalog.item('book');
    yield* json('book-metadata', bookId, {
      book: pick(book, bookFields),
      progress: {},
      cover: catalog.cover,
    });
    for (let i = 0; i < counts.acts; i++) {
      const act = await catalog.item('acts', i);
      closed(act, ['id', 'name', 'order'], ['createdAt', 'updatedAt']);
      id(act.id);
      yield* json('act', act.id, pick(act, ['name', 'order', 'createdAt', 'updatedAt']));
    }
    for (let i = 0; i < counts.chapters; i++) {
      const value = await chapter(i);
      await add(['legacy-chapter', value.id], {});
      if (value.data.contentMode === 'scenes')
        legacyWarnings.renderedAssemblies = count(legacyWarnings.renderedAssemblies + 1);
      yield* json('chapter', value.id, value.data);
    }
    for (let i = 0; i < counts.groups; i++) {
      const group = await catalog.item('groups', i);
      if (group.id === null)
        yield* resource('scene-control', 'unassigned', { rankSlot: group.rankSlot });
      else if (!(await get(['legacy-chapter', group.id]))) bad();
    }
    for (let i = 0; i < counts.lore; i++) {
      const lore = await catalog.item('lore', i);
      closed(
        lore,
        ['id', 'name', 'category'],
        [
          'aliases',
          'summary',
          'details',
          'structuredDetails',
          'relations',
          'isPublic',
          'createdAt',
          'updatedAt',
        ],
      );
      id(lore.id);
      yield* resource(
        'lore',
        lore.id,
        pick(lore, [
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
        ]),
      );
    }
    for (let i = 0; i < counts.sources; i++) {
      const value = await original(i);
      yield* resource('scene-source', value.id, value.data);
    }
    for (let i = 0; i < counts.scenes; i++) {
      const scene = await catalog.item('scenes', i);
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
      yield* resource('scene', scene.id, data);
      yield* resource(
        'scene-body',
        'current',
        { content: scene.content, hash: scene.bodyHash },
        scene.id,
      );
      yield* resource('scene-planning', 'current', scene.planning, scene.id);
      for (const reference of scene.references) {
        closed(reference, ['id', 'reference', 'available'], ['name', 'category']);
        id(reference.id);
        if (
          typeof reference.available !== 'boolean' ||
          (reference.name !== undefined && typeof reference.name !== 'string') ||
          (reference.category !== undefined && typeof reference.category !== 'string')
        )
          bad();
        if (reference.name !== undefined || reference.category !== undefined)
          legacyWarnings.resolvedLabelsIgnored = count(legacyWarnings.resolvedLabelsIgnored + 1);
        yield* resource('scene-reference', reference.id, reference.reference, scene.id);
      }
    }
    for (const section of ['arcs', 'milestones', 'events']) {
      const kind = { arcs: 'arc', milestones: 'milestone', events: 'event' }[section];
      const fields = {
        arc: ['initialState', 'objective', 'plannedOutcome'],
        milestone: ['arcId', 'notes'],
        event: ['description', 'dateLabel'],
      }[kind];
      for (let i = 0; i < counts[section]; i++) {
        const item = await catalog.item(section, i);
        closed(item, ['id', 'kind', ...common, 'rank', 'references', ...fields]);
        id(item.id);
        if (item.kind !== kind || !Array.isArray(item.references)) bad();
        const data = { ...pick(item, common.concat(fields)), rankA: item.rank, rankB: item.rank };
        yield* resource(kind, item.id, data, kind === 'milestone' ? item.arcId : null);
        const source = {
          kind,
          id: item.id,
          ...(kind === 'milestone' ? { arcId: item.arcId } : {}),
        };
        for (const reference of item.references)
          yield* resource('narrative-link', address([source, reference]), { source, reference });
      }
    }
    yield* json('book-resources', bookId, { schemaVersion: 1, counts: resources });
    yield* bind('book', bookId, catalog.bookPersonaId);
    for (let i = 0; i < counts.chapters; i++) {
      const value = await chapter(i);
      yield* bind('chapter', value.id, value.data.personaComplement?.personaId);
    }
    for (let i = 0; i < counts.sources; i++) {
      const value = await original(i);
      yield* bind('scene-source', value.id, value.data.original.personaComplement?.personaId);
    }
    yield* json('book-personas', bookId, { schemaVersion: 1, owners, bindings });
    yield* json('book-universe', bookId, {
      schemaVersion: 1,
      origin: catalog.bookUniverseId
        ? { kind: 'unavailable', id: catalog.bookUniverseId }
        : { kind: 'none' },
    });
    // These are availability placeholders inside the legacy-only validator, never a new archive.
    yield* json('work-history', bookId, {
      schemaVersion: 1,
      versions: 0,
      byteLength: 0,
      chunkCount: 0,
    });
    yield* json('book-draft', bookId, { schemaVersion: 1, state: 'none' });
    yield* json('book-cover', bookId, { schemaVersion: 1, cover: catalog.cover });
    legacyWarnings.unusedProfiles = counts.personas - usedProfiles;
  }
  async function* events() {
    yield {
      type: 'manifest',
      manifest: {
        bookId,
        sourceFormat: 'writer-book-backup',
        sourceVersion: catalog.provenance.version,
      },
    };
    for await (const record of records()) yield { type: 'record', record };
    check();
    return catalog.provenance;
  }
  const report = await validateBookLegacyRecordContent(events(), options);
  check();
  return { ...report, legacyWarnings };
}
