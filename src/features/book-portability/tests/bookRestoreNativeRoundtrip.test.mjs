// @vitest-environment node
import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { webcrypto } from 'node:crypto';
const bridge = vi.hoisted(() => ({ actor: { uid: 'author' }, call: null }));
vi.mock('firebase/functions', () => ({
  getFunctions: () => ({}),
  httpsCallable: (_f, method) => async (input) => ({ data: await bridge.call(method, input) }),
}));
vi.mock('@/shared/lib', () => ({
  auth: {
    get currentUser() {
      return bridge.actor;
    },
  },
  getFirebaseApp: () => ({}),
  firestore: {},
  storage: {},
}));
vi.mock('../services/bookValidationIndex', async () => ({
  createBookValidationIndex: async () => ({
    ...(await import('../../../../functions/test/helpers/bookContentFixture.mjs')).indexFixture(),
    async dispose() {},
  }),
}));
import {
  seedActive,
  finishTerminal,
  capture,
  restore,
  logicalRecords,
  uid,
  byteSource,
} from './bookRestoreRoundtripHarness.mjs';
import { createBookLoreReadService } from '../../../../functions/src/bookLoreRead.mjs';
import { createBookRestoreRemapper } from '../../../../functions/src/bookRestoreRemap.mjs';
function route(f) {
  const api = createBookLoreReadService(f);
  bridge.call = (method, input) => api[method](uid, input);
}
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());
const key = (r) => JSON.stringify([r.kind, r.id]);
const sorted = (rows) => rows.toSorted((a, b) => key(a).localeCompare(key(b), 'en'));
async function expectedRemap(before, p, { indexed = false, media } = {}) {
  const mapper = createBookRestoreRemapper({
      schemaVersion: 1,
      sourceBookId: before.bookId,
      bookId: p.bookId,
      jobToken: p.jobToken,
    }),
    rows = [];
  for (const item of await logicalRecords(before.bytes)) {
    const record = { kind: item.kind, id: item.id, part: 0 };
    if (Buffer.isBuffer(item.value)) {
      rows.push({ ...mapper.rawIdentity(record), value: item.value });
      delete rows.at(-1).part;
      continue;
    }
    const mapped = mapper.mapJSON(record, item.value);
    if (mapped.relations !== null)
      mapped.value.data.relations = await Promise.all(
        mapped.relations.map((r) => mapper.mapLoreRelation(r, async () => false)),
      );
    // Native records receive the new preparation clock (plan 55); history/profile/media dates remain literal.
    const timestamp = p.preparation.timestamp;
    if (item.kind === 'act' || item.kind === 'chapter')
      Object.assign(mapped.value, { createdAt: timestamp, updatedAt: timestamp });
    if (
      ['book-scene', 'book-arc', 'book-milestone', 'book-event'].includes(item.kind) ||
      (item.kind === 'book-lore' && !indexed)
    )
      Object.assign(mapped.value.data, { createdAt: timestamp, updatedAt: timestamp });
    if (item.kind === 'book-scene-source') mapped.value.data.createdAt = timestamp;
    if (item.kind === 'book-metadata') {
      mapped.value.book.createdAt = p.activation.activatedAt;
      mapped.value.book.updatedAt =
        media?.media.state === 'ready' ? media.media.completedAt : p.activation.activatedAt;
    }
    rows.push({ kind: mapped.record.kind, id: mapped.record.id, value: mapped.value });
  }
  return sorted(rows);
}
it('normal full capture restores into a second private book and recaptures all logical data through normal consumers', async () => {
  const f = await seedActive({ cover: true, indexed: false });
  await finishTerminal(f, f.p);
  route(f);
  const a = await capture(f, f.p.bookId);
  a.bookId = f.p.bookId;
  const restored = await restore(f, a.bytes, false);
  expect(restored.p.bookId).not.toBe(f.p.bookId);
  expect(f.records.get('books/' + restored.p.bookId)).toMatchObject({
    authorId: uid,
    status: 'draft',
    createdAt: restored.p.activation.activatedAt,
  });
  const media = await restored.api.getBookRestoreMediaState(uid, {
    restoreId: restored.p.restoreId,
    jobToken: restored.p.jobToken,
  });
  route(f);
  const b = await capture(f, restored.p.bookId),
    expected = await expectedRemap(a, restored.p, { media }),
    actual = sorted(await logicalRecords(b.bytes));
  expect(actual).toEqual(expected);
  expect(actual.some((r) => r.kind === 'book-cover-bytes')).toBe(true);
  expect(actual.some((r) => r.kind === 'work-version')).toBe(true);
  expect(actual.filter((r) => r.kind === 'book-persona').length).toBeGreaterThan(2);
  expect(actual.some((r) => r.kind === 'book-scene-source')).toBe(true);
  expect(actual.some((r) => r.kind === 'book-event')).toBe(true);
  expect(JSON.stringify(actual)).not.toContain('keyBase64');
  expect(byteSource(b.bytes).size).toBeGreaterThan(0);
}, 30000);

