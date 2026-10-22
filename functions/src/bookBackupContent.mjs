import { readBookBackupPackage } from './bookBackupPackage.mjs';
import { BOOK_RESOURCE_KINDS } from './bookBackupResources.mjs';
import { BOOK_PERSONA_SCOPES } from './bookBackupPersonas.mjs';
import {
  bookContentInvalid as bad,
  bookContentCount as count,
  validateBookBackupJSONItem,
} from './bookBackupSchema.mjs';
const encoder = new TextEncoder();
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
/** Content validation is not authorization. The caller owns the temporary, trusted index. */
export async function validateBookBackupContent(source, { index, hash, signal } = {}) {
  if (!index || !hash) bad();
  const stream = readBookBackupPackage(source, { signal });
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
  let complete = false,
    current,
    envelope,
    bookId,
    edgeCount = 0,
    rowCount = 0,
    book,
    origin,
    cover;
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
  const ended = new Set();
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
  async function need(scope, id, personaId, traits = []) {
    await add(['need', scope, id], { personaId });
    bump(totals.owners, scope);
    await row({ kind: 'persona', scope, id, personaId, traits });
  }
  const dates = (value, fields = ['createdAt', 'updatedAt']) => {
    if (fields.some((key) => !Object.hasOwn(value, key))) bump(warnings, 'missingDates');
  };
  async function next() {
    check();
    const result = await stream.next();
    check();
    if (result.done) {
      envelope = result.value;
      return null;
    }
    if (result.value.type !== 'record') bad();
    return result.value.record;
  }
  async function json() {
    const first = current,
      parts = [];
    let length = 0,
      part = 0,
      previous;
    do {
      if (
        current.part !== part++ ||
        current.payload.length === 0 ||
        (previous !== undefined && previous !== 65536)
      )
        bad();
      length += current.payload.length;
      if (length > 8 * 1024 * 1024) bad();
      parts.push(current.payload);
      previous = current.payload.length;
      current = await next();
    } while (current && current.kind === first.kind && current.id === first.id);
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const payload of parts) {
      bytes.set(payload, offset);
      offset += payload.length;
    }
    let text, value;
    try {
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
      value = JSON.parse(text);
    } catch {
      bad();
    }
    jsonDepth(value);
    if (JSON.stringify(value) !== text) bad();
    validateBookBackupJSONItem(first.kind, value, bookId);
    return { record: first, value };
  }
  async function raw(kind, id, manifest, binary = false) {
    const hasher = hash.create(),
      decoder = binary ? null : new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
    let bytes = 0;
    try {
      for (let part = 0; part < manifest.chunkCount; part++) {
        check();
        if (!current || current.kind !== kind || current.id !== id || current.part !== part) bad();
        const payload = current.payload;
        if (
          !binary &&
          (manifest.byteLength === 0
            ? manifest.chunkCount !== 1 || payload.length !== 0
            : payload.length === 0 || (part < manifest.chunkCount - 1 && payload.length < 65533))
        )
          bad();
        if (
          binary &&
          (payload.length !== Math.min(65536, manifest.byteLength - part * 65536) ||
            (part === 0 &&
              Array.from(payload.subarray(0, 8), (v) => v.toString(16).padStart(2, '0')).join(
                '',
              ) !== '89504e470d0a1a0a'))
        )
          bad();
        bytes += payload.length;
        if (bytes > manifest.byteLength) bad();
        hasher.update(payload);
        try {
          decoder?.decode(payload);
        } catch {
          bad();
        }
        current = await next();
      }
      try {
        decoder?.decode();
      } catch {
        bad();
      }
      if (bytes !== manifest.byteLength || hasher.digest() !== manifest.contentHash) bad();
      return bytes;
    } finally {
      hasher.destroy();
    }
  }
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
  try {
    check();
    const first = await stream.next();
    check();
    if (first.done || first.value.type !== 'manifest') bad();
    bookId = first.value.manifest.bookId;
    current = await next();
    while (current) {
      const { record, value } = await json(),
        kind = record.kind;
      check();
      if (kind === 'book-metadata') {
        once(kind);
        if (record.id !== bookId) bad();
        book = {
          personaId: value.book.personaId ?? null,
          universeId: value.book.universeId ?? null,
          coverImageId: value.book.coverImageId ?? null,
          cover: value.cover,
        };
        dates(value.book);
        await need('book', bookId, book.personaId);
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
        origin = value.origin;
      } else if (kind === 'work-version') {
        if (ended.has('work-history') || record.id !== value.id) bad();
        await add(['version', value.id], { resource: value.resource });
        await raw('work-version-text', value.id, value);
        bump(totals, 'versions');
        bump(totals, 'historyBytes', value.byteLength);
        bump(totals, 'historyChunks', value.chunkCount);
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
          if (value.persona) {
            await registerProfile(value.persona);
            if (
              (value.chapter.personaComplement?.overrides ?? []).some(
                (o) => !value.persona.traits.some((t) => t.id === o.traitId),
              )
            )
              bad();
          }
          totals.draftBytes = await raw('book-draft-text', value.chapter.id, value);
        }
      } else if (kind === 'book-cover') {
        once(kind);
        if (record.id !== bookId) bad();
        cover = value.cover;
        if (cover.kind === 'library')
          totals.coverBytes = await raw('book-cover-bytes', cover.imageId, cover, true);
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
          );
          await edge(nodeKey('chapter', value.id), false, true);
        } else if (type === 'scene-reference') await loreRef(data);
        else if (type === 'lore') {
          for (const relation of data.relations ?? [])
            await row({ kind: 'lore-relation', target: relation.targetEntityId });
        } else if (type === 'narrative-link') {
          await edge(nodeKey(data.source.kind, data.source.id, data.source.arcId ?? null));
          await narrativeRef(data.reference);
        } else if (type === 'narrative-control') {
          if (value.id !== hashJSON(data.resource)) bad();
          if (data.resource.kind === 'milestone')
            await edge(nodeKey('arc', data.resource.arcId), true);
        }
      }
    }
    if (
      !envelope ||
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
    for (let i = 0; i < edgeCount; i++) {
      const edgeValue = await get(['edge', String(i)]);
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
        if (
          !body ||
          body.hash !== edgeValue.expected.hash ||
          body.bytes !== edgeValue.expected.bytes
        )
          bad();
      }
    }
    for (let i = 0; i < rowCount; i++) {
      const item = await get(['row', String(i)]);
      if (!item) bad();
      if (item.kind === 'lore-relation') {
        if (!(await get(nodeKey('lore', item.target)))) {
          if (/^(adventure|universe):([^:]+):(.+)$/.test(item.target))
            bump(warnings, 'externalReferences');
          else bump(warnings, 'danglingLocalReferences');
        }
        continue;
      }
      if (item.kind === 'rank') {
        const control = await get(item.control),
          rank = (control?.rankSlot ?? 'A') === 'A' ? item.rankA : item.rankB;
        await add(['rank', ...item.control, rank], {});
        continue;
      }
      const binding = await get(['binding', item.scope, item.id]);
      if (
        item.personaId === null
          ? binding !== undefined
          : binding?.personaId !== item.personaId ||
            item.traits.some((id) => !binding.traits.includes(id))
      )
        bad();
    }
    check();
    complete = true;
    return { validation: 'content-only', version: 1, envelope, totals, warnings };
  } finally {
    if (!complete) await stream.return(undefined);
  }
}
