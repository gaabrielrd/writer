import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import { createBookRestoreRemapper } from '../src/bookRestoreRemap.mjs';
import {
  BOOK_RESTORE_METHODS,
  requestHash,
  mutationInput,
  preparationProgress,
} from '../src/bookRestoreUploadContracts.mjs';
import { digest } from '../src/sceneContracts.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  personasRestoreFixture,
  personasWithDraftFixture,
  readyRestorePersonas,
  finishRestorePersonas,
} from './helpers/bookRestorePersonasFixture.mjs';
import { bookLegacyFixture } from './helpers/bookLegacyFixture.mjs';
import { finishRestoreHistory } from './helpers/bookRestoreHistoryFixture.mjs';
import { finishRestoreStructure } from './helpers/bookRestoreStructureFixture.mjs';
import { finishRestoreLore } from './helpers/bookRestoreLoreFixture.mjs';
import { finishRestoreResources } from './helpers/bookRestoreResourcesFixture.mjs';
import { finishRestoreCounts } from './helpers/bookRestoreCountsFixture.mjs';
import {
  uploadLegacyRestore,
  finishLegacyRestore,
  cleanupLegacyRestore,
  legacyMutation as mutation,
} from './helpers/bookLegacyRestoreFixture.mjs';
const uid = 'author',
  id = 'personas-restore01',
  root = 'users/' + uid + '/bookRestores/' + id;
function setup() {
  const f = adventureImportDb({ nativeUpdates: true }),
    factory = () => createBookRestoreUploadService({ db: f.db, now: () => 1000 });
  return { ...f, factory, api: factory() };
}
const mapper = (p, sourceBookId = 'book') =>
  createBookRestoreRemapper({
    schemaVersion: 1,
    jobToken: p.jobToken,
    sourceBookId,
    bookId: p.bookId,
  });
