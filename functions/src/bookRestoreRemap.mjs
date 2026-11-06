import { createHash } from 'node:crypto';
import { createBookEditorialRemapper } from './bookEditorialRemap.mjs';
import { digest } from './sceneContracts.mjs';
import {
  bookContentClosed as closed,
  bookContentId as id,
  bookContentHash as hash,
  bookContentInvalid as bad,
  validateBookBackupJSONItem,
} from './bookBackupSchema.mjs';
import { BOOK_RESOURCE_KINDS } from './bookBackupResources.mjs';
import { sequenceKey } from './narrativeContracts.mjs';
const kinds = [
  'act',
  'chapter',
  'scene',
  'lore',
  'arc',
  'milestone',
  'event',
  'version',
  'persona',
  'image',
];
const singletonRecords = new Set([
  'book-metadata',
  'book-resources',
  'book-personas',
  'book-universe',
  'work-history',
  'book-draft',
  'book-cover',
]);
export const BOOK_RESTORE_RELATION_ITEMS = 64;

/** Pure identity projection. Input must also have the server's M20 read proof. */
export function createBookRestoreRemapper(input) {
  closed(input, ['schemaVersion', 'jobToken', 'sourceBookId', 'bookId']);
  if (input.schemaVersion !== 1) bad();
  hash(input.jobToken);
  id(input.sourceBookId);
  id(input.bookId);
  if (input.bookId === input.sourceBookId) bad();
  const context = structuredClone(input);
  function identity(kind, original, parent = null) {
    if (!kinds.includes(kind)) bad();
    id(original);
    if (kind === 'milestone') id(parent);
    else if (parent !== null) bad();
    return (
      (kind === 'persona' ? 'custom-' : 'restore-') +
      digest({
        domain: 'writer-book-restore-identity',
        ...context,
        kind,
        parent,
        id: original,
      })
    );
  }
  const editorial = createBookEditorialRemapper({
    sourceBookId: context.sourceBookId,
    bookId: context.bookId,
    // Bind new archive IDs to this native job without expanding the pure mapper's closed input.
    hashBytes: (bytes) =>
      createHash('sha256')
        .update('writer-book-restore-editorial-v1\0')
        .update(context.jobToken)
        .update('\0')
        .update(bytes)
        .digest('hex'),
    mapResource: (kind, original, parent) =>
      kinds.includes(kind) ? identity(kind, original, parent) : null,
  });
  const maybe = (kind, value) => (value === null ? null : identity(kind, value));
  function complement(value) {
    if (value) value.personaId = identity('persona', value.personaId);
  }
  function availability(value) {
    if (value.personaAvailability)
      value.personaAvailability.personaId = identity(
        'persona',
        value.personaAvailability.personaId,
      );
  }
  function chapter(value) {
    availability(value);
    if (Object.hasOwn(value, 'actId')) value.actId = maybe('act', value.actId);
    complement(value.personaComplement);
    return value;
  }
  function profile(value) {
    value.id = identity('persona', value.id);
    return value;
  }
  function loreReference(value) {
    if (value.kind === 'book' && value.scopeId === context.sourceBookId) {
      value.scopeId = context.bookId;
      value.entityId = identity('lore', value.entityId);
    }
    return value;
  }
  function source(value) {
    const oldArc = value.kind === 'milestone' ? value.arcId : null;
    if (Object.hasOwn(value, 'id')) value.id = identity(value.kind, value.id, oldArc);
    if (oldArc !== null) value.arcId = identity('arc', oldArc);
    return value;
  }
  function reference(value) {
    if (value.kind === 'lore') loreReference(value.reference);
    else value[value.kind + 'Id'] = identity(value.kind, value[value.kind + 'Id']);
    return value;
  }
  function cover(value) {
    if (value.kind === 'library') value.imageId = identity('image', value.imageId);
    return value;
  }
  function rawIdentity(record) {
    closed(record, ['kind', 'id', 'part']);
    if (!Number.isSafeInteger(record.part) || record.part < 0 || record.part > 0xffffffff) bad();
    const kind = {
      'work-version-text': 'version',
      'book-draft-text': 'chapter',
      'book-cover-bytes': 'image',
    }[record.kind];
    if (!kind) bad();
    return { ...record, id: identity(kind, record.id) };
  }
  function mapJSON(record, inputValue) {
    closed(record, ['kind', 'id', 'part']);
    id(record.id);
    if (record.part !== 0) bad();
    validateBookBackupJSONItem(record.kind, inputValue, context.sourceBookId);
    const value = structuredClone(inputValue),
      kind = record.kind;
    let newId,
      relations = null;
    if (['book-editorial-artifact', 'book-editorial-link', 'book-editorial'].includes(kind)) {
      const restoration = {
        execution: 'disabled',
        publication: 'private',
        review: 'required',
        historical: true,
      };
      if (kind === 'book-editorial') {
        if (record.id !== context.sourceBookId || value.bookId !== context.sourceBookId) bad();
        return {
          record: { kind, id: context.bookId, part: 0 },
          value: { ...value, bookId: context.bookId },
          relations,
          restoration,
        };
      }
      if (record.id !== value.id) bad();
      const mapped =
        kind === 'book-editorial-artifact'
          ? editorial.artifact(value).record
          : editorial.link(value);
      return { record: { kind, id: mapped.id, part: 0 }, value: mapped, relations, restoration };
    }

    if (singletonRecords.has(kind)) {
      if (record.id !== context.sourceBookId) bad();
      newId = context.bookId;
      if (kind === 'book-metadata') {
        availability(value.book);
        if (value.book.personaId != null)
          value.book.personaId = identity('persona', value.book.personaId);
        if (value.book.coverImageId != null)
          value.book.coverImageId = identity('image', value.book.coverImageId);
        cover(value.cover);
      } else if (kind === 'book-draft' && value.state === 'present') {
        value.chapter.id = identity('chapter', value.chapter.id);
        chapter(value.chapter);
        if (value.persona) profile(value.persona);
      } else if (kind === 'book-cover') cover(value.cover);
    } else if (kind === 'act' || kind === 'chapter') {
      newId = identity(kind, record.id);
      if (kind === 'chapter') chapter(value);
    } else if (kind === 'book-persona') {
      if (record.id !== digest([value.scope, value.ownerId])) bad();
      if (value.scope === 'book') {
        if (value.ownerId !== context.sourceBookId) bad();
        value.ownerId = context.bookId;
      } else value.ownerId = identity('chapter', value.ownerId);
      value.personaId = identity('persona', value.personaId);
      profile(value.profile);
      newId = digest([value.scope, value.ownerId]);
    } else if (kind === 'work-version') {
      if (record.id !== value.id) bad();
      newId = value.id = identity('version', value.id);
      value.target.id = context.bookId;
      value.resource.id = identity(value.resource.kind, value.resource.id);
      if (value.draft) {
        value.draft.chapter.id = identity('chapter', value.draft.chapter.id);
        chapter(value.draft.chapter);
        if (value.draft.persona) profile(value.draft.persona);
      }
    } else {
      const type = value.kind,
        data = value.data,
        oldParent = value.parentId,
        oldId = value.id;
      if (!BOOK_RESOURCE_KINDS.includes(type) || record.id !== digest([type, oldParent, oldId]))
        bad();
      if (['scene-body', 'scene-planning', 'scene-reference'].includes(type))
        value.parentId = identity('scene', oldParent);
      else if (type === 'milestone') value.parentId = identity('arc', oldParent);
      if (type === 'scene-control' || type === 'scene-body' || type === 'scene-planning') {
        // The source schema has already checked unassigned/current.
      } else if (type === 'scene-source') {
        value.id = identity('chapter', oldId);
        chapter(data.original);
      } else if (type === 'scene-reference') {
        loreReference(data);
        value.id = digest(data);
      } else if (type === 'narrative-control') {
        source(data.resource);
        value.id = sequenceKey(data.resource);
      } else if (type === 'narrative-link') {
        source(data.source);
        reference(data.reference);
        value.id = digest({ source: data.source, reference: data.reference });
      } else {
        value.id = identity(type, oldId, type === 'milestone' ? oldParent : null);
        if (type === 'scene') {
          data.parentId = maybe('chapter', data.parentId);
          if (Object.hasOwn(data, 'formerParentId'))
            data.formerParentId = maybe('chapter', data.formerParentId);
        } else if (type === 'milestone') data.arcId = value.parentId;
        else if (type === 'lore' && Object.hasOwn(data, 'relations')) {
          relations = data.relations;
          delete data.relations;
        }
      }
      newId = digest([type, value.parentId, value.id]);
    }
    return { record: { kind, id: newId, part: 0 }, value, relations };
  }
  async function mapLoreRelation(inputValue, hasLocalLore) {
    // Reuse the closed schema to validate one relation without validating a whole book.
    const value = structuredClone(inputValue);
    validateBookBackupJSONItem(
      'book-lore',
      {
        schemaVersion: 1,
        kind: 'lore',
        parentId: null,
        id: 'relation-check',
        data: { name: '', category: 'other', relations: [value] },
      },
      context.sourceBookId,
    );
    const external = /^(adventure|universe):([^:]+):(.+)$/.test(value.targetEntityId);
    if (external) {
      if (typeof hasLocalLore !== 'function') bad();
      const local = await hasLocalLore(value.targetEntityId);
      if (typeof local !== 'boolean') bad();
      if (!local) return value;
    }
    value.targetEntityId = identity('lore', value.targetEntityId);
    return value;
  }
  function editorialIdentity(record) {
    closed(record, ['kind', 'id', 'part']);
    if (record.part !== 0) bad();
    if (record.kind === 'book-editorial') {
      if (record.id !== context.sourceBookId) bad();
      return digest({ domain: 'writer-book-restore-editorial-summary-v1', ...context });
    }
    const kind = { 'book-editorial-artifact': 'artifact', 'book-editorial-link': 'link' }[
      record.kind
    ];
    if (!kind) bad();
    return editorial.identity(kind, record.id);
  }
  return Object.freeze({
    identity,
    mapJSON,
    mapLoreRelation,
    rawIdentity,
    editorialIdentity,
    editorialReference: editorial.reference,
  });
}