for (const version of [1, 2, 3, 4, 5, 6])
  it(
    'legacy JSON v' +
      version +
      ' restores privately and exports a valid current backup without inventing missing data',
    async () => {
      const { bookLegacyFixture } =
          await import('../../../../functions/test/helpers/bookLegacyFixture.mjs'),
        { inspectBookRestoreFile } = await import('../services/inspectBookRestoreFile.ts'),
        { File } = await import('node:buffer'),
        old = bookLegacyFixture(version),
        f = await seedActive(),
        original = structuredClone(f.records.get('books/' + f.p.bookId)),
        restored = await restore(f, Buffer.from(JSON.stringify(old)), false);
      expect(restored.inspected.review.legacy.availability.history).toBe('not-recorded');
      expect(restored.review.summary.universe.observed).toBe(version >= 2 ? 'unavailable' : 'none');
      expect(restored.review.summary.draft.outcome).toBe('none');
      expect(restored.review.summary.counts.versions).toBe(0);
      expect(f.records.get('books/' + restored.p.bookId)).toMatchObject({
        authorId: uid,
        status: 'draft',
      });
      expect(f.records.get('books/' + f.p.bookId)).toEqual(original);
      if (version >= 5) {
        const sources = [...f.records].filter(
          ([path]) =>
            path.startsWith('books/' + restored.p.bookId + '/sceneSources/') &&
            path.split('/').length === 4,
        );
        expect(sources.map(([, v]) => v.original.personaAvailability)).toEqual([
          expect.objectContaining({ reason: 'profile-not-recorded' }),
        ]);
      }
      route(f);
      const a = await capture(f, restored.p.bookId),
        rows = await logicalRecords(a.bytes);
      expect(rows.find((r) => r.kind === 'book-lore').value.data).toMatchObject({
        name: 'Own lore',
        details: 'Own prose',
      });
      expect(rows.filter((r) => r.kind === 'work-version')).toHaveLength(0);
      const text = a.bytes.toString('utf8');
      for (const marker of [
        'GLOBAL NAME MUST NOT COPY',
        'GLOBAL PROSE MUST NOT COPY',
        'GLOBAL BODY MUST NOT COPY',
        'PRIVATE RESOLVED NAME',
        'PRIVATE_TOKEN',
      ])
        expect(text).not.toContain(marker);
      expect(rows.find((r) => r.kind === 'book-cover').value.cover).toEqual({ kind: 'none' });
      if (version >= 5)
        expect(rows.find((r) => r.kind === 'book-scene-body').value.data.content).toBe(
          '\ufeffCanonical scene 🌙',
        );
      const inspected = await inspectBookRestoreFile(new File([a.bytes], 'current.writer'), {
        check: () => {},
      });
      expect(inspected.review.legacy).toBeNull();
      if (version === 1 || version === 6) {
        a.bookId = restored.p.bookId;
        const second = await restore(f, a.bytes, false),
          b = await capture(f, second.p.bookId),
          media = await second.api.getBookRestoreMediaState(uid, {
            restoreId: second.p.restoreId,
            jobToken: second.p.jobToken,
          });
        expect(sorted(await logicalRecords(b.bytes))).toEqual(
          await expectedRemap(a, second.p, { media }),
        );
      }
    },
    30000,
  );

