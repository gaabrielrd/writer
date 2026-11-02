// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { planBookLoreEdit } from '../services/bookLoreWritePlan.ts';
import { prepareBookLoreWritePayload } from '../services/bookLoreWritePayload.ts';
import { createBookLoreReadClient } from '../services/bookLoreReadClient.ts';
import { createBookLoreReadService } from '../../../../functions/src/bookLoreRead.mjs';
import { adventureImportDb } from '../../../../functions/test/helpers/adventureImportDb.mjs';
import {
  sourceInspectionFixture,
  finishSourceInspection,
} from '../../../../functions/test/helpers/bookLoreSourceInspectionFixture.mjs';
import { createBookLoreFieldUploadService } from '../../../../functions/src/bookLoreFieldUpload.mjs';
import {
  fieldUploadIntent,
  fieldUploadStartHash,
} from '../../../../functions/src/bookLoreFieldUploadContracts.mjs';
import { createBookLoreEditReservationService } from '../../../../functions/src/bookLoreEditReservation.mjs';
import {
  editReservationIntent,
  editReservationStartHash,
} from '../../../../functions/src/bookLoreEditReservationContracts.mjs';
import { finishCompilation } from '../../../../functions/test/helpers/bookLoreEditCompilationFixture.mjs';
afterEach(() => vi.unstubAllGlobals());
const options = { yieldControl: async () => {} };
const relations = () =>
  Array.from({ length: 130 }, (_, i) => ({
    targetEntityId: 'target-' + i,
    relationType: 'knows',
    ...(i % 2 ? { description: '' } : {}),
  }));