test('persona definitions preserve raw archived profiles and share mapped identities across book, chapter and conversion bindings', async () => {
  const f = setup(),
    { records, shared, archived } = personasRestoreFixture(),
    initial = await readyRestorePersonas(f.factory, uid, id, records),
    m = mapper(initial),
    sharedId = m.identity('persona', shared.id),
    archivedId = m.identity('persona', archived.id);
  const library = 'users/' + uid + '/aiPersonas/';
  f.records.set(library + shared.id, { instructions: 'CURRENT LIBRARY MUST NOT COPY' });
  f.records.set(library + sharedId, { instructions: 'MAPPED CURRENT LIBRARY MUST NOT COPY' });
  const p = await finishRestorePersonas(f.factory, uid, id, initial),
    prepared = f.records.get(root + '/preparedPersonas/' + sharedId),
    old = f.records.get(root + '/preparedPersonas/' + archivedId);
  assert.equal(f.records.has('books/' + p.bookId), false);
  assert.equal(f.records.get('books/' + p.bookId + '/workProgress/current').countReady, false);
  assert.equal(p.preparation.schemaVersion, 5);
  assert.equal(f.records.get(root).cleanupVersion, 9);
  assert.equal(p.preparation.phase, 'universe');
  assert.equal(p.preparation.resourceEndIndex, initial.preparation.itemIndex);
  assert.equal(p.preparation.counts.itemIndex, initial.preparation.itemIndex);
  assert.equal(p.preparation.wordCount, initial.preparation.wordCount);
  assert.deepEqual(prepared.profile, { ...shared, id: sharedId });
  assert.equal(prepared.profileHash, digest(prepared.profile));
  assert.equal(prepared.profile.instructions, '\ufeff  Keep original\nLiteral style  ');
  assert.equal(old.profile.archived, true);
  assert.equal(old.profile.revision, 23);
  assert.deepEqual(old.profile, { ...archived, id: archivedId });
  assert.equal(p.preparation.personas.profileCount, 2);
  assert.deepEqual(p.preparation.personas.bindings, { book: 1, chapter: 2, 'scene-source': 1 });
  assert.equal(
    [...f.records.keys()].filter((k) => k.startsWith(root + '/preparedPersonas/')).length,
    2,
  );
  assert.equal(
    [...f.records.keys()].filter((k) => k.startsWith(root + '/personaBindings/')).length,
    4,
  );
  for (const [scope, ownerId] of [
    ['book', p.bookId],
    ['chapter', m.identity('chapter', 'chapter')],
    ['scene-source', m.identity('chapter', 'chapter')],
  ]) {
    const binding = f.records.get(root + '/personaBindings/' + digest([scope, ownerId]));
    assert.equal(binding.personaId, sharedId);
    assert.equal(binding.profileHash, prepared.profileHash);
    assert.equal(Object.hasOwn(binding, 'profile'), false);
  }
  assert.equal(f.records.get(library + shared.id).instructions, 'CURRENT LIBRARY MUST NOT COPY');
  assert.equal(
    f.records.get(library + sharedId).instructions,
    'MAPPED CURRENT LIBRARY MUST NOT COPY',
  );
  assert.equal(f.records.has(library + archivedId), false);
  const reader = await f.api.openVerifiedBookRestoreContent(uid, {
    restoreId: id,
    jobToken: p.jobToken,
  });
  assert.equal((await reader.readMappedItem(p.preparation.itemIndex)).record.kind, 'book-universe');
  assert.equal(BOOK_RESTORE_METHODS.includes('advanceBookRestorePersonas'), true);
  await assert.rejects(
    () => f.api.advanceBookRestorePersonas(uid, mutation(id, p, 'personas-after-complete')),
    (e) => e.details?.reason === 'personas-phase-conflict',
  );
});
test('bounded cleanup removes staged definitions and bindings, preserves library and confirms old receipts', async () => {
  const f = setup(),
    initial = await readyRestorePersonas(f.factory, uid, id),
    request = mutation(id, initial, 'personas-first-0001'),
    first = await f.api.advanceBookRestorePersonas(uid, request),
    p = await finishRestorePersonas(f.factory, uid, id, first.progress);
  assert.equal(p.preparation.artifactCount, initial.preparation.artifactCount + 6);
  f.records.set('users/' + uid + '/aiPersonas/keep', { name: 'preserve' });
  let q = (await f.api.cancelBookRestore(uid, mutation(id, p, 'personas-cancel-0001'))).progress,
    unit = 0;
  while (q.state !== 'cancelled') {
    const start = f.commits.length;
    q = (
      await f.api.advanceBookRestoreCleanup(
        uid,
        mutation(id, q, 'personas-clean-' + unit++, { limit: 2 }),
      )
    ).progress;
    const paired = f.commits
      .slice(start)
      .flat()
      .filter(
        (v) =>
          v.method === 'delete' &&
          (v.path.startsWith(root + '/preparedPersonas/') ||
            v.path.startsWith(root + '/personaBindings/')),
      );
    assert.ok(paired.length <= 2);
    assert.ok(unit < 1000);
  }
  assert.equal(q.preparation.cleanedArtifacts, p.preparation.artifactCount);
  for (const prefix of ['preparedPersonas/', 'personaBindings/', 'materializationArtifacts/'])
    assert.equal(
      [...f.records.keys()].some((k) => k.startsWith(root + '/' + prefix)),
      false,
    );
  assert.equal(f.records.get('users/' + uid + '/aiPersonas/keep').name, 'preserve');
  const replay = await f.api.advanceBookRestorePersonas(uid, request);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.equal(replay.progress.state, 'cancelled');
});
test('more than fifty distinct profiles stream through native deduplication without a client catalog', async () => {
  const f = setup(),
    initial = await readyRestorePersonas(
      f.factory,
      uid,
      id,
      personasRestoreFixture({ extraProfiles: 51 }).records,
    ),
    p = await finishRestorePersonas(f.factory, uid, id, initial);
  assert.equal(p.preparation.personas.profileCount, 53);
  assert.equal(p.preparation.personas.bindings.chapter, 53);
  assert.equal(
    [...f.records.keys()].filter((k) => k.startsWith(root + '/preparedPersonas/')).length,
    53,
  );
  await cleanupLegacyRestore(f.api, uid, id, p, { limit: 50 });
});
for (const version of [1, 2, 3, 4, 5, 6])
  test(
    'legacy v' +
      version +
      ' stages captured presets and preserves missing profiles without borrowing current ones',
    async () => {
      const f = setup(),
        legacy = bookLegacyFixture(version),
        uploaded = await uploadLegacyRestore(f.api, uid, id, legacy),
        validated = await finishLegacyRestore(f.factory, uid, id, uploaded.progress),
        structure = await finishRestoreStructure(f.factory, uid, id, validated),
        lore = await finishRestoreLore(f.factory, uid, id, structure),
        resources = await finishRestoreResources(f.factory, uid, id, lore),
        counts = await finishRestoreCounts(f.factory, uid, id, resources),
        m = mapper(counts, counts.validation.summary.sourceBookId),
        missing = m.identity('persona', 'missing-source-style');
      f.records.set('users/' + uid + '/aiPersonas/' + missing, {
        instructions: 'DO NOT BORROW CURRENT PROFILE',
      });
      const p = await finishRestorePersonas(f.factory, uid, id, counts);
      assert.equal(p.preparation.personas.profileCount, version >= 3 ? 1 : 0);
      assert.equal(p.preparation.personas.bindings.book, version >= 3 ? 1 : 0);
      assert.equal(p.preparation.personas.bindings['scene-source'], 0);
      assert.equal(f.records.has(root + '/preparedPersonas/' + missing), false);
      assert.equal(
        f.records.get('users/' + uid + '/aiPersonas/' + missing).instructions,
        'DO NOT BORROW CURRENT PROFILE',
      );
      if (version >= 3) {
        const expected = m.identity('persona', legacy.book.personaId),
          profile = f.records.get(root + '/preparedPersonas/' + expected).profile;
        assert.equal(profile.id, expected);
        assert.equal(profile.name, legacy.personas[0].name);
      }
      await cleanupLegacyRestore(f.api, uid, id, p, { limit: 7 });
    },
  );
