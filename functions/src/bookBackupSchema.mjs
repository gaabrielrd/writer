import { BookBackupFormatError } from './bookBackupContainer.mjs';
import { BOOK_RESOURCE_KINDS, BOOK_RESOURCE_SINGLETONS } from './bookBackupResources.mjs';
import { projectBookBackupPersona, BOOK_PERSONA_SCOPES } from './bookBackupPersonas.mjs';
import { validateComplement } from './personaProfile.mjs';
import { validateBookBackupUniverseOrigin } from './bookBackupUniverse.mjs';
import { validateBookBackupCover } from './bookBackupCover.mjs';
const encoder = new TextEncoder(),
  decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
export function bookContentInvalid() {
  throw new BookBackupFormatError(
    'invalid-record',
    'O conteúdo do backup de livro não corresponde ao formato esperado.',
  );
}
const bad = bookContentInvalid;
export function bookContentClosed(value, required, optional = []) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => ![...required, ...optional].includes(key))
  )
    bad();
  return value;
}
export function bookContentId(value) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.includes('/') ||
    value.includes('\\') ||
    ['.', '..'].includes(value) ||
    encoder.encode(value).length > 1500 ||
    [...value].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) ||
    decoder.decode(encoder.encode(value)) !== value
  )
    bad();
  return value;
}
const string = (value) => {
  if (typeof value !== 'string' || decoder.decode(encoder.encode(value)) !== value) bad();
};
const number = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) bad();
};
export const bookContentCount = (value) => {
  if (!Number.isSafeInteger(value) || value < 0) bad();
  return value;
};
const date = (value) => {
  bookContentCount(value);
  if (!Number.isFinite(new Date(value).getTime())) bad();
};
export const bookContentHash = (value) => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) bad();
  return value;
};
const boolean = (value) => {
  if (typeof value !== 'boolean') bad();
};
const one = (value, choices) => {
  if (!choices.includes(value)) bad();
};
const nullableId = (value) => {
  if (value !== null) bookContentId(value);
};
const optional = (value, fields, check) => {
  for (const field of fields) if (Object.hasOwn(value, field)) check(value[field]);
};
const dates = (value) => optional(value, ['createdAt', 'updatedAt'], date);
const rank = (value) => {
  if (
    typeof value !== 'string' ||
    value.length > 128 ||
    !/[1-9A-Za-z]$/.test(value) ||
    !/^[0-9A-Za-z]+$/.test(value)
  )
    bad();
};
const personaId = (value) => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(value)) bad();
};
function complement(value) {
  if (value === null) return;
  bookContentClosed(value, ['personaId', 'overrides']);
  personaId(value.personaId);
  if (!Array.isArray(value.overrides)) bad();
  for (const item of value.overrides) bookContentClosed(item, ['traitId', 'value']);
  try {
    validateComplement(value);
  } catch {
    bad();
  }
}
function profile(value) {
  bookContentClosed(value, [
    'id',
    'schemaVersion',
    'name',
    'description',
    'instructions',
    'traits',
    'revision',
    'archived',
    'createdAt',
    'updatedAt',
  ]);
  if (!Array.isArray(value.traits)) bad();
  for (const trait of value.traits)
    bookContentClosed(trait, ['id', 'name', 'description', 'low', 'high', 'value']);
  try {
    projectBookBackupPersona(value);
  } catch {
    bad();
  }
  dates(value);
  bookContentCount(value.revision);
  ['id', 'name', 'description', 'instructions'].forEach((key) => string(value[key]));
  for (const trait of value.traits)
    ['id', 'name', 'description', 'low', 'high'].forEach((key) => string(trait[key]));
}
const chapterFields = [
  'title',
  'order',
  'actId',
  'personaComplement',
  'content',
  'contentMode',
  'assemblyRevision',
  'structureRevision',
  'rankSlot',
  'createdAt',
  'updatedAt',
];
function chapter(value, draft = false) {
  bookContentClosed(
    value,
    ['title', 'order', ...(draft ? ['id', 'createdAt', 'updatedAt'] : [])],
    chapterFields.filter(
      (k) => !['title', 'order', ...(draft ? ['createdAt', 'updatedAt'] : [])].includes(k),
    ),
  );
  if (draft) bookContentId(value.id);
  string(value.title);
  number(value.order);
  dates(value);
  optional(value, ['actId'], nullableId);
  optional(value, ['personaComplement'], complement);
  optional(value, ['content'], string);
  optional(value, ['contentMode'], (v) => one(v, draft ? ['legacy'] : ['legacy', 'scenes']));
  optional(value, ['assemblyRevision', 'structureRevision'], bookContentCount);
  optional(value, ['rankSlot'], (v) => one(v, ['A', 'B']));
  if (draft && Object.hasOwn(value, 'content')) bad();
}
function ordered(value, required, extra) {
  bookContentClosed(
    value,
    ['schemaVersion', 'revision', 'title', 'rankA', 'rankB', ...required],
    ['createdAt', 'updatedAt', ...extra],
  );
  one(value.schemaVersion, [1]);
  bookContentCount(value.revision);
  if (value.revision < 1) bad();
  string(value.title);
  rank(value.rankA);
  rank(value.rankB);
  dates(value);
}
function loreReference(value) {
  bookContentClosed(value, ['kind', 'scopeId', 'entityId']);
  one(value.kind, ['book', 'adventure', 'universe']);
  bookContentId(value.scopeId);
  bookContentId(value.entityId);
}
function narrativeSource(value, withId) {
  bookContentClosed(value, [
    'kind',
    ...(withId ? ['id'] : []),
    ...(value?.kind === 'milestone' ? ['arcId'] : []),
  ]);
  one(value.kind, ['arc', 'milestone', 'event']);
  if (withId) bookContentId(value.id);
  if (value.kind === 'milestone') bookContentId(value.arcId);
}
function resource(kind, value) {
  if (kind === 'lore') {
    bookContentClosed(
      value,
      ['name', 'category'],
      [
        'aliases',
        'summary',
        'details',
        'isPublic',
        'createdAt',
        'updatedAt',
        'structuredDetails',
        'relations',
      ],
    );
    string(value.name);
    one(value.category, ['character', 'location', 'concept', 'other']);
    optional(value, ['summary', 'details'], string);
    optional(value, ['isPublic'], boolean);
    dates(value);
    if (Object.hasOwn(value, 'aliases')) {
      if (!Array.isArray(value.aliases)) bad();
      value.aliases.forEach(string);
    }
    if (Object.hasOwn(value, 'structuredDetails')) {
      bookContentClosed(
        value.structuredDetails,
        [],
        ['appearance', 'personality', 'history', 'notes'],
      );
      Object.values(value.structuredDetails).forEach(string);
    }
    if (Object.hasOwn(value, 'relations')) {
      if (!Array.isArray(value.relations)) bad();
      for (const r of value.relations) {
        bookContentClosed(r, ['targetEntityId', 'relationType'], ['description']);
        string(r.targetEntityId);
        const qualified = /^(adventure|universe):([^:]+):(.+)$/.exec(r.targetEntityId);
        if (qualified) {
          bookContentId(qualified[2]);
          bookContentId(qualified[3]);
        } else bookContentId(r.targetEntityId);
        string(r.relationType);
        optional(r, ['description'], string);
      }
    }
  } else if (kind === 'scene') {
    ordered(value, ['parentId', 'stage', 'archived', 'bodyHash', 'bodyBytes'], ['formerParentId']);
    nullableId(value.parentId);
    optional(value, ['formerParentId'], nullableId);
    one(value.stage, ['planned', 'writing', 'review', 'done']);
    boolean(value.archived);
    bookContentHash(value.bodyHash);
    bookContentCount(value.bodyBytes);
  } else if (kind === 'scene-body') {
    bookContentClosed(value, ['content', 'hash']);
    string(value.content);
    bookContentHash(value.hash);
  } else if (kind === 'scene-planning') {
    bookContentClosed(value, ['objective', 'conflict', 'pointOfView']);
    Object.values(value).forEach(string);
  } else if (kind === 'scene-reference') loreReference(value);
  else if (kind === 'scene-control') {
    bookContentClosed(value, ['rankSlot']);
    one(value.rankSlot, ['A', 'B']);
  } else if (kind === 'scene-source') {
    bookContentClosed(value, ['hash', 'original'], ['createdAt']);
    bookContentHash(value.hash);
    optional(value, ['createdAt'], date);
    chapter(value.original);
  } else if (kind === 'narrative-control') {
    bookContentClosed(value, ['rankSlot', 'resource']);
    one(value.rankSlot, ['A', 'B']);
    narrativeSource(value.resource, false);
  } else if (kind === 'narrative-link') {
    bookContentClosed(value, ['source', 'reference']);
    narrativeSource(value.source, true);
    const ref = value.reference;
    bookContentClosed(ref, [
      'kind',
      ...(ref?.kind === 'scene'
        ? ['sceneId']
        : ref?.kind === 'event'
          ? ['eventId']
          : ref?.kind === 'lore'
            ? ['reference']
            : []),
    ]);
    one(ref.kind, ['scene', 'event', 'lore']);
    if (ref.kind === 'lore') loreReference(ref.reference);
    else bookContentId(ref[ref.kind + 'Id']);
  } else if (kind === 'arc') {
    ordered(value, ['initialState', 'objective', 'plannedOutcome'], []);
    ['initialState', 'objective', 'plannedOutcome'].forEach((k) => string(value[k]));
  } else if (kind === 'event') {
    ordered(value, ['description', 'dateLabel'], []);
    string(value.description);
    string(value.dateLabel);
  } else if (kind === 'milestone') {
    ordered(value, ['arcId', 'notes'], []);
    bookContentId(value.arcId);
    string(value.notes);
  } else bad();
}
function counts(value, keys) {
  bookContentClosed(value, keys);
  Object.values(value).forEach(bookContentCount);
}
export function validateBookBackupJSONItem(kind, value, bookId) {
  bookContentId(bookId);
  if (kind === 'book-metadata') {
    bookContentClosed(value, ['book', 'progress', 'cover']);
    bookContentClosed(
      value.book,
      ['title'],
      ['genre', 'synopsis', 'personaId', 'universeId', 'coverImageId', 'createdAt', 'updatedAt'],
    );
    ['title', 'genre', 'synopsis'].forEach((k) => {
      if (Object.hasOwn(value.book, k)) string(value.book[k]);
    });
    dates(value.book);
    optional(value.book, ['personaId'], (v) => {
      if (v !== null) personaId(v);
    });
    optional(value.book, ['universeId', 'coverImageId'], nullableId);
    bookContentClosed(value.progress, [], ['editorialState', 'wordGoal']);
    optional(value.progress, ['editorialState'], (v) => one(v, ['draft', 'review', 'ready']));
    optional(value.progress, ['wordGoal'], (v) => {
      if (v !== null) bookContentCount(v);
    });
    bookContentClosed(value.cover, ['kind'], value.cover?.kind === 'library' ? ['imageId'] : []);
    one(value.cover.kind, ['none', 'legacy-unavailable', 'library']);
    if (value.cover.kind === 'library') bookContentId(value.cover.imageId);
  } else if (kind === 'act') {
    bookContentClosed(value, ['name', 'order'], ['createdAt', 'updatedAt']);
    if (value.name !== null) string(value.name);
    number(value.order);
    dates(value);
  } else if (kind === 'chapter') chapter(value);
  else if (kind === 'book-resources') {
    bookContentClosed(value, ['schemaVersion', 'counts']);
    one(value.schemaVersion, [1]);
    counts(value.counts, BOOK_RESOURCE_KINDS);
  } else if (kind === 'book-personas') {
    bookContentClosed(value, ['schemaVersion', 'owners', 'bindings']);
    one(value.schemaVersion, [1]);
    counts(value.owners, BOOK_PERSONA_SCOPES);
    counts(value.bindings, BOOK_PERSONA_SCOPES);
  } else if (kind === 'book-persona') {
    bookContentClosed(value, ['schemaVersion', 'scope', 'ownerId', 'personaId', 'profile']);
    one(value.schemaVersion, [1]);
    one(value.scope, BOOK_PERSONA_SCOPES);
    bookContentId(value.ownerId);
    personaId(value.personaId);
    profile(value.profile);
    if (value.profile.id !== value.personaId) bad();
  } else if (kind === 'book-universe') {
    bookContentClosed(value, ['schemaVersion', 'origin']);
    one(value.schemaVersion, [1]);
    try {
      validateBookBackupUniverseOrigin(value.origin);
    } catch {
      bad();
    }
  } else if (kind === 'work-version') {
    bookContentClosed(value, [
      'id',
      'target',
      'resource',
      'createdAt',
      'reason',
      'label',
      'wordCount',
      'byteLength',
      'contentHash',
      'chunkCount',
    ]);
    bookContentId(value.id);
    bookContentClosed(value.target, ['kind', 'id']);
    if (value.target.kind !== 'book' || value.target.id !== bookId) bad();
    bookContentClosed(value.resource, ['kind', 'id']);
    one(value.resource.kind, ['chapter', 'scene']);
    bookContentId(value.resource.id);
    date(value.createdAt);
    one(value.reason, ['manual', 'before-restore']);
    if (value.label !== null) string(value.label);
    ['wordCount', 'byteLength', 'chunkCount'].forEach((k) => bookContentCount(value[k]));
    bookContentHash(value.contentHash);
    if (value.chunkCount < 1) bad();
  } else if (kind === 'work-history') {
    bookContentClosed(value, ['schemaVersion', 'versions', 'byteLength', 'chunkCount']);
    one(value.schemaVersion, [1]);
    ['versions', 'byteLength', 'chunkCount'].forEach((k) => bookContentCount(value[k]));
  } else if (kind === 'book-draft') {
    if (value?.state === 'none') {
      bookContentClosed(value, ['schemaVersion', 'state']);
      one(value.schemaVersion, [1]);
    } else {
      bookContentClosed(value, [
        'schemaVersion',
        'state',
        'chapter',
        'persona',
        'byteLength',
        'chunkCount',
        'contentHash',
      ]);
      one(value.schemaVersion, [1]);
      one(value.state, ['present']);
      chapter(value.chapter, true);
      bookContentCount(value.byteLength);
      bookContentCount(value.chunkCount);
      bookContentHash(value.contentHash);
      if (value.chunkCount < 1) bad();
      const id = value.chapter.personaComplement?.personaId ?? null;
      if (value.persona !== null) profile(value.persona);
      if ((value.persona?.id ?? null) !== id) bad();
    }
  } else if (kind === 'book-cover') {
    bookContentClosed(value, ['schemaVersion', 'cover']);
    one(value.schemaVersion, [1]);
    try {
      validateBookBackupCover(value.cover);
    } catch {
      bad();
    }
  } else {
    const type = kind.slice(5);
    if (kind !== 'book-' + type || !BOOK_RESOURCE_KINDS.includes(type)) bad();
    bookContentClosed(value, ['schemaVersion', 'kind', 'parentId', 'id', 'data']);
    one(value.schemaVersion, [1]);
    if (value.kind !== type) bad();
    bookContentId(value.id);
    const parent = ['scene-body', 'scene-planning', 'scene-reference', 'milestone'].includes(type);
    if (parent) bookContentId(value.parentId);
    else if (value.parentId !== null) bad();
    if (BOOK_RESOURCE_SINGLETONS[type] && value.id !== BOOK_RESOURCE_SINGLETONS[type]) bad();
    resource(type, value.data);
    if (type === 'milestone' && value.data.arcId !== value.parentId) bad();
  }
  return value;
}