it('legacy absent book profile and unknown source overrides stay explicit through a current-format roundtrip', async () => {
  const { bookLegacyFixture } =
      await import('../../../../functions/test/helpers/bookLegacyFixture.mjs'),
    old = bookLegacyFixture(5),
    f = await seedActive();
  old.scenes.sources[0].original.personaComplement = {
    personaId: old.personas[0].id,
    overrides: [{ traitId: 'old-unrecognized', value: 77 }],
  };
  old.book.personaId = 'missing-book-style';
  const first = await restore(f, Buffer.from(JSON.stringify(old)), false);
  expect(first.inspected.review.warnings).toMatchObject({
    missingPersonas: 1,
    unknownOverrides: 1,
  });
  route(f);
  const a = await capture(f, first.p.bookId);
  a.bookId = first.p.bookId;
  const rows = await logicalRecords(a.bytes),
    metadata = rows.find((r) => r.kind === 'book-metadata'),
    source = rows.find((r) => r.kind === 'book-scene-source');
  expect(metadata.value.book.personaAvailability.reason).toBe('profile-not-recorded');
  expect(source.value.data.original.personaAvailability.reason).toBe('legacy-overrides');
  expect(source.value.data.original.personaComplement.overrides).toEqual([
    { traitId: 'old-unrecognized', value: 77 },
  ]);
  const second = await restore(f, a.bytes, false);
  expect(second.inspected.review.warnings).toMatchObject({
    missingPersonas: 1,
    unknownOverrides: 1,
  });
  const b = await capture(f, second.p.bookId),
    media = await second.api.getBookRestoreMediaState(uid, {
      restoreId: second.p.restoreId,
      jobToken: second.p.jobToken,
    });
  expect(sorted(await logicalRecords(b.bytes))).toEqual(
    await expectedRemap(a, second.p, { media }),
  );
}, 30000);
it('normal scene chapter and manual-history writers remain usable after restore and their new text recaptures', async () => {
  const { createScenesService } = await import('../../../../functions/src/scenes.mjs'),
    { createWorkProgressService } = await import('../../../../functions/src/workProgress.mjs'),
    { digest } = await import('../../../../functions/src/sceneContracts.mjs'),
    { countVisibleWords } = await import('../../../../functions/src/visibleWordCount.mjs'),
    f = await seedActive({ cover: true });
  await finishTerminal(f, f.p);
  route(f);
  const a = await capture(f, f.p.bookId),
    copy = await restore(f, a.bytes, false),
    target = { kind: 'book', id: copy.p.bookId };
  const scenes = createScenesService({ db: f.db, now: () => 5000 }),
    progress = createWorkProgressService({ db: f.db, now: () => 5000 }),
    { ports } = await capture(f, copy.p.bookId),
    records = await logicalRecords((await capture(f, copy.p.bookId)).bytes),
    active = records.find(
      (r) => r.kind === 'book-scene' && !r.value.data.archived && r.value.data.parentId !== null,
    ),
    chapter = records.find((r) => r.kind === 'chapter' && r.value.contentMode === 'legacy'),
    scene = await scenes.getScene(uid, { target, sceneId: active.value.id }),
    total = f.records.get('books/' + target.id).wordCount;
  expect(scene.content).toBe('\ufeffActive own 🌙');
  const resource = { kind: 'chapter', id: chapter.id },
    source = await ports.history.getWorkVersionSource(uid, { target, resource });
  await ports.history.createWorkVersion(uid, {
    target,
    resource,
    operationId: 'roundtrip-manual-version',
    expectedSourceToken: source.sourceToken,
    label: 'Antes da nova escrita',
  });
  const sceneText = '<p>Nova cena com palavras próprias.</p>',
    chapterText = '\ufeffNovo capítulo 🌙';
  await scenes.updateScene(uid, {
    target,
    sceneId: scene.id,
    operationId: 'roundtrip-scene-edit',
    expectedRevision: scene.revision,
    patch: { content: sceneText },
  });
  await progress.saveLegacyChapter(uid, {
    bookId: target.id,
    chapterId: chapter.id,
    operationId: 'roundtrip-chapter-edit',
    expectedContentHash: digest(chapter.value.content),
    content: chapterText,
  });
  expect((await scenes.getScene(uid, { target, sceneId: scene.id })).content).toBe(sceneText);
  expect(f.records.get('books/' + target.id).wordCount).toBe(
    total -
      countVisibleWords(scene.content) -
      countVisibleWords(chapter.value.content) +
      countVisibleWords(sceneText) +
      countVisibleWords(chapterText),
  );
  const changed = await capture(f, target.id),
    rows = await logicalRecords(changed.bytes);
  expect(rows.find((r) => r.kind === 'chapter' && r.id === chapter.id).value.content).toBe(
    chapterText,
  );
  expect(
    rows.find((r) => r.kind === 'book-scene-body' && r.value.parentId === scene.id).value.data
      .content,
  ).toBe(sceneText);
  expect(rows.filter((r) => r.kind === 'work-version')).toHaveLength(3);
  const third = await restore(f, changed.bytes, false),
    again = await capture(f, third.p.bookId),
    final = await logicalRecords(again.bytes);
  expect(
    final.find((r) => r.kind === 'chapter' && r.value.contentMode === 'legacy').value.content,
  ).toBe(chapterText);
  expect(
    final.some((r) => r.kind === 'book-scene-body' && r.value.data.content === sceneText),
  ).toBe(true);
  expect(final.filter((r) => r.kind === 'work-version')).toHaveLength(3);
}, 30000);
it('indexed lore larger than eight MiB preserves literal fields dates aliases and relations through normal recapture', async () => {
  const { loreOnlyRecords, loreRecords } =
      await import('../../../../functions/test/helpers/bookRestorePreparedLoreFixture.mjs'),
    { createHash } = await import('node:crypto'),
    hash = (s) => createHash('sha256').update(s).digest('hex'),
    details = '\ufeff🌙\\n literal\n'.repeat(500000),
    data = {
      name: ' \ufeffGrande 🌙 ',
      category: 'character',
      details,
      aliases: ['', 'same', 'same'],
      createdAt: 12,
      updatedAt: 17,
      structuredDetails: { notes: '' },
      relations: Array.from({ length: 65 }, (_, i) => ({
        targetEntityId: 'missing-' + i,
        relationType: 'knows',
        description: ' ' + i + ' ',
      })),
    },
    f = await seedActive({ records: loreOnlyRecords(loreRecords(data)), indexed: true });
  await finishTerminal(f, f.p);
  expect(Buffer.byteLength(details)).toBeGreaterThan(8 * 1024 * 1024);
  route(f);
  const a = await capture(f, f.p.bookId),
    copy = await restore(f, a.bytes, true),
    b = await capture(f, copy.p.bookId),
    first = (await logicalRecords(a.bytes)).find((r) => r.kind === 'book-lore'),
    second = (await logicalRecords(b.bytes)).find((r) => r.kind === 'book-lore'),
    mapper = createBookRestoreRemapper({
      schemaVersion: 1,
      sourceBookId: f.p.bookId,
      bookId: copy.p.bookId,
      jobToken: copy.p.jobToken,
    });
  expect(hash(first.value.data.details)).toBe(hash(details));
  expect(hash(second.value.data.details)).toBe(hash(details));
  const { details: ignored, relations, ...metadata } = second.value.data;
  void ignored;
  expect(metadata).toEqual({
    name: data.name,
    category: data.category,
    aliases: data.aliases,
    createdAt: 12,
    updatedAt: 17,
    structuredDetails: { notes: '' },
  });
  expect(relations).toEqual(
    await Promise.all(
      first.value.data.relations.map((r) => mapper.mapLoreRelation(r, async () => false)),
    ),
  );
  expect(second.value.id).toBe(mapper.identity('lore', first.value.id));
  const native = f.records.get('books/' + copy.p.bookId + '/lore/' + second.value.id);
  expect(native.payloadStorage.schemaVersion).toBe(2);
  expect(native.details).toBeUndefined();
  expect(copy.inspected.review.legacy).toBeNull();
}, 120000);