test('historical resolver and competing operations at one checkpoint create only one definition and binding', async () => {
  const f = setup(),
    initial = await readyRestorePersonas(f.factory, uid, id),
    request = mutation(id, initial, 'personas-replay-0001'),
    first = await f.api.advanceBookRestorePersonas(uid, request);
  assert.deepEqual(await f.api.advanceBookRestorePersonas(uid, request), first);
  const raced = await Promise.allSettled([
    f.api.advanceBookRestorePersonas(uid, mutation(id, first.progress, 'personas-race-0001')),
    f.factory().advanceBookRestorePersonas(uid, mutation(id, first.progress, 'personas-race-0002')),
  ]);
  assert.equal(raced.filter((r) => r.status === 'fulfilled').length, 1);
  const resolved = await f.api.resolveBookRestoreOperation(uid, {
    restoreId: id,
    jobToken: initial.jobToken,
    operationId: request.operationId,
    requestHash: requestHash('advanceBookRestorePersonas', mutationInput(request)),
  });
  assert.deepEqual(resolved.receipt, first.receipt);
  assert.equal(resolved.progress.preparation.personas.profileCount, 1);
  assert.equal(resolved.progress.preparation.personas.bindings['scene-source'], 1);
});
test('closed v5 progress retains the resource proof while rejecting forged persona counters and boundaries', async () => {
  const f = setup(),
    initial = await readyRestorePersonas(f.factory, uid, id),
    p = (
      await f.api.advanceBookRestorePersonas(uid, mutation(id, initial, 'personas-contract-0001'))
    ).progress;
  for (const change of [
    (v) => {
      v.resourceEndIndex++;
    },
    (v) => {
      v.counts.itemIndex++;
    },
    (v) => {
      v.personas.profileCount = 99;
    },
    (v) => {
      v.personas.bindings.book = 2;
    },
    (v) => {
      v.personas.bindings.chapter = 99;
    },
    (v) => {
      v.personas.instructions = 'forbidden';
    },
    (v) => {
      v.phase = 'structure';
    },
  ]) {
    const value = structuredClone(p.preparation);
    change(value);
    assert.throws(() => preparationProgress(value));
  }
});

