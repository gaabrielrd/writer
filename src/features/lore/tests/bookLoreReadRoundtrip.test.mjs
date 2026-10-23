// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { webcrypto, createHash } from 'node:crypto';
import { createBookLoreReadClient } from '../services/bookLoreReadClient.ts';
import { createBookLoreReadService } from '../../../../functions/src/bookLoreRead.mjs';
import { createBookRestoreUploadService } from '../../../../functions/src/bookRestoreUpload.mjs';
import { createBookRestoreRemapper } from '../../../../functions/src/bookRestoreRemap.mjs';
import { adventureImportDb } from '../../../../functions/test/helpers/adventureImportDb.mjs';
import {
  readyLargeLore,
  finishLargeLore,
  largeLoreData,
} from '../../../../functions/test/helpers/bookRestoreLorePayloadFixture.mjs';
import { seedBookLoreRead } from '../../../../functions/test/helpers/bookLoreReadFixture.mjs';
afterEach(() => vi.unstubAllGlobals());
function serverRealm() {
  vi.stubGlobal('crypto', webcrypto);
}
const sha = (value) => createHash('sha256').update(value).digest('hex');

it('reads actual privately prepared and remapped lore through the real server protocol and TS client without activating the restore', async () => {
  serverRealm();
  const uid = 'author',
    jobId = 'client-lore-roundtrip001',
    f = adventureImportDb({ nativeUpdates: true }),
    factory = () => createBookRestoreUploadService({ db: f.db, now: () => 1000 }),
    data = largeLoreData(),
    initial = await readyLargeLore(factory, uid, jobId, data),
    p = await finishLargeLore(factory, uid, jobId, initial),
    remapper = createBookRestoreRemapper({
      schemaVersion: 1,
      jobToken: p.jobToken,
      sourceBookId: 'book',
      bookId: p.bookId,
    }),
    id = remapper.identity('lore', 'entity'),
    server = createBookLoreReadService({ db: f.db }),
    client = createBookLoreReadClient(
      (name, input) => server[name](uid, input),
      () => {},
    );
  expect(f.records.has('books/' + p.bookId)).toBe(false);
  await expect(client.get(p.bookId, id)).rejects.toThrow('indisponível');
  // Explicit read harness only: no certification or activation is invoked.
  await f.db.runTransaction(async (tx) => {
    tx.create(f.db.doc('books/' + p.bookId), {
      authorId: uid,
      localLoreVersion: 0,
      deleting: false,
    });
  });
  const value = await client.get(p.bookId, id);
  expect(sha(value.data.details)).toBe(sha(data.details));
  expect({ ...value.data, details: 'checked by SHA' }).toEqual({
    ...data,
    details: 'checked by SHA',
    createdAt: p.preparation.timestamp,
    updatedAt: p.preparation.timestamp,
    relations: data.relations.map((relation) => ({
      ...relation,
      targetEntityId: relation.targetEntityId === 'entity' ? id : relation.targetEntityId,
    })),
  });
  const listed = await client.list(p.bookId);
  expect(listed).toHaveLength(3);
  expect(sha(JSON.stringify(listed.find((item) => item.id === id)))).toBe(
    sha(JSON.stringify(value)),
  );
  expect(f.records.get('users/' + uid + '/bookRestores/' + jobId).state).not.toBe('activated');
  expect(p.preparation.phase).toBe('scenes');
}, 20000);

it('rejects an actual backend revocation during the client assembly without producing a partial fiche', async () => {
  serverRealm();
  const f = adventureImportDb({ nativeUpdates: true }),
    seed = await seedBookLoreRead(f.db),
    server = createBookLoreReadService({ db: f.db });
  let parts = 0;
  const client = createBookLoreReadClient(
    async (name, input) => {
      const result = await server[name](seed.uid, input);
      if (name === 'readBookLorePart' && ++parts === 1)
        await f.db.runTransaction(async (tx) => {
          tx.update(f.db.doc(seed.bookPath), { deleting: true });
        });
      return result;
    },
    () => {},
  );
  await expect(client.get(seed.bookId, seed.id)).rejects.toThrow('indisponível');
  expect(parts).toBe(1);
});
