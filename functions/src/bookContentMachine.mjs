import { BOOK_RESOURCE_KINDS } from './bookBackupResources.mjs';
import { BOOK_PERSONA_SCOPES } from './bookBackupPersonas.mjs';
import { readBookPersonaAvailability } from './bookPersonaAvailability.mjs';
import { validateBookBackupUniverseOrigin } from './bookBackupUniverse.mjs';
import {
  bookContentInvalid as bad,
  bookContentCount as count,
  bookContentClosed as closed,
  bookContentId as id,
  bookContentHash as validHash,
  validateBookBackupJSONItem,
} from './bookBackupSchema.mjs';
import {
  createBookPortableLoreItemIndex,
  advanceBookPortableLoreItemIndex,
  finishBookPortableLoreItemIndex,
} from './bookPortableLoreItemIndex.mjs';
const encoder = new TextEncoder();
export const BOOK_CONTENT_ITEM_BYTES = 8 * 1024 * 1024;
export const BOOK_CONTENT_CHECKPOINT_BYTES = 16384;
export const BOOK_CONTENT_STEP_ITEMS = 64;
const tags = [
  'book-metadata',
  'book-resources',
  'book-personas',
  'book-universe',
  'work-history',
  'book-draft',
  'book-cover',
];
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
const nodeKey = (kind, id, parentId = null) => ['node', kind, parentId ?? '', id];
function jsonDepth(value, depth = 0) {
  if (depth > 24) bad();
  if (typeof value === 'number' && !Number.isFinite(value)) bad();
  if (value && typeof value === 'object')
    for (const [key, item] of Object.entries(value)) {
      if (key === '__proto__') bad();
      jsonDepth(item, depth + 1);
    }
}