test('storage failure and automatic callback retry retain one definition, binding and cursor advancement', async () => {
  const f = setup(),
    initial = await readyRestorePersonas(f.factory, uid, id),
    run = f.db.runTransaction.bind(f.db),
    before = structuredClone([...f.records]),
    failure = new Error('persona storage failed');
  let inject = true,
    automatic = false;
  f.db.runTransaction = async (operation) => {
    try {
      return await run(async (tx) => {
        const create = tx.create;
        tx.create = (ref, ...args) => {
          if (inject && ref.path.startsWith(root + '/personaBindings/')) throw failure;
          return create(ref, ...args);
        };
        return operation(tx);
      });
    } catch (error) {
      if (error === failure && automatic) {
        inject = false;
        return run(operation);
      }
      throw error;
    }
  };
  const request = mutation(id, initial, 'personas-storage-0001');
  await assert.rejects(
    () => f.api.advanceBookRestorePersonas(uid, request),
    (e) => e === failure,
  );
  assert.deepEqual([...f.records], before);
  automatic = true;
  const result = await f.api.advanceBookRestorePersonas(uid, request);
  assert.equal(result.progress.preparation.personas.profileCount, 1);
  assert.equal(result.progress.preparation.personas.bindings.book, 1);
  assert.equal(result.progress.preparation.itemIndex, initial.preparation.itemIndex + 1);
  assert.equal(result.progress.preparation.artifactCount, initial.preparation.artifactCount + 2);
  assert.deepEqual(await f.api.advanceBookRestorePersonas(uid, request), result);
});
for (const part of ['definition', 'journal', 'receipt'])
  test(
    'a recreated ' + part + ' blocks deduplication without consuming the next binding',
    async () => {
      const f = setup(),
        initial = await readyRestorePersonas(f.factory, uid, id),
        p = (
          await f.api.advanceBookRestorePersonas(uid, mutation(id, initial, 'personas-birth-0001'))
        ).progress,
        journal = [...f.records].find(
          ([k, v]) =>
            k.startsWith(root + '/materializationArtifacts/') && v.kind === 'persona-definition',
        ),
        target = root + '/preparedPersonas/' + journal[1].id,
        path =
          part === 'definition'
            ? target
            : part === 'journal'
              ? journal[0]
              : 'users/' + uid + '/bookRestoreOperations/' + journal[1].lastOperationId,
        value = structuredClone(f.records.get(path));
      await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
      await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
      const before = structuredClone([...f.records]);
      await assert.rejects(() =>
        f.api.advanceBookRestorePersonas(uid, mutation(id, p, 'personas-recreated01')),
      );
      assert.deepEqual([...f.records], before);
      assert.equal(f.records.has(target), true);
    },
  );
