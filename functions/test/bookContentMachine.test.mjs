import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createBookContentState,
  createBookContentMachine,
  BOOK_CONTENT_CHECKPOINT_BYTES,
  BOOK_CONTENT_STEP_ITEMS,
} from '../src/bookContentMachine.mjs';
import { validateBookBackupContent } from '../src/bookBackupContent.mjs';
import {
  fixture,
  indexFixture,
  hashPort,
  source,
  hash,
  record,
  resource,
  ordered,
} from './helpers/bookContentFixture.mjs';
const meta = (r) => ({ kind: r.kind, id: r.id, part: r.part });
const parsed = (r) => JSON.parse(new TextDecoder().decode(r.payload));
const bad = { code: 'invalid-record' };
function context(legacy = false) {
  const index = indexFixture(),
    ports = { index, hash: hashPort },
    initial = createBookContentState('book', legacy);
  return { index, ports, initial, machine: createBookContentMachine(initial, ports) };
}
async function drive(records = fixture(), { resume = false, limit = 64, legacy = false } = {}) {
  const f = context(legacy),
    snapshots = [];
  let machine = f.machine;
  const checkpoint = () => {
    const value = machine.checkpoint();
    snapshots.push(value);
    assert.ok(Buffer.byteLength(JSON.stringify(value)) <= BOOK_CONTENT_CHECKPOINT_BYTES);
    if (resume) machine = createBookContentMachine(JSON.parse(JSON.stringify(value)), f.ports);
  };
  for (let at = 0; at < records.length; at++) {
    const r = records[at],
      value = parsed(r);
    await machine.acceptJSON(meta(r), value);
    checkpoint();
    while (machine.checkpoint().relations) {
      const before = f.index.data.size;
      await machine.advanceRelations(meta(r), value, limit);
      assert.ok(f.index.data.size - before <= limit);
      checkpoint();
    }
    const raw = machine.checkpoint().raw;
    if (raw) {
      const parts = records.slice(at + 1, at + 1 + raw.chunkCount),
        joined = Buffer.concat(parts.map((p) => p.payload));
      assert.ok(parts.every((p, i) => p.kind === raw.kind && p.id === raw.id && p.part === i));
      await machine.acceptRawProof({
        byteLength: joined.length,
        chunkCount: parts.length,
        contentHash: hash(joined),
      });
      at += parts.length;
      checkpoint();
    }
  }
  await machine.beginFinish();
  checkpoint();
  while (machine.checkpoint().phase !== 'done') {
    const before = machine.checkpoint();
    await machine.advanceFinish(limit);
    const after = machine.checkpoint();
    assert.ok(after.edgeCursor - before.edgeCursor + after.rowCursor - before.rowCursor <= limit);
    checkpoint();
  }
  return { ...f, machine, snapshots, result: machine.result() };
}
function patch(records, kind, change) {
  return records.map((r) => (r.kind === kind ? record(kind, r.id, change(parsed(r))) : r));
}
test('JSON checkpoint at every item/raw/finish step preserves the public validator result', async () => {
  const input = fixture(),
    continuous = await drive(input),
    resumed = await drive(input, { resume: true, limit: 1 });
  const report = await validateBookBackupContent(await source(input), {
    index: indexFixture(),
    hash: hashPort,
  });
  assert.deepEqual(resumed.result, continuous.result);
  assert.equal(resumed.result.validation, 'semantic-only');
  assert.deepEqual(resumed.result.totals, report.totals);
  assert.deepEqual(resumed.result.warnings, report.warnings);
  assert.ok(resumed.snapshots.some((s) => s.phase === 'edges'));
  assert.ok(resumed.snapshots.some((s) => s.phase === 'rows'));
  assert.ok(resumed.snapshots.some((s) => s.raw));
  assert.equal(resumed.result.totals.versions, 1);
});
test('checkpoints omit names, prose, profiles and rendered text while retaining needed identity', async () => {
  const f = await drive(fixture(), { resume: true, limit: 2 });
  const text = JSON.stringify(f.snapshots);
  for (const authorText of [
    'Livro',
    'Title',
    'Own',
    'Original',
    'ação',
    'instructions',
    'description',
    'traits',
  ])
    assert.equal(text.includes(authorText), false, authorText);
  assert.ok(f.snapshots.some((s) => s.book?.personaId === 'custom-used'));
  const last = f.machine.checkpoint();
  last.totals.chapters = 999;
  last.warnings.missingDates = 999;
  assert.equal(f.machine.result().totals.chapters, 1);
  assert.notEqual(f.machine.result().warnings.missingDates, 999);
  const result = f.machine.result();
  result.totals.chapters = 999;
  assert.equal(f.machine.result().totals.chapters, 1);
});
test('more than sixty-four lore relations continue in bounded batches without losing warnings', async () => {
  const records = patch(fixture(), 'book-lore', (v) => ({
    ...v,
    data: {
      ...v.data,
      relations: Array.from({ length: 205 }, (_, i) => ({
        targetEntityId: 'missing-' + i,
        relationType: 'knows',
        description: 'PRIVATE RELATION PROSE',
      })),
    },
  }));
  const f = await drive(records, { resume: true, limit: 3 });
  assert.equal(f.result.warnings.danglingLocalReferences, 205);
  assert.ok(f.snapshots.filter((s) => s.relations).length > 60);
  assert.equal(JSON.stringify(f.snapshots).includes('PRIVATE RELATION PROSE'), false);
  assert.equal(f.machine.checkpoint().relations, null);
});
test('pending lore fanout rejects a changed item with identical IDs and poisons the instance', async () => {
  const f = context(),
    r = fixture().find((r) => r.kind === 'book-lore'),
    value = parsed(r);
  await f.machine.acceptJSON(meta(r), value);
  const pending = f.machine.checkpoint();
  assert.ok(pending.relations);
  const changed = structuredClone(value);
  changed.data.relations[0].targetEntityId = 'changed';
  await assert.rejects(f.machine.advanceRelations(meta(r), changed, 1), bad);
  assert.throws(() => f.machine.checkpoint(), bad);
  assert.throws(() => f.machine.result(), bad);
  const recovered = createBookContentMachine(pending, f.ports);
  await recovered.advanceRelations(meta(r), value, 1);
  assert.equal(recovered.checkpoint().relations, null);
});
test('finishing after checkpoint still rejects missing required bodies and duplicate active rank', async () => {
  let records = fixture().filter((r) => r.kind !== 'book-scene-body');
  records = patch(records, 'book-resources', (v) => ({
    ...v,
    counts: { ...v.counts, 'scene-body': 0 },
  }));
  await assert.rejects(drive(records, { resume: true, limit: 1 }), bad);
  const duplicate = resource('arc', 'another', {
    ...ordered,
    initialState: '',
    objective: '',
    plannedOutcome: '',
  });
  records = fixture().flatMap((r) => (r.kind === 'book-resources' ? [duplicate, r] : [r]));
  records = patch(records, 'book-resources', (v) => ({ ...v, counts: { ...v.counts, arc: 2 } }));
  await assert.rejects(drive(records, { resume: true, limit: 1 }), /duplicate identity/);
});
test('raw expectation survives JSON resume and only matching totals/hash complete it', async () => {
  const f = context(),
    r = fixture().find((r) => r.kind === 'work-version'),
    value = parsed(r);
  await f.machine.acceptJSON(meta(r), value);
  const pending = f.machine.checkpoint();
  assert.equal(pending.raw.kind, 'work-version-text');
  assert.equal(pending.totals.versions, 0);
  assert.throws(() => f.machine.result(), bad);
  await assert.rejects(
    f.machine.acceptRawProof({ byteLength: 0, chunkCount: 1, contentHash: '0'.repeat(64) }),
    bad,
  );
  assert.throws(() => f.machine.checkpoint(), bad);
  const recovered = createBookContentMachine(JSON.parse(JSON.stringify(pending)), f.ports);
  await recovered.acceptRawProof({ byteLength: 0, chunkCount: 1, contentHash: hash('') });
  assert.equal(recovered.checkpoint().raw, null);
  assert.equal(recovered.checkpoint().totals.versions, 1);
  await assert.rejects(
    recovered.acceptRawProof({ byteLength: 0, chunkCount: 1, contentHash: hash('') }),
    bad,
  );
});
test('records cannot skip raw/fanout and completion cannot bypass pending obligations', async () => {
  for (const kind of ['work-version', 'book-lore']) {
    const f = context(),
      r = fixture().find((r) => r.kind === kind);
    await f.machine.acceptJSON(meta(r), parsed(r));
    const pending = f.machine.checkpoint();
    await assert.rejects(f.machine.beginFinish(), bad);
    const other = createBookContentMachine(pending, f.ports),
      chapter = fixture().find((r) => r.kind === 'chapter');
    await assert.rejects(other.acceptJSON(meta(chapter), parsed(chapter)), bad);
  }
});
test('new format remains strict while legacy mode preserves only approved persona absence warnings', async () => {
  const records = fixture().filter((r) => r.kind !== 'book-persona');
  const corrected = patch(records, 'book-personas', (v) => ({
    ...v,
    bindings: { book: 0, chapter: 0, 'scene-source': 0 },
  }));
  await assert.rejects(drive(corrected, { resume: true, limit: 1 }), bad);
  const legacy = await drive(corrected, { resume: true, limit: 1, legacy: true });
  assert.equal(legacy.result.warnings.missingPersonas, 2);
  assert.equal(legacy.result.legacy, true);
});
test('closed bounded checkpoint rejects unknown schemas, extra data and inconsistent cursors', () => {
  const f = context();
  const changes = [
    (s) => {
      s.schemaVersion = 2;
    },
    (s) => {
      s.extra = 'prose';
    },
    (s) => {
      s.phase = 'ready';
    },
    (s) => {
      s.edgeCursor = 1;
    },
    (s) => {
      s.rowCount = -1;
    },
    (s) => {
      s.bookId = 'bad/id';
    },
    (s) => {
      s.totals.resources.extra = 0;
    },
    (s) => {
      s.ended = ['book-cover', 'book-cover'];
    },
    (s) => {
      s.phase = 'edges';
    },
    (s) => {
      s.extra = 'x'.repeat(BOOK_CONTENT_CHECKPOINT_BYTES + 1);
    },
  ];
  for (const change of changes) {
    const state = structuredClone(f.initial);
    change(state);
    assert.throws(() => createBookContentMachine(state, f.ports), bad);
  }
  f.initial.bookId = 'changed';
  assert.equal(f.machine.checkpoint().bookId, 'book');
});
test('checkpoint and competing operation are refused during I/O; inputs are frozen before await', async () => {
  const f = context(),
    add = f.index.add;
  let release, entered;
  const gate = new Promise((resolve) => {
      release = resolve;
    }),
    started = new Promise((resolve) => {
      entered = resolve;
    });
  f.index.add = async (...args) => {
    entered();
    await gate;
    return add(...args);
  };
  const r = fixture()[0],
    value = parsed(r),
    descriptor = meta(r);
  const running = f.machine.acceptJSON(descriptor, value);
  await started;
  value.book.universeId = 'changed';
  descriptor.id = 'changed';
  assert.throws(() => f.machine.checkpoint(), bad);
  await assert.rejects(f.machine.acceptJSON(meta(r), parsed(r)), bad);
  release();
  await running;
  assert.equal(f.machine.checkpoint().book.universeId, null);
  assert.equal(f.machine.checkpoint().bookId, 'book');
});
test('index errors and aborts never expose an incomplete checkpoint or positive result', async () => {
  const r = fixture()[0];
  for (const mode of ['error', 'abort']) {
    const f = context(),
      controller = new AbortController(),
      error = new Error('index unavailable');
    f.index.add = async () => {
      if (mode === 'abort') controller.abort();
      else throw error;
    };
    const m = createBookContentMachine(f.initial, { ...f.ports, signal: controller.signal });
    await assert.rejects(
      m.acceptJSON(meta(r), parsed(r)),
      mode === 'abort' ? { name: 'AbortError' } : error,
    );
    assert.throws(() => m.checkpoint());
    assert.throws(() => m.result());
  }
});
test('step limits are explicit and reject zero, overflow and nonintegral budgets', async () => {
  assert.equal(BOOK_CONTENT_STEP_ITEMS, 64);
  for (const limit of [0, 65, 1.5, NaN]) {
    const f = context(),
      r = fixture().find((r) => r.kind === 'book-lore');
    await f.machine.acceptJSON(meta(r), parsed(r));
    await assert.rejects(f.machine.advanceRelations(meta(r), parsed(r), limit), bad);
  }
  const f = await drive(fixture(), { resume: true });
  const state = f.machine.checkpoint();
  for (const limit of [0, 65, 1.5, NaN]) {
    const m = createBookContentMachine(state, f.ports);
    await assert.rejects(m.advanceFinish(limit), bad);
  }
});

test('cover checkpoints keep only identity/hash/size and omit the library name', async () => {
  const imageId = 'cover-image-0001',
    bytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6xkAAAAASUVORK5CYII=',
      'base64',
    );
  let records = patch(fixture(), 'book-metadata', (v) => ({
    ...v,
    book: { ...v.book, coverImageId: imageId },
    cover: { kind: 'library', imageId },
  }));
  records = patch(records, 'book-cover', (v) => ({
    ...v,
    cover: {
      kind: 'library',
      imageId,
      contentType: 'image/png',
      byteLength: bytes.length,
      chunkCount: 1,
      contentHash: hash(bytes),
      name: 'PRIVATE COVER TITLE',
      createdAt: 1,
      updatedAt: 2,
    },
  }));
  records.push({ kind: 'book-cover-bytes', id: imageId, part: 0, payload: bytes });
  const f = await drive(records, { resume: true, limit: 1 });
  assert.equal(f.result.totals.coverBytes, bytes.length);
  assert.equal(JSON.stringify(f.snapshots).includes('PRIVATE COVER TITLE'), false);
  assert.ok(f.snapshots.some((s) => s.raw?.binary && s.raw.id === imageId));
});