function jsonCopy(value, maxBytes) {
  let result;
  try {
    result = structuredClone(value);
  } catch {
    bad();
  }
  jsonDepth(result);
  let bytes;
  try {
    bytes = encoder.encode(JSON.stringify(result));
  } catch {
    bad();
  }
  if (bytes.length > maxBytes) bad();
  return result;
}
function coverBinding(value) {
  return value.kind === 'library'
    ? { kind: 'library', imageId: value.imageId }
    : { kind: value.kind };
}
function binding(value) {
  closed(value, ['kind'], value?.kind === 'library' ? ['imageId'] : []);
  if (!['none', 'legacy-unavailable', 'library'].includes(value.kind)) bad();
  if (value.kind === 'library') id(value.imageId);
}
function rawExpectation(kind, recordId, manifest, binary, after) {
  return {
    kind,
    id: recordId,
    byteLength: manifest.byteLength,
    chunkCount: manifest.chunkCount,
    contentHash: manifest.contentHash,
    binary,
    after,
  };
}
export function createBookContentState(bookId, legacy = false) {
  id(bookId);
  if (typeof legacy !== 'boolean') bad();
  const totals = {
    acts: 0,
    chapters: 0,
    resources: Object.fromEntries(BOOK_RESOURCE_KINDS.map((k) => [k, 0])),
    owners: Object.fromEntries(BOOK_PERSONA_SCOPES.map((k) => [k, 0])),
    bindings: Object.fromEntries(BOOK_PERSONA_SCOPES.map((k) => [k, 0])),
    profiles: 0,
    versions: 0,
    historyBytes: 0,
    historyChunks: 0,
    draftBytes: 0,
    coverBytes: 0,
  };
  const warnings = {
    missingDates: 0,
    danglingLocalReferences: 0,
    externalReferences: 0,
    orphanGroups: 0,
    legacyCover: false,
  };
  if (legacy) Object.assign(warnings, { missingPersonas: 0, unknownOverrides: 0 });

  return {
    schemaVersion: 1,
    bookId,
    legacy,
    phase: 'records',
    edgeCount: 0,
    rowCount: 0,
    edgeCursor: 0,
    rowCursor: 0,
    totals,
    warnings,
    book: null,
    origin: null,
    cover: null,
    ended: [],
    raw: null,
    relations: null,
    lore: null,
  };
}
function checkpoint(value) {
  const state = jsonCopy(value, BOOK_CONTENT_CHECKPOINT_BYTES);
  if (!Object.hasOwn(state, 'lore')) state.lore = null;
  closed(state, [
    'schemaVersion',
    'bookId',
    'legacy',
    'phase',
    'edgeCount',
    'rowCount',
    'edgeCursor',
    'rowCursor',
    'totals',
    'warnings',
    'book',
    'origin',
    'cover',
    'ended',
    'raw',
    'relations',
    'lore',
  ]);
  if (
    state.schemaVersion !== 1 ||
    typeof state.legacy !== 'boolean' ||
    !['records', 'edges', 'rows', 'done'].includes(state.phase)
  )
    bad();
  id(state.bookId);
  for (const key of ['edgeCount', 'rowCount', 'edgeCursor', 'rowCursor']) count(state[key]);
  if (
    state.edgeCursor > state.edgeCount ||
    state.rowCursor > state.rowCount ||
    (state.phase === 'records' && (state.edgeCursor !== 0 || state.rowCursor !== 0)) ||
    (state.phase === 'edges' && state.rowCursor !== 0) ||
    (['rows', 'done'].includes(state.phase) && state.edgeCursor !== state.edgeCount) ||
    (state.phase === 'done' && state.rowCursor !== state.rowCount)
  )
    bad();
  const shape = createBookContentState(state.bookId, state.legacy);
  closed(state.totals, Object.keys(shape.totals));
  for (const key of Object.keys(shape.totals)) {
    if (typeof shape.totals[key] === 'object') {
      closed(state.totals[key], Object.keys(shape.totals[key]));
      for (const value of Object.values(state.totals[key])) count(value);
    } else count(state.totals[key]);
  }
  closed(
    state.warnings,
    Object.keys(shape.warnings),
    state.legacy ? [] : ['missingPersonas', 'unknownOverrides'],
  );
  for (const [key, value] of Object.entries(state.warnings)) {
    if (key === 'legacyCover') {
      if (typeof value !== 'boolean') bad();
    } else count(value);
  }
  if (
    !Array.isArray(state.ended) ||
    state.ended.some((k) => !tags.includes(k)) ||
    new Set(state.ended).size !== state.ended.length
  )
    bad();
  if (state.book !== null) {
    closed(state.book, ['personaId', 'universeId', 'coverImageId', 'cover']);
    for (const key of ['personaId', 'universeId', 'coverImageId'])
      if (state.book[key] !== null) id(state.book[key]);
    binding(state.book.cover);
  }
  if (state.origin !== null) {
    try {
      validateBookBackupUniverseOrigin(state.origin);
    } catch {
      bad();
    }
  }
  if (state.cover !== null) binding(state.cover);
  if (state.raw !== null) {
    const raw = state.raw;
    closed(raw, ['kind', 'id', 'byteLength', 'chunkCount', 'contentHash', 'binary', 'after']);
    id(raw.id);
    count(raw.byteLength);
    count(raw.chunkCount);
    validHash(raw.contentHash);
    if (
      raw.chunkCount < 1 ||
      !['history', 'draft', 'cover'].includes(raw.after) ||
      raw.kind !==
        { history: 'work-version-text', draft: 'book-draft-text', cover: 'book-cover-bytes' }[
          raw.after
        ] ||
      raw.binary !== (raw.after === 'cover') ||
      state.phase !== 'records'
    )
      bad();
  }
  if (state.relations !== null) {
    const pending = state.relations;
    closed(pending, ['record', 'hash', 'position', 'total']);
    closed(pending.record, ['kind', 'id', 'part']);
    id(pending.record.id);
    validHash(pending.hash);
    count(pending.position);
    count(pending.total);
    if (
      pending.record.kind !== 'book-lore' ||
      pending.record.part !== 0 ||
      pending.position >= pending.total ||
      state.phase !== 'records'
    )
      bad();
  }
  if (state.lore !== null) {
    const pending = state.lore;
    closed(pending, ['record', 'index']);
    closed(pending.record, ['kind', 'id', 'part']);
    validHash(pending.record.id);
    if (
      pending.record.kind !== 'book-lore' ||
      pending.record.part !== 0 ||
      state.phase !== 'records' ||
      state.ended.includes('book-resources')
    )
      bad();
    advanceBookPortableLoreItemIndex(pending.index, new Uint8Array());
  }
  if ([state.raw, state.relations, state.lore].filter((item) => item !== null).length > 1) bad();
  if (
    state.phase !== 'records' &&
    (!state.book || !state.origin || !state.cover || tags.some((k) => !state.ended.includes(k)))
  )
    bad();
  return state;
}
/** Trusted host checkpoint/index only. This state never proves framing or authorization. */
export function createBookContentMachine(initial, { index, hash, signal } = {}) {
  if (!index || !hash) bad();
  const state = checkpoint(initial),
    { bookId, legacy } = state;
  let { edgeCount, rowCount, book, origin, cover } = state;
  const { totals, warnings } = state,
    ended = new Set(state.ended);
  let busy = false,
    failed = false;
  const check = () => signal?.throwIfAborted();
  const digest = (bytes) => {
    const h = hash.create();
    try {
      h.update(bytes);
      return h.digest();
    } finally {
      h.destroy();
    }
  };
  const hashJSON = (value) => digest(encoder.encode(JSON.stringify(canonical(value))));
  const hashAddress = (value) => digest(encoder.encode(JSON.stringify(value)));
  const bump = (object, key, n = 1) => {
    object[key] = count(object[key] + n);
  };
  async function add(key, value) {
    check();
    await index.add(key, value);
    check();
  }
  async function get(key) {
    check();
    const value = await index.get(key);
    check();
    return value;
  }
  async function edge(target, required = false, group = false, expected = null) {
    await add(['edge', String(edgeCount++)], { target, required, group, expected });
    count(edgeCount);
  }
  async function row(value) {
    await add(['row', String(rowCount++)], value);
    count(rowCount);
  }
  function warn(key, n = 1) {
    if (!Object.hasOwn(warnings, key)) warnings[key] = 0;
    bump(warnings, key, n);
  }
  function draftWarnings(value) {
    const marker = readBookPersonaAvailability(value.chapter.personaAvailability);
    if (marker?.reason === 'profile-not-recorded') warn('missingPersonas');
    else if (marker?.reason === 'legacy-overrides') {
      const unknown = (value.chapter.personaComplement?.overrides ?? []).filter(
        (o) => !value.persona.traits.some((t) => t.id === o.traitId),
      ).length;
      if (unknown) warn('unknownOverrides', unknown);
    }
  }
  async function need(scope, id, personaId, traits = [], availability) {
    await add(['need', scope, id], { personaId });
    bump(totals.owners, scope);
    await row({
      kind: 'persona',
      scope,
      id,
      personaId,
      traits,
      ...(availability ? { availability } : {}),
    });
  }
  const dates = (value, fields = ['createdAt', 'updatedAt']) => {
    if (fields.some((key) => !Object.hasOwn(value, key))) bump(warnings, 'missingDates');
  };
  function once(kind) {
    if (ended.has(kind)) bad();
    ended.add(kind);
  }
  async function loreRef(ref) {
    if (ref.kind === 'book' && ref.scopeId === bookId) await edge(nodeKey('lore', ref.entityId));
    else bump(warnings, 'externalReferences');
  }
  async function narrativeRef(ref) {
    if (ref.kind === 'lore') await loreRef(ref.reference);
    else await edge(nodeKey(ref.kind, ref[ref.kind + 'Id']));
  }
  async function registerProfile(profile) {
    const personaId = profile.id,
      profileHash = hashJSON(profile),
      previous = await get(['profile', personaId]);
    if (previous && previous.hash !== profileHash) bad();
    if (!previous) {
      await add(['profile', personaId], { hash: profileHash });
      bump(totals, 'profiles');
    }
  }
  async function persona(value) {
    const { scope, ownerId, personaId, profile } = value;
    const address = hashAddress([scope, ownerId]);
    await registerProfile(profile);
    await add(['binding', scope, ownerId], { personaId, traits: profile.traits.map((t) => t.id) });
    await edge(['need', scope, ownerId], true);
    bump(totals.bindings, scope);
    return address;
  }

  const operation =
    (fn) =>
    async (...args) => {
      if (busy || failed) bad();
      check();
      busy = true;
      try {
        const result = await fn(...args);
        check();
        return result;
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        busy = false;
      }
    };
  const snapshot = () => {
    if (busy || failed) bad();
    check();
    return checkpoint({ ...state, edgeCount, rowCount, book, origin, cover, ended: [...ended] });
  };
  const acceptJSON = operation(async (record, input) => {
    if (state.phase !== 'records' || state.raw || state.relations || state.lore) bad();
    closed(record, ['kind', 'id', 'part']);
    id(record.id);
    if (record.part !== 0) bad();
    // Clone before any asynchronous index effect; callers cannot edit a pending record.
    record = structuredClone(record);
    const value = jsonCopy(input, BOOK_CONTENT_ITEM_BYTES),
      kind = record.kind;
    validateBookBackupJSONItem(kind, value, bookId);
    if (kind === 'book-metadata') {
      once(kind);
      if (record.id !== bookId) bad();
      book = {
        personaId: value.book.personaId ?? null,
        universeId: value.book.universeId ?? null,
        coverImageId: value.book.coverImageId ?? null,
        cover: coverBinding(value.cover),
      };
      dates(value.book);
      await need('book', bookId, book.personaId, [], value.book.personaAvailability);
    } else if (kind === 'act' || kind === 'chapter') {
      if (!book) bad();
      await add(nodeKey(kind, record.id), {
        contentMode: value.contentMode ?? 'legacy',
        rankSlot: value.rankSlot ?? 'A',
      });
      dates(value);
      bump(totals, kind === 'act' ? 'acts' : 'chapters');
      if (kind === 'chapter') {
        await need(
          'chapter',
          record.id,
          value.personaComplement?.personaId ?? null,
          (value.personaComplement?.overrides ?? []).map((o) => o.traitId),
          value.personaAvailability,
        );
        if (value.actId) await edge(nodeKey('act', value.actId), false, true);
      }
    } else if (kind === 'book-resources') {
      once(kind);
      if (
        record.id !== bookId ||
        BOOK_RESOURCE_KINDS.some((k) => value.counts[k] !== totals.resources[k])
      )
        bad();
    } else if (kind === 'book-persona') {
      if (ended.has('book-personas') || record.id !== (await persona(value))) bad();
    } else if (kind === 'book-personas') {
      once(kind);
      if (
        record.id !== bookId ||
        BOOK_PERSONA_SCOPES.some(
          (k) => value.owners[k] !== totals.owners[k] || value.bindings[k] !== totals.bindings[k],
        )
      )
        bad();
    } else if (kind === 'book-universe') {
      once(kind);
      if (record.id !== bookId) bad();
      origin = structuredClone(value.origin);
    } else if (kind === 'work-version') {
      if (ended.has('work-history') || record.id !== value.id) bad();
      if (value.draft) draftWarnings(value.draft);
      await add(['version', value.id], { resource: value.resource });
      state.raw = rawExpectation('work-version-text', value.id, value, false, 'history');
    } else if (kind === 'work-history') {
      once(kind);
      if (
        record.id !== bookId ||
        value.versions !== totals.versions ||
        value.byteLength !== totals.historyBytes ||
        value.chunkCount !== totals.historyChunks
      )
        bad();
    } else if (kind === 'book-draft') {
      once(kind);
      if (record.id !== bookId) bad();
      if (value.state === 'present') {
        draftWarnings(value);
        if (value.persona) await registerProfile(value.persona);
        state.raw = rawExpectation('book-draft-text', value.chapter.id, value, false, 'draft');
      }
    } else if (kind === 'book-cover') {
      once(kind);
      if (record.id !== bookId) bad();
      cover = coverBinding(value.cover);
      if (cover.kind === 'library')
        state.raw = rawExpectation(
          'book-cover-bytes',
          value.cover.imageId,
          value.cover,
          true,
          'cover',
        );
    } else {
      if (ended.has('book-resources')) bad();
      const type = value.kind,
        data = value.data,
        parent = value.parentId;
      if (record.id !== hashAddress([type, parent, value.id])) bad();
      await add(
        nodeKey(type, value.id, parent),
        type === 'scene'
          ? { hash: data.bodyHash, bytes: data.bodyBytes }
          : ['scene-control', 'narrative-control'].includes(type)
            ? { rankSlot: data.rankSlot }
            : {},
      );
      bump(totals.resources, type);
      if (['arc', 'milestone', 'event'].includes(type) || (type === 'scene' && !data.archived)) {
        const sequence = { kind: type, ...(type === 'milestone' ? { arcId: parent } : {}) };
        const control =
          type === 'scene'
            ? data.parentId === null
              ? nodeKey('scene-control', 'unassigned')
              : nodeKey('chapter', data.parentId)
            : nodeKey('narrative-control', hashJSON(sequence));
        await row({ kind: 'rank', control, rankA: data.rankA, rankB: data.rankB });
      }
      if (['lore', 'scene', 'arc', 'event', 'milestone', 'scene-source'].includes(type))
        dates(data, type === 'scene-source' ? ['createdAt'] : undefined);
      if (parent !== null)
        await edge(nodeKey(type === 'milestone' ? 'arc' : 'scene', parent), true);
      if (type === 'scene') {
        await edge(nodeKey('scene-body', 'current', value.id), true, false, {
          hash: data.bodyHash,
          bytes: data.bodyBytes,
        });
        if (data.parentId !== null)
          await edge(nodeKey('chapter', data.parentId), false, true, { mode: 'scenes' });
        if (data.formerParentId) await edge(nodeKey('chapter', data.formerParentId), false, true);
      } else if (type === 'scene-body') {
        const bytes = encoder.encode(data.content);
        if (digest(bytes) !== data.hash) bad();
        // Add a separate proof key; the structural identity was reserved above.
        await add(['body', parent], { hash: data.hash, bytes: bytes.length });
      } else if (type === 'scene-source') {
        if (digest(encoder.encode(data.original.content ?? '')) !== data.hash) bad();
        await need(
          'scene-source',
          value.id,
          data.original.personaComplement?.personaId ?? null,
          (data.original.personaComplement?.overrides ?? []).map((o) => o.traitId),
          data.original.personaAvailability,
        );
        await edge(nodeKey('chapter', value.id), false, true);
      } else if (type === 'scene-reference') await loreRef(data);
      else if (type === 'lore') {
        if (data.relations?.length)
          state.relations = {
            record: { kind: record.kind, id: record.id, part: 0 },
            hash: hashJSON(value),
            position: 0,
            total: data.relations.length,
          };
      } else if (type === 'narrative-link') {
        await edge(nodeKey(data.source.kind, data.source.id, data.source.arcId ?? null));
        await narrativeRef(data.reference);
      } else if (type === 'narrative-control') {
        if (value.id !== hashJSON(data.resource)) bad();
        if (data.resource.kind === 'milestone')
          await edge(nodeKey('arc', data.resource.arcId), true);
      }
    }
  });
  const beginLore = operation(async (record) => {
    if (
      state.phase !== 'records' ||
      state.raw ||
      state.relations ||
      state.lore ||
      ended.has('book-resources')
    )
      bad();
    closed(record, ['kind', 'id', 'part']);
    validHash(record.id);
    if (record.kind !== 'book-lore' || record.part !== 0) bad();
    state.lore = { record: structuredClone(record), index: createBookPortableLoreItemIndex() };
  });
  const advanceLore = operation(async (bytes, limit = BOOK_CONTENT_STEP_ITEMS) => {
    if (
      state.phase !== 'records' ||
      !state.lore ||
      !(bytes instanceof Uint8Array) ||
      bytes.length === 0
    )
      bad();
    const result = advanceBookPortableLoreItemIndex(state.lore.index, bytes, limit);
    for (const reference of result.references)
      await row({ kind: 'lore-relation', target: reference.targetEntityId });
    state.lore.index = result.state;
    return { consumed: result.consumed, references: result.references.length };
  });
  const finishLore = operation(async () => {
    if (state.phase !== 'records' || !state.lore) bad();
    const metadata = finishBookPortableLoreItemIndex(state.lore.index);
    if (state.lore.record.id !== hashAddress(['lore', null, metadata.id])) bad();
    await add(nodeKey('lore', metadata.id), {});
    bump(totals.resources, 'lore');
    dates(metadata.index.dates);
    state.lore = null;
    return metadata;
  });
  const advanceRelations = operation(async (record, input, limit = BOOK_CONTENT_STEP_ITEMS) => {
    if (state.phase !== 'records' || !state.relations) bad();
    count(limit);
    if (limit < 1 || limit > BOOK_CONTENT_STEP_ITEMS) bad();
    const value = jsonCopy(input, BOOK_CONTENT_ITEM_BYTES),
      pending = state.relations;
    closed(record, ['kind', 'id', 'part']);
    if (
      record.kind !== pending.record.kind ||
      record.id !== pending.record.id ||
      record.part !== pending.record.part
    )
      bad();
    validateBookBackupJSONItem(record.kind, value, bookId);
    if (hashJSON(value) !== pending.hash || value.data.relations?.length !== pending.total) bad();
    const end = Math.min(pending.total, pending.position + limit);
    for (let at = pending.position; at < end; at++)
      await row({ kind: 'lore-relation', target: value.data.relations[at].targetEntityId });
    pending.position = end;
    if (end === pending.total) state.relations = null;
  });
  const acceptRawProof = operation(async (proof) => {
    if (state.phase !== 'records' || !state.raw) bad();
    closed(proof, ['byteLength', 'chunkCount', 'contentHash']);
    const raw = state.raw;
    if (
      proof.byteLength !== raw.byteLength ||
      proof.chunkCount !== raw.chunkCount ||
      proof.contentHash !== raw.contentHash
    )
      bad();
    if (raw.after === 'history') {
      bump(totals, 'versions');
      bump(totals, 'historyBytes', raw.byteLength);
      bump(totals, 'historyChunks', raw.chunkCount);
    } else totals[raw.after + 'Bytes'] = raw.byteLength;
    state.raw = null;
  });
  const beginFinish = operation(async () => {
    if (state.phase !== 'records' || state.raw || state.relations || state.lore) bad();
    if (
      !book ||
      !origin ||
      !cover ||
      ![
        'book-metadata',
        'book-resources',
        'book-personas',
        'book-universe',
        'work-history',
        'book-draft',
        'book-cover',
      ].every((k) => ended.has(k))
    )
      bad();
    if (
      book.universeId === null
        ? origin.kind !== 'none'
        : origin.kind === 'none' || origin.id !== book.universeId
    )
      bad();
    if (
      book.cover.kind !== cover.kind ||
      (cover.kind === 'library' &&
        (book.cover.imageId !== cover.imageId || book.coverImageId !== cover.imageId)) ||
      (cover.kind !== 'library' && book.coverImageId !== null)
    )
      bad();
    warnings.legacyCover = cover.kind === 'legacy-unavailable';

    state.phase = 'edges';
  });
  async function oneEdge() {
    const edgeValue = await get(['edge', String(state.edgeCursor)]);
    if (!edgeValue) bad();
    const target = await get(edgeValue.target);
    if (!target) {
      if (edgeValue.required) bad();
      bump(warnings, edgeValue.group ? 'orphanGroups' : 'danglingLocalReferences');
    }
    if (edgeValue.expected?.mode) {
      if (target && target.contentMode !== edgeValue.expected.mode) bad();
    } else if (edgeValue.expected) {
      const body = await get(['body', edgeValue.target[2]]);
      if (!body || body.hash !== edgeValue.expected.hash || body.bytes !== edgeValue.expected.bytes)
        bad();
    }
  }
  async function oneRow() {
    const item = await get(['row', String(state.rowCursor)]);
    if (!item) bad();
    if (item.kind === 'lore-relation') {
      if (!(await get(nodeKey('lore', item.target)))) {
        if (/^(adventure|universe):([^:]+):(.+)$/.test(item.target))
          bump(warnings, 'externalReferences');
        else bump(warnings, 'danglingLocalReferences');
      }
      return;
    }
    if (item.kind === 'rank') {
      const control = await get(item.control),
        rank = (control?.rankSlot ?? 'A') === 'A' ? item.rankA : item.rankB;
      await add(['rank', ...item.control, rank], {});
      return;
    }
    const binding = await get(['binding', item.scope, item.id]);
    let marker;
    try {
      marker = readBookPersonaAvailability(item.availability);
    } catch {
      bad();
    }
    if (marker && marker.personaId !== item.personaId) bad();
    if (item.personaId === null) {
      if (binding !== undefined || marker) bad();
    } else if (!binding) {
      if (
        (!legacy && marker?.reason !== 'profile-not-recorded') ||
        marker?.reason === 'legacy-overrides'
      )
        bad();
      warn('missingPersonas');
    } else {
      if (binding.personaId !== item.personaId || marker?.reason === 'profile-not-recorded') bad();
      const unknown = item.traits.filter((id) => !binding.traits.includes(id)).length;
      if (unknown) {
        if (!legacy && marker?.reason !== 'legacy-overrides') bad();
        warn('unknownOverrides', unknown);
      }
    }
  }
  const advanceFinish = operation(async (limit = BOOK_CONTENT_STEP_ITEMS) => {
    count(limit);
    if (limit < 1 || limit > BOOK_CONTENT_STEP_ITEMS || state.phase === 'records') bad();
    let used = 0;
    while (used < limit && state.phase !== 'done') {
      if (state.phase === 'edges') {
        if (state.edgeCursor === edgeCount) {
          state.phase = 'rows';
          continue;
        }
        await oneEdge();
        state.edgeCursor++;
      } else {
        if (state.rowCursor === rowCount) {
          state.phase = 'done';
          continue;
        }
        await oneRow();
        state.rowCursor++;
      }
      used++;
    }
    if (state.phase === 'edges' && state.edgeCursor === edgeCount) state.phase = 'rows';
    if (state.phase === 'rows' && state.rowCursor === rowCount) state.phase = 'done';
  });
  return {
    acceptJSON,
    beginLore,
    advanceLore,
    finishLore,
    advanceRelations,
    acceptRawProof,
    beginFinish,
    advanceFinish,
    checkpoint: snapshot,
    result() {
      const value = snapshot();
      if (value.phase !== 'done') bad();
      return {
        validation: 'semantic-only',
        bookId,
        legacy,
        totals: value.totals,
        warnings: value.warnings,
      };
    },
  };
}