test('the portable chapter binding cannot be staged against a different prepared complement', async () => {
  const f = setup(),
    initial = await readyRestorePersonas(f.factory, uid, id),
    m = mapper(initial);
  let p = initial;
  for (let i = 0; i < 2; i++)
    p = (await f.api.advanceBookRestorePersonas(uid, mutation(id, p, 'personas-before-owner-' + i)))
      .progress;
  const path = 'books/' + p.bookId + '/chapters/' + m.identity('chapter', 'chapter'),
    value = f.records.get(path);
  f.records.set(path, {
    ...value,
    personaComplement: { personaId: 'custom-other', overrides: [] },
  });
  const before = structuredClone([...f.records]);
  await assert.rejects(() =>
    f.api.advanceBookRestorePersonas(uid, mutation(id, p, 'personas-wrong-owner')),
  );
  assert.deepEqual([...f.records], before);
});
test('cancellation during profile pointer reading prevents every staged profile and operation receipt', async () => {
  const f = setup(),
    initial = await readyRestorePersonas(f.factory, uid, id),
    doc = f.db.doc.bind(f.db);
  let intercepted = false;
  f.db.doc = (path) => {
    const ref = doc(path);
    if (
      path ===
      root + '/validationItems/' + String(initial.preparation.itemIndex).padStart(15, '0')
    )
      return {
        ...ref,
        get: async () => {
          const snapshot = await ref.get();
          if (!intercepted) {
            intercepted = true;
            await f.api.cancelBookRestore(uid, mutation(id, initial, 'personas-reading-cancel'));
          }
          return snapshot;
        },
      };
    return ref;
  };
  const request = mutation(id, initial, 'personas-reading-append');
  await assert.rejects(() => f.api.advanceBookRestorePersonas(uid, request));
  assert.equal(intercepted, true);
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith(root + '/preparedPersonas/')),
    false,
  );
  assert.equal(
    f.records.has('users/' + uid + '/bookRestoreOperations/' + request.operationId),
    false,
  );
});
test('the identical twin committed during source reading is confirmed by its original receipt', async () => {
  const f = setup(),
    initial = await readyRestorePersonas(f.factory, uid, id),
    doc = f.db.doc.bind(f.db),
    request = mutation(id, initial, 'personas-identical01');
  let twin;
  f.db.doc = (path) => {
    const ref = doc(path);
    if (
      path ===
      root + '/validationItems/' + String(initial.preparation.itemIndex).padStart(15, '0')
    )
      return {
        ...ref,
        get: async () => {
          const snapshot = await ref.get();
          if (!twin) {
            twin = true;
            twin = await f.factory().advanceBookRestorePersonas(uid, request);
          }
          return snapshot;
        },
      };
    return ref;
  };
  assert.deepEqual(await f.api.advanceBookRestorePersonas(uid, request), twin);
});
test('private persona namespaces must be empty before migration and at final cleanup certification', async () => {
  for (const collection of ['preparedPersonas', 'personaBindings']) {
    for (const late of [false, true]) {
      const f = setup(),
        initial = await readyRestorePersonas(f.factory, uid, id);
      let p = initial;
      if (late) p = await finishRestorePersonas(f.factory, uid, id, initial);
      const path = root + '/' + collection + '/foreign';
      if (!late) {
        f.records.set(path, { own: false });
        const before = structuredClone([...f.records]);
        await assert.rejects(() =>
          f.api.advanceBookRestorePersonas(uid, mutation(id, p, 'personas-foreign01')),
        );
        assert.deepEqual([...f.records], before);
      } else {
        let q = (await f.api.cancelBookRestore(uid, mutation(id, p, 'personas-final-cancel')))
            .progress,
          unit = 0;
        while (q.integrity.cleanupPhase !== 'state') {
          q = (
            await f.api.advanceBookRestoreCleanup(
              uid,
              mutation(id, q, 'personas-final-' + unit++, { limit: 50 }),
            )
          ).progress;
          assert.ok(unit < 100);
        }
        f.records.set(path, { own: false });
        await assert.rejects(() =>
          f.api.advanceBookRestoreCleanup(
            uid,
            mutation(id, q, 'personas-final-refuse', { limit: 50 }),
          ),
        );
      }
      assert.equal(f.records.get(path).own, false);
    }
  }
});
test('the job refuses a forged completed persona summary inconsistent with the validated source', async () => {
  const f = setup(),
    initial = await readyRestorePersonas(f.factory, uid, id),
    p = (await f.api.advanceBookRestorePersonas(uid, mutation(id, initial, 'personas-summary01')))
      .progress,
    stored = structuredClone(f.records.get(root));
  stored.preparation.phase = 'universe';
  f.records.set(root, stored);
  await assert.rejects(() => f.api.getBookRestore(uid, { restoreId: id }));
  assert.equal(p.preparation.phase, 'personas');
});

