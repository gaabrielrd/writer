import { createHash } from 'node:crypto';
import { encodeBookBackup } from '../../src/bookBackupContainer.mjs';
import {
  bookPackageHeader,
  bookPackageEnd,
  createBookPackageCounts,
  countBookPackageRecord,
  bookPackageSection,
} from '../../src/bookBackupPackage.mjs';
import { DEFAULT_PERSONAS } from '../../src/personaProfile.mjs';
import { BOOK_RESOURCE_KINDS } from '../../src/bookBackupResources.mjs';
export const utf8 = (s) => new TextEncoder().encode(s);
export const hash = (s) => createHash('sha256').update(s).digest('hex');
export const address = (v) => hash(JSON.stringify(v));
export const record = (kind, id, value) => ({
  kind,
  id,
  part: 0,
  payload: utf8(JSON.stringify(value)),
});
export const resource = (kind, id, data, parentId = null) =>
  record('book-' + kind, address([kind, parentId, id]), {
    schemaVersion: 1,
    kind,
    parentId,
    id,
    data,
  });
export const ordered = {
  schemaVersion: 1,
  revision: 1,
  title: 'Title',
  rankA: 'V',
  rankB: 'V',
  createdAt: 1,
  updatedAt: 2,
};
export const persona = { ...structuredClone(DEFAULT_PERSONAS[0]), id: 'custom-used' };
export const hashPort = {
  create() {
    const state = createHash('sha256');
    return {
      update: (bytes) => {
        state.update(bytes);
      },
      digest: () => state.digest('hex'),
      destroy: () => state.destroy(),
    };
  },
};
export function indexFixture() {
  const data = new Map();
  let largest = 0;
  return {
    data,
    get largest() {
      return largest;
    },
    async add(key, value) {
      const encoded = JSON.stringify(key);
      if (data.has(encoded)) throw new Error('duplicate identity');
      largest = Math.max(largest, Buffer.byteLength(JSON.stringify({ key, value })));
      data.set(encoded, structuredClone(value));
    },
    async get(key) {
      return structuredClone(data.get(JSON.stringify(key)));
    },
  };
}
export function fixture() {
  const content = '\ufeffação 🌙',
    bodyHash = hash(content),
    bodyBytes = Buffer.byteLength(content);
  const original = {
    title: 'Source',
    order: 1,
    content: 'Original',
    personaComplement: { personaId: persona.id, overrides: [] },
  };
  const resources = [
    resource('lore', 'entity', {
      name: 'Ana',
      category: 'character',
      details: 'Own',
      relations: [{ targetEntityId: 'missing-lore', relationType: 'knows' }],
    }),
    resource('scene-control', 'unassigned', { rankSlot: 'B' }),
    resource('scene-source', 'chapter', { hash: hash(original.content), original, createdAt: 1 }),
    resource('scene', 'scene', {
      ...ordered,
      parentId: 'missing-chapter',
      stage: 'planned',
      archived: true,
      bodyHash,
      bodyBytes,
    }),
    resource('scene-body', 'current', { content, hash: bodyHash }, 'scene'),
    resource(
      'scene-planning',
      'current',
      { objective: '', conflict: '', pointOfView: '' },
      'scene',
    ),
    resource(
      'scene-reference',
      'ref',
      { kind: 'universe', scopeId: 'gone', entityId: 'secret' },
      'scene',
    ),
    resource('narrative-control', address({ kind: 'arc' }), {
      rankSlot: 'B',
      resource: { kind: 'arc' },
    }),
    resource('arc', 'arc', { ...ordered, initialState: '', objective: '', plannedOutcome: '' }),
    resource('milestone', 'milestone', { ...ordered, arcId: 'arc', notes: '' }, 'arc'),
    resource('event', 'event', { ...ordered, description: '', dateLabel: '3º dia do inverno' }),
    resource('narrative-link', 'link', {
      source: { kind: 'arc', id: 'arc' },
      reference: { kind: 'scene', sceneId: 'scene' },
    }),
  ];
  const profile = (scope, ownerId) =>
    record('book-persona', address([scope, ownerId]), {
      schemaVersion: 1,
      scope,
      ownerId,
      personaId: persona.id,
      profile: structuredClone(persona),
    });
  const version = {
    id: 'version',
    target: { kind: 'book', id: 'book' },
    resource: { kind: 'chapter', id: 'removed' },
    createdAt: 1,
    reason: 'before-restore',
    label: null,
    wordCount: 0,
    byteLength: 0,
    contentHash: hash(''),
    chunkCount: 1,
  };
  return [
    record('book-metadata', 'book', {
      book: { title: 'Livro', personaId: persona.id, universeId: null },
      progress: { wordGoal: null },
      cover: { kind: 'none' },
    }),
    record('act', 'act', { name: null, order: 1 }),
    record('chapter', 'chapter', {
      title: 'Chapter',
      order: 1,
      contentMode: 'scenes',
      rankSlot: 'A',
    }),
    ...resources,
    record('book-resources', 'book', {
      schemaVersion: 1,
      counts: Object.fromEntries(BOOK_RESOURCE_KINDS.map((k) => [k, 1])),
    }),
    profile('book', 'book'),
    profile('scene-source', 'chapter'),
    record('book-personas', 'book', {
      schemaVersion: 1,
      owners: { book: 1, chapter: 1, 'scene-source': 1 },
      bindings: { book: 1, chapter: 0, 'scene-source': 1 },
    }),
    record('book-universe', 'book', { schemaVersion: 1, origin: { kind: 'none' } }),
    record('work-version', 'version', version),
    { kind: 'work-version-text', id: 'version', part: 0, payload: new Uint8Array() },
    record('work-history', 'book', { schemaVersion: 1, versions: 1, byteLength: 0, chunkCount: 1 }),
    record('book-draft', 'book', {
      schemaVersion: 1,
      state: 'present',
      chapter: { id: 'removed-draft', title: 'Draft', order: 1, createdAt: 1, updatedAt: 2 },
      persona: null,
      byteLength: Buffer.byteLength(content),
      chunkCount: 1,
      contentHash: hash(content),
    }),
    { kind: 'book-draft-text', id: 'removed-draft', part: 0, payload: utf8(content) },
    record('book-cover', 'book', { schemaVersion: 1, cover: { kind: 'none' } }),
  ];
}
export async function source(records, bookId = 'book') {
  const counts = createBookPackageCounts();
  for (const r of records) countBookPackageRecord(counts, bookPackageSection(r.kind), r);
  const chunks = [];
  for await (const chunk of encodeBookBackup([
    bookPackageHeader(bookId),
    ...records,
    bookPackageEnd(bookId, counts),
  ]))
    chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  return {
    size: bytes.length,
    read: async (offset, length) => bytes.subarray(offset, offset + length),
  };
}
