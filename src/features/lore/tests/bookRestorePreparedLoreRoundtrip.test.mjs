// @vitest-environment node
import { expect, it } from 'vitest';
import { createBookLoreReadClient } from '../services/bookLoreReadClient.ts';
import {
  preparedLoreFixture,
  loreOnlyRecords,
  uid,
} from '../../../../functions/test/helpers/bookRestorePreparedLoreFixture.mjs';
import {
  source,
  indexFixture,
  hashPort,
} from '../../../../functions/test/helpers/bookContentFixture.mjs';
import { validateBookBackupContent } from '../../../../functions/src/bookBackupContent.mjs';
import { digest } from '../../../../functions/src/sceneContracts.mjs';
import { legacyMutation as mutation } from '../../../../functions/test/helpers/bookLegacyRestoreFixture.mjs';
function client(f, intercept) {
  return createBookLoreReadClient(
    async (method, input) => {
      const result = await f.reader[method](uid, input);
      return intercept ? intercept(method, input, result) : result;
    },
    () => {},
    { tokenVersion: 2 },
  );
}
async function archive(f, c) {
  const parts = [];
  const proof = await c.writePortable(f.p.bookId, f.entityId, async (part, payload) => {
    parts.push({
      kind: 'book-lore',
      id: digest(['lore', null, f.entityId]),
      part,
      payload: new Uint8Array(payload),
    });
  });
  const records = loreOnlyRecords(parts, f.p.bookId),
    input = await source(records, f.p.bookId),
    report = await validateBookBackupContent(input, { index: indexFixture(), hash: hashPort });
  return { proof, parts, records, input, report };
}
it('prepared large lore recaptures through the real portable producer, validates a sealed file and restores into a second private job', async () => {
  const data = {
      name: '',
      category: 'other',
      summary: '',
      details: '\ufeff' + '🌙'.repeat(2200000),
      aliases: ['', 'same', 'same'],
      relations: Array.from({ length: 65 }, (_, i) => ({
        targetEntityId: i % 2 ? 'missing' : 'entity',
        relationType: '',
        ...(i === 63 ? { description: '\ufeff' + 'description 🌙'.repeat(650000) } : {}),
      })),
    },
    f = await preparedLoreFixture(data),
    c = client(f),
    first = await archive(f, c);
  expect(first.proof.index.dates).toEqual({});
  expect(first.proof.byteLength).toBeGreaterThan(16 * 1024 * 1024);
  expect(first.report.totals.resources.lore).toBe(1);
  const g = await preparedLoreFixture(null, {
      restoreId: 'prepared-roundtrip-0002',
      sourceBookId: f.p.bookId,
      sourceLoreId: f.entityId,
      records: first.records,
    }),
    got = await client(g).get(g.p.bookId, g.entityId),
    expected = structuredClone(data);
  expected.relations = expected.relations.map((r) => ({
    ...r,
    targetEntityId: g.mapper.identity('lore', f.mapper.identity('lore', r.targetEntityId)),
  }));
  expect(got.data).toEqual(expected);
  expect(f.records.has('books/' + f.p.bookId)).toBe(false);
  expect(g.records.has('books/' + g.p.bookId)).toBe(false);
  expect(f.p.preparation.loreStaging.step).toBe('done');
  expect(g.p.preparation.loreStaging.step).toBe('done');
}, 120000);
for (const data of [
  { name: '', category: 'other' },
  { name: 'N', category: 'other', relations: [], createdAt: 0 },
  {
    name: 'N',
    category: 'other',
    summary: '',
    details: '',
    aliases: ['', 'same', 'same'],
    structuredDetails: { notes: '' },
    isPublic: false,
    relations: [],
    updatedAt: 0,
  },
  {
    name: 'N',
    category: 'other',
    details: '\ufeff literal 🌙 "quote"',
    createdAt: 1,
    updatedAt: 2,
  },
])
  it(
    'prepared small lore recapture preserves all logical fields ' + JSON.stringify(data),
    async () => {
      const f = await preparedLoreFixture(data),
        c = client(f),
        a = await archive(f, c),
        emitted = JSON.parse(Buffer.concat(a.parts.map((p) => Buffer.from(p.payload))).toString());
      expect(emitted.data).toEqual(data);
      const g = await preparedLoreFixture(null, {
        restoreId: 'prepared-small-copy-0002',
        sourceBookId: f.p.bookId,
        sourceLoreId: f.entityId,
        records: a.records,
      });
      expect((await client(g).get(g.p.bookId, g.entityId)).data).toEqual(data);
      expect(g.p.bookId).not.toBe(f.p.bookId);
    },
  );
it('cancel after an authorized unit prevents portable completion and further prepared reads', async () => {
  const f = await preparedLoreFixture({
    name: 'N',
    category: 'other',
    details: 'x'.repeat(150000),
  });
  let cancelled = false;
  const c = client(f, async (method, input, result) => {
    if (!cancelled && method === 'readBookLorePart' && input.field === 'details') {
      cancelled = true;
      await f
        .factory()
        .cancelBookRestore(uid, mutation(f.id, f.p, f.id + '-cancel-during-capture'));
    }
    return result;
  });
  await expect(archive(f, c)).rejects.toThrow();
  expect(cancelled).toBe(true);
  expect(f.records.has('books/' + f.p.bookId)).toBe(false);
});
it('a missing original journal on a later part prevents completion despite valid physical bytes and the previous header', async () => {
  const f = await preparedLoreFixture({
    name: 'N',
    category: 'other',
    details: 'x'.repeat(150000),
  });
  let removed = false;
  const c = client(f, (method, input, result) => {
    if (!removed && method === 'readBookLorePart' && input.field === 'details') {
      const head = f.records.get('books/' + f.p.bookId + '/lore/' + f.entityId),
        bodyId = head.payloadStorage.fields.details.manifest.bodyId,
        journal =
          'users/' +
          uid +
          '/bookRestores/' +
          f.id +
          '/materializationArtifacts/' +
          digest(['payload-chunk', bodyId + ':000000000000001']);
      expect(f.records.delete(journal)).toBe(true);
      removed = true;
    }
    return result;
  });
  await expect(archive(f, c)).rejects.toThrow();
  expect(removed).toBe(true);
});