test('cancelling after the first profile removes an incomplete v9 batch without requiring the persona manifest', async () => {
  const f = setup(),
    initial = await readyRestorePersonas(f.factory, uid, id),
    p = (
      await f.api.advanceBookRestorePersonas(uid, mutation(id, initial, 'personas-partial-first'))
    ).progress;
  assert.equal(p.preparation.phase, 'personas');
  assert.equal(p.preparation.personas.profileCount, 1);
  const terminal = await cleanupLegacyRestore(f.api, uid, id, p, { limit: 3 });
  assert.equal(terminal.state, 'cancelled');
  assert.equal(terminal.preparation.cleanedArtifacts, p.preparation.artifactCount);
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith(root + '/preparedPersonas/')),
    false,
  );
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith(root + '/personaBindings/')),
    false,
  );
});
test('cleanup preserves a recreated definition and its old journal instead of deleting an unproven private profile', async () => {
  const f = setup(),
    initial = await readyRestorePersonas(f.factory, uid, id),
    p = (await f.api.advanceBookRestorePersonas(uid, mutation(id, initial, 'personas-clean-birth')))
      .progress,
    journal = [...f.records].find(
      ([k, v]) =>
        k.startsWith(root + '/materializationArtifacts/') && v.kind === 'persona-definition',
    ),
    path = root + '/preparedPersonas/' + journal[1].id,
    value = structuredClone(f.records.get(path));
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
  await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
  let q = (await f.api.cancelBookRestore(uid, mutation(id, p, 'personas-clean-cancel'))).progress;
  await assert.rejects(async () => {
    for (let unit = 0; unit < 100; unit++)
      q = (
        await f.api.advanceBookRestoreCleanup(
          uid,
          mutation(id, q, 'personas-clean-reborn-' + unit, { limit: 50 }),
        )
      ).progress;
  });
  assert.equal(f.records.has(path), true);
  assert.equal(f.records.has(journal[0]), true);
});

test('a draft-only persona is reconciled exactly and survives universe/history without a borrowed definition', async () => {
  const f = setup(),
    { records, profile } = personasWithDraftFixture(),
    initial = await readyRestorePersonas(f.factory, uid, id, records),
    m = mapper(initial),
    profileId = m.identity('persona', profile.id),
    library = 'users/' + uid + '/aiPersonas/' + profileId;
  f.records.set(library, { instructions: 'CURRENT LIBRARY MUST NOT COPY' });
  const p = await finishRestorePersonas(f.factory, uid, id, initial);
  assert.equal(p.preparation.personas.profileCount, 2);
  assert.equal(p.preparation.personas.draftProfileId, profileId);
  assert.equal(f.records.get(root).validationSummary.totals.profiles, 3);
  assert.equal(f.records.has(root + '/preparedPersonas/' + profileId), false);
  assert.equal(
    [...f.records.keys()].filter((k) => k.startsWith(root + '/preparedPersonas/')).length,
    2,
  );
  const universe = (
      await f.api.advanceBookRestoreUniverse(uid, mutation(id, p, 'draft-profile-universe01'))
    ).progress,
    completed = await finishRestoreHistory(f.factory, uid, id, universe);
  assert.equal(completed.preparation.phase, 'draft');
  assert.equal(completed.preparation.personas.draftProfileId, profileId);
  assert.equal(f.records.get(library).instructions, 'CURRENT LIBRARY MUST NOT COPY');
  assert.equal(f.records.has('books/' + completed.bookId), false);
  const terminal = await cleanupLegacyRestore(f.api, uid, id, completed, { limit: 5 });
  assert.equal(terminal.state, 'cancelled');
  assert.equal(f.records.has(library), true);
});
test('a draft sharing a prepared persona adds no extra profile and preserves its exact definition', async () => {
  const f = setup(),
    { records, profile } = personasWithDraftFixture({ exclusive: false }),
    initial = await readyRestorePersonas(f.factory, uid, id, records),
    p = await finishRestorePersonas(f.factory, uid, id, initial),
    profileId = mapper(p).identity('persona', profile.id);
  assert.equal(p.preparation.personas.draftProfileId, null);
  assert.equal(p.preparation.personas.profileCount, 2);
  assert.equal(f.records.get(root).validationSummary.totals.profiles, 2);
  assert.deepEqual(f.records.get(root + '/preparedPersonas/' + profileId).profile, {
    ...profile,
    id: profileId,
  });
});
test('cancellation while the verified draft descriptor is read prevents the persona manifest receipt', async () => {
  const f = setup(),
    { records } = personasWithDraftFixture(),
    initial = await readyRestorePersonas(f.factory, uid, id, records);
  let p = initial,
    unit = 0;
  while (
    p.preparation.personas?.bindings.chapter !== 2 ||
    p.preparation.personas?.bindings['scene-source'] !== 1
  ) {
    p = (
      await f.api.advanceBookRestorePersonas(uid, mutation(id, p, 'draft-profiles-bind-' + unit++))
    ).progress;
  }
  const reader = await f.api.openVerifiedBookRestoreContent(uid, {
      restoreId: id,
      jobToken: p.jobToken,
    }),
    path = root + '/validationItems/' + String(reader.itemCount - 2).padStart(15, '0'),
    doc = f.db.doc.bind(f.db),
    request = mutation(id, p, 'draft-descriptor-read01');
  let intercepted = false;
  f.db.doc = (value) => {
    const ref = doc(value);
    if (value === path)
      return {
        ...ref,
        get: async () => {
          const snapshot = await ref.get();
          if (!intercepted) {
            intercepted = true;
            await f.api.cancelBookRestore(uid, mutation(id, p, 'draft-descriptor-cancel'));
          }
          return snapshot;
        },
      };
    return ref;
  };
  await assert.rejects(() => f.api.advanceBookRestorePersonas(uid, request));
  assert.equal(intercepted, true);
  assert.equal(
    f.records.has('users/' + uid + '/bookRestoreOperations/' + request.operationId),
    false,
  );
});
test('historic manifest receipt rejects an altered exclusive draft identity while old fields stay optional', async () => {
  const f = setup(),
    { records } = personasWithDraftFixture(),
    initial = await readyRestorePersonas(f.factory, uid, id, records),
    p = await finishRestorePersonas(f.factory, uid, id, initial),
    operation = [...f.records].find(
      ([k, v]) =>
        k.startsWith('users/' + uid + '/bookRestoreOperations/') &&
        v.receipt?.preparation?.personas?.draftProfileId,
    ),
    [path, record] = operation,
    job = structuredClone(f.records.get(root)),
    request = {
      restoreId: id,
      jobToken: p.jobToken,
      operationId: path.split('/').at(-1),
      requestHash: record.fingerprint,
    };
  assert.deepEqual((await f.api.resolveBookRestoreOperation(uid, request)).receipt, record.receipt);
  job.preparation.personas.draftProfileId = 'custom-' + 'a'.repeat(64);
  f.records.set(root, job);
  await assert.rejects(
    () => f.api.resolveBookRestoreOperation(uid, request),
    (e) => e.code === 'failed-precondition' && e.details.reason === 'identity-conflict',
  );
  assert.equal(
    f.records.get(path).receipt.preparation.personas.draftProfileId,
    p.preparation.personas.draftProfileId,
  );
});