const data = (large = false) => ({
  name: 'Literal 🌙',
  category: 'character',
  aliases: ['', 'same', 'same'],
  details: '\ufeff' + (large ? 'x'.repeat(9 * 1024 * 1024) : 'PRIVATE'),
  isPublic: true,
  structuredDetails: { notes: '  ' },
  relations: relations(),
});
async function fixture(mode = 'v1', large = false) {
  vi.stubGlobal('crypto', webcrypto);
  const f = adventureImportDb({ nativeUpdates: true }),
    source = await sourceInspectionFixture(f.db, { mode, data: data(large) }),
    server = createBookLoreReadService({ db: f.db }),
    calls = [],
    client = createBookLoreReadClient(
      async (name, input) => {
        calls.push({ name, input });
        return server[name](source.uid, input);
      },
      () => {},
    );
  return { ...f, source, client, calls, uid: source.uid, bookId: source.bookId, loreId: source.id };
}
async function upload(f, sourceToken, item, index) {
  const uploadId = 'browser-roundtrip-upload-' + index,
    codec = await prepareBookLoreWritePayload(
      { uid: f.uid, bookId: f.bookId, loreId: f.loreId, uploadId, ...item },
      options,
    ),
    intent = fieldUploadIntent(f.uid, {
      bookId: f.bookId,
      loreId: f.loreId,
      sourceToken,
      uploadId,
      target: item.target,
      manifest: codec.manifest,
    }),
    startHash = fieldUploadStartHash(intent),
    api = createBookLoreFieldUploadService({ db: f.db, now: () => 2500 }),
    control = (p, operationId) => ({
      uploadId,
      startHash,
      jobToken: p.jobToken,
      expectedRevision: p.revision,
      operationId,
    });
  let p = await api.startBookLoreFieldUpload(f.uid, intent);
  for await (const part of codec.parts())
    p = (
      await api.appendBookLoreFieldUpload(f.uid, {
        ...control(p, 'append-browser-' + part.index),
        ...part,
      })
    ).progress;
  while (p.phase === 'verifying')
    p = (await api.advanceBookLoreFieldSeal(f.uid, control(p, 'seal-browser-' + p.sealIndex)))
      .progress;
  expect(p.phase).toBe('sealed');
  return { target: item.target, ref: { uploadId, startHash, jobToken: p.jobToken }, codec };
}
for (const mode of ['inline', 'v1', 'v2'])
  it(
    'C1 capture -> client diff/bytes -> actual seal/reserve/compose/adopt -> C1 ' + mode,
    async () => {
      const f = await fixture(mode, mode === 'v1'),
        captured = await f.client.capture(f.bookId, f.loreId),
        inspected = await finishSourceInspection(f.source),
        before = structuredClone(captured.data),
        oldHead = f.records.get(f.source.seed.path),
        nextRelations = structuredClone(before.relations);
      nextRelations[129].description = '\ufeff changed e\u0301 🌙';
      const plan = planBookLoreEdit(captured, [
        { field: 'summary', value: '  literal summary  ' },
        { field: 'relations', value: nextRelations },
      ]);
      expect(plan.uploads.map((u) => u.target)).toEqual([
        { field: 'summary' },
        { field: 'relations', page: 2, count: 2 },
      ]);
      const uploads = [];
      for (const [index, item] of plan.uploads.entries())
        uploads.push(await upload(f, captured.sourceToken, item, index));
      const fields = Object.fromEntries(
          plan.fields.map((c) => [c.field, c.remove ? null : uploads[c.upload].ref]),
        ),
        editId = 'browser-roundtrip-edit',
        intent = editReservationIntent(f.uid, {
          bookId: f.bookId,
          loreId: f.loreId,
          editId,
          sourceToken: captured.sourceToken,
          inspection: {
            inspectionId: f.source.inspectionId,
            startHash: f.source.startHash,
            jobToken: inspected.jobToken,
          },
          fields,
          relations: plan.relations,
        }),
        startHash = editReservationStartHash(intent),
        api = createBookLoreEditReservationService({ db: f.db, now: () => 3000 }),
        control = (p, operationId) => ({
          editId,
          startHash,
          jobToken: p.jobToken,
          expectedRevision: p.revision,
          operationId,
        });
      let p = await api.startBookLoreEditReservation(f.uid, intent);
      p = (await api.initializeBookLoreEditGeneration(f.uid, control(p, 'initialize-browser')))
        .progress;
      for (const [index, item] of uploads.entries())
        p = (
          await api.reserveBookLoreEditUpload(f.uid, {
            ...control(p, 'reserve-browser-' + index),
            target: item.target,
            upload: item.ref,
          })
        ).progress;
      p = await finishCompilation({ factory: () => api, uid: f.uid, editId, startHash }, p);
      const request = control(p, 'adopt-browser'),
        result = await api.adoptBookLoreEditGeneration(f.uid, request);
      const after = await f.client.capture(f.bookId, f.loreId);
      expect(after.data).toEqual({
        ...before,
        summary: '  literal summary  ',
        relations: nextRelations,
        updatedAt: 3000,
      });
      expect(after.sourceToken).not.toBe(captured.sourceToken);
      expect(captured.data).toEqual(before);
      expect(Object.isFrozen(captured.data.relations)).toBe(true);
      if (mode !== 'inline')
        expect(f.records.get(f.source.seed.path).payloadStorage.base).toEqual(
          oldHead.payloadStorage.base,
        );
      expect((await f.client.get(f.bookId, f.loreId)).data).toEqual(after.data);
      await expect(f.client.capture(f.bookId, f.loreId, captured.sourceToken)).rejects.toThrow();
      expect(await api.adoptBookLoreEditGeneration(f.uid, request)).toEqual(result);
      // Stale readToken cannot authorize a fresh upload even if its byte proof is valid.
      const codec = await prepareBookLoreWritePayload(
          {
            uid: f.uid,
            bookId: f.bookId,
            loreId: f.loreId,
            uploadId: 'stale-browser-upload',
            target: { field: 'summary' },
            value: 'stale',
          },
          options,
        ),
        field = createBookLoreFieldUploadService({ db: f.db });
      await expect(
        field.startBookLoreFieldUpload(f.uid, {
          bookId: f.bookId,
          loreId: f.loreId,
          uploadId: 'stale-browser-upload',
          sourceToken: captured.sourceToken,
          target: codec.target,
          manifest: codec.manifest,
        }),
      ).rejects.toThrow();
    },
    30000,
  );
it('a copied client intent and valid byte proofs do not authorize a revoked source', async () => {
  const f = await fixture(),
    captured = await f.client.capture(f.bookId, f.loreId),
    plan = planBookLoreEdit(captured, [{ field: 'summary', value: 'new' }]),
    original = structuredClone(f.records.get(f.source.seed.path));
  await f.db.runTransaction(async (tx) => tx.update(f.db.doc('books/book'), { authorId: 'other' }));
  await expect(upload(f, captured.sourceToken, plan.uploads[0], 0)).rejects.toThrow();
  expect(f.records.get(f.source.seed.path)).toEqual(original);
  expect([...f.records.keys()].some((p) => p.includes('browser-roundtrip-upload'))).toBe(false);
});