for (const scenario of [
  {
    name: 'different draft',
    content: '\ufeffDifferent 🌙',
    chapterId: 'legacy-chapter',
    savedContent: 'Saved original',
    outcome: 'version',
  },
  {
    name: 'empty draft',
    content: '',
    chapterId: 'legacy-chapter',
    savedContent: 'Saved original',
    outcome: 'version',
  },
  {
    name: 'removed chapter draft',
    content: '\ufeffRemoved own 🌙',
    chapterId: 'removed-draft',
    outcome: 'version',
  },
  {
    name: 'already saved draft',
    content: 'Saved original',
    chapterId: 'legacy-chapter',
    savedContent: 'Saved original',
    outcome: 'saved',
  },
])
  it(
    'normal roundtrip preserves ' +
      scenario.name +
      ' without overwriting or recreating the manuscript',
    async () => {
      const { draftRestoreFixture } =
          await import('../../../../functions/test/helpers/bookRestoreDraftFixture.mjs'),
        f = await seedActive({ records: draftRestoreFixture(scenario) });
      await finishTerminal(f, f.p);
      route(f);
      expect(f.review.summary.draft.outcome).toBe(scenario.outcome);
      const a = await capture(f, f.p.bookId);
      a.bookId = f.p.bookId;
      const before = await logicalRecords(a.bytes),
        draft = before.find((r) => r.kind === 'work-version' && r.value.draft);
      if (scenario.outcome === 'version') {
        expect(draft.value).toMatchObject({
          reason: 'manual',
          label: 'Rascunho recuperado do backup',
          draft: { chapter: { createdAt: 111, updatedAt: 222, title: '  Draft title 🌙  ' } },
        });
        expect(
          before
            .find((r) => r.kind === 'work-version-text' && r.id === draft.id)
            .value.toString('utf8'),
        ).toBe(scenario.content);
        expect(draft.value.draft.persona.instructions).toBe('\ufeff  Draft exact\nOnly here  ');
        if (scenario.chapterId === 'removed-draft')
          expect(before.some((r) => r.kind === 'chapter' && r.id === draft.value.resource.id)).toBe(
            false,
          );
      } else expect(draft).toBeUndefined();
      if (scenario.savedContent !== undefined)
        expect(
          before.find((r) => r.kind === 'chapter' && r.value.contentMode === 'legacy').value
            .content,
        ).toBe(scenario.savedContent);
      const second = await restore(f, a.bytes, false),
        b = await capture(f, second.p.bookId),
        media = await second.api.getBookRestoreMediaState(uid, {
          restoreId: second.p.restoreId,
          jobToken: second.p.jobToken,
        });
      expect(second.review.summary.draft.outcome).toBe('none');
      expect(sorted(await logicalRecords(b.bytes))).toEqual(
        await expectedRemap(a, second.p, { media }),
      );
    },
    30000,
  );