test('completed jobs and historic receipts without draftProfileId stay readable and cancelable', async () => {
  const f = setup(),
    initial = await readyRestorePersonas(f.factory, uid, id),
    p = await finishRestorePersonas(f.factory, uid, id, initial),
    job = structuredClone(f.records.get(root));
  delete job.preparation.personas.draftProfileId;
  f.records.set(root, job);
  let manifest;
  for (const [path, value] of f.records) {
    if (
      !path.startsWith('users/' + uid + '/bookRestoreOperations/') ||
      !Object.hasOwn(value.receipt?.preparation?.personas ?? {}, 'draftProfileId')
    )
      continue;
    const legacy = structuredClone(value);
    delete legacy.receipt.preparation.personas.draftProfileId;
    f.records.set(path, legacy);
    if (legacy.receipt.action === 'advanceBookRestorePersonas') manifest = { path, value: legacy };
  }
  assert.ok(manifest);
  const request = mutation(
    id,
    { ...p, checkpoint: manifest.value.receipt.expectedCheckpoint },
    manifest.path.split('/').at(-1),
  );
  assert.deepEqual(
    (await f.api.advanceBookRestorePersonas(uid, request)).receipt,
    manifest.value.receipt,
  );
  const terminal = await cleanupLegacyRestore(f.api, uid, id, p, { limit: 5 });
  assert.equal(terminal.state, 'cancelled');
  assert.deepEqual(
    (await f.api.advanceBookRestorePersonas(uid, request)).receipt,
    manifest.value.receipt,
  );
});
