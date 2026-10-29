import test from 'node:test';
import assert from 'node:assert/strict';
import {
  restoredBackupFixture,
  recreate,
  uid,
  adventureId,
  localId,
} from './helpers/campaignRestoredBackup.mjs';
import { entity, seal } from './helpers/campaignLore.mjs';
import { heroKey } from './helpers/campaignAdoption.mjs';
import { campaignBackupTestIndexes } from './helpers/campaignBackupTestIndexes.mjs';
import { createCampaignBackupReviewService } from '../src/campaignBackupReview.mjs';
import { campaignBackupLoreContext } from '../src/campaignBackupLoreContext.mjs';
import { campaignBackupLoreBinding } from '../src/campaignBackupLoreBinding.mjs';
import { bodyRefs, variantChunkId } from '../src/campaignLoreContracts.mjs';
import { bindingPath, normalizedBodyBinding } from '../src/campaignLoreStorage.mjs';
import { splitHistoryContent } from '../src/workHistoryContracts.mjs';
import { digest } from '../src/workProgressContracts.mjs';

const codec = 'portable-relations-v1';
const unknown = digest('portable-variant-unknown');
const other = digest('portable-variant-other');
const known = (key, type = 'Conhece') => ({
  targetKey: key,
  relationType: type,
  description: 'Texto literal 🐉',
});
const unresolved = (key = unknown) => ({ targetKey: key, available: false });
const wire = (r) => ({ ...r, available: true });

async function fixture(relations) {
  const f = await restoredBackupFixture({ local: true });
  f.target = f.items().find((r) => r.origin.kind === 'adventure-lore').sourceKey;
  await f.save('portable-variant-initial', 0, entity());
  const reads = [],
    transaction = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn) =>
    transaction((tx) =>
      fn({
        ...tx,
        get: (ref) => {
          if (ref.path) reads.push({ path: ref.path });
          return tx.get(ref);
        },
        getAll: (ref, options) => {
          reads.push({ path: ref.path, fields: options.fieldMask });
          return tx.getAll(ref, options);
        },
      }),
    );
  f.reads = reads;
  f.context = () => {
    const root = f.records.get(f.path),
      generationId = root.activeLoreGenerationId ?? null;
    return {
      uid,
      campaignId: f.id,
      campaignToken: f.campaignToken,
      base: { id: root.activeBaseId },
      generationId,
      lorePath: generationId ? f.path + '/loreGenerations/' + generationId : f.path,
    };
  };
  f.overlay = () => f.records.get(f.overlayPath() + heroKey);
  f.body = () =>
    bodyRefs(f.db, f.context(), f.overlay())
      .map((r) => f.records.get(r.path).content)
      .join('');
  f.install = (raw) => {
    const record = f.overlay(),
      context = f.context(),
      binding = normalizedBodyBinding(context, record),
      parts = splitHistoryContent(raw);
    for (const ref of bodyRefs(f.db, context, record)) f.records.delete(ref.path);
    record.bodyCodec = codec;
    record.manifest = {
      bodyRevision: binding.bodyRevision,
      bytes: Buffer.byteLength(raw),
      chunkCount: parts.length,
      sha256: digest(raw),
    };
    parts.forEach((content, index) => {
      const path =
        bindingPath(context, binding) +
        '/loreVariantBodies/' +
        variantChunkId(
          { ...context, base: { id: binding.baseId } },
          heroKey,
          binding.bodyRevision,
          index,
        );
      f.records.set(path, {
        sourceKey: heroKey,
        baseId: binding.baseId,
        campaignToken: f.campaignToken,
        revision: binding.bodyRevision,
        index,
        content,
      });
    });
  };
  f.install(JSON.stringify(entity({ relations: relations ? relations(f) : [unresolved()] })));
  f.read = () => f.lore.getCampaignLore(uid, { ...f.scope(), sourceKey: heroKey });
  let sequence = 0;
  f.action = async (action) => {
    const header = {
      ...f.scope(),
      sourceKey: heroKey,
      expectedRevision: f.overlay().revision,
      operationId: 'portable-variant-action-' + ++sequence,
    };
    const methods = {
      remove: 'removeCampaignLore',
      restore: 'restoreCampaignLore',
      discard: 'discardCampaignLoreVariant',
    };
    const r = await f.lore[methods[action]](uid, header);
    await f.recovery.resolveCampaignLoreOperation(uid, { ...header, action, intent: 'confirm' });
    return r;
  };
  f.prepare = async (name, value, keys) => {
    const header = {
      ...f.scope(),
      sourceKey: heroKey,
      expectedRevision: f.overlay().revision,
      operationId: name,
      relatedSourceKeys: keys ?? [...new Set(value.relations.map((r) => r.targetKey))].sort(),
    };
    const prepared = await f.recovery.prepareCampaignLoreVariant(uid, header);
    return { ...header, sealed: seal(prepared, value) };
  };
  f.review = async () => {
    const { bytes } = await f.write(),
      opened = [];
    const result = await createCampaignBackupReviewService({
      db: f.db,
      keys: f.keys,
      now: () => 6000,
      createIndex: campaignBackupTestIndexes(opened),
    }).reviewCampaignBackup(uid, {
      size: bytes.length,
      read: async (o, n) => bytes.subarray(o, o + n),
    });
    assert.ok(opened.every((i) => i.disposed === 1));
    assert.doesNotMatch(bytes.toString(), /bodyCodec|portable-relations-v1/);
    return result;
  };
  f.bodyReads = () =>
    reads.filter(
      (r) => r.path.includes('/loreVariantBodies/') && (!r.fields || r.fields.includes('content')),
    );
  await f.refresh();
  return f;
}

test('opaque relation to an available captured target stays hidden without target lookup and reexports signed v3 unresolved', async () => {
  const f = await fixture((x) => [unresolved(x.target)]);
  f.reads.length = 0;
  assert.deepEqual((await f.read()).item.entity.relations, []);
  assert.ok(!f.reads.some((r) => r.path.endsWith('/' + f.target)));
  const original = f.body(),
    review = await f.review();
  assert.equal(review.manifest.contentVersion, 3);
  assert.equal(review.derived.unresolvedRelations, 1);
  assert.equal(f.body(), original);
});

test('text edit and exact retry preserve opaque keys, interleaving, known descriptors and literal text', async () => {
  const f = await fixture((x) => [
    wire(known(x.target)),
    unresolved(),
    wire(known(x.target, 'Rival')),
    unresolved(other),
  ]);
  const before = JSON.parse(f.body()).relations,
    value = entity({
      details: '  Edição própria\n🐉  ',
      relations: [known(f.target), known(f.target, 'Rival')],
    });
  const saved = await f.save('portable-variant-text', 1, value);
  assert.equal(saved.result.item.entity.details, value.details);
  assert.deepEqual(JSON.parse(f.body()).relations, before);
  assert.equal(f.overlay().bodyCodec, codec);
  assert.ok(saved.result.item.entity.relations.every((r) => !Object.hasOwn(r, 'available')));
  assert.deepEqual(await f.lore.saveCampaignLoreVariant(uid, saved.input), saved.result);
  await f.refresh();
  assert.equal((await f.review()).derived.unresolvedRelations, 2);
});

test('only a new authorized descriptor resolves an opaque target and returns the body to native JSON when none remain', async () => {
  const f = await fixture((x) => [unresolved(x.target)]);
  await f.save('portable-variant-unresolved-edit', 1, entity({ details: 'Sem escolha de alvo' }));
  assert.deepEqual(JSON.parse(f.body()).relations, [unresolved(f.target)]);
  const saved = await f.save(
    'portable-variant-explicit-target',
    2,
    entity({ relations: [known(f.target)] }),
  );
  assert.deepEqual(JSON.parse(f.body()).relations, [known(f.target)]);
  assert.ok(!Object.hasOwn(f.overlay(), 'bodyCodec'));
  assert.equal(saved.result.item.entity.relations[0].targetKey, f.target);
  await f.refresh();
  assert.equal((await f.review()).derived.unresolvedRelations, 0);
});

test('an unchanged known descriptor for the same opaque key is not inferred as a new resolution', async () => {
  const f = await fixture((x) => [wire(known(x.target)), unresolved(x.target)]);
  await f.save(
    'portable-variant-mixed-text',
    1,
    entity({ details: 'Só texto', relations: [known(f.target)] }),
  );
  assert.deepEqual(JSON.parse(f.body()).relations, [wire(known(f.target)), unresolved(f.target)]);
  await f.save(
    'portable-variant-mixed-selection',
    2,
    entity({ relations: [known(f.target), known(f.target, 'Aliado')] }),
  );
  assert.ok(!Object.hasOwn(f.overlay(), 'bodyCodec'));
  assert.deepEqual(JSON.parse(f.body()).relations, [known(f.target), known(f.target, 'Aliado')]);
});

test('known removals and reordering keep incoming order and retain all opaque declarations in relative order', async () => {
  const f = await fixture((x) => [
    wire(known(x.target, 'A')),
    unresolved(),
    wire(known(x.target, 'B')),
    unresolved(other),
  ]);
  await f.save(
    'portable-variant-reorder',
    1,
    entity({ relations: [known(f.target, 'B'), known(f.target, 'A')] }),
  );
  assert.deepEqual(JSON.parse(f.body()).relations, [
    wire(known(f.target, 'B')),
    wire(known(f.target, 'A')),
    unresolved(),
    unresolved(other),
  ]);
  await f.save('portable-variant-remove-known', 2, entity());
  assert.deepEqual(JSON.parse(f.body()).relations, [unresolved(), unresolved(other)]);
});

test('remove and restore preserve codec, immutable body and binding; discard explicitly clears the override', async () => {
  const f = await fixture((x) => [unresolved(x.target)]),
    originalBase = structuredClone(f.records.get(f.basePath + '/items/' + heroKey)),
    raw = f.body(),
    binding = structuredClone(f.overlay().bodyBinding);
  const removed = await f.action('remove');
  assert.equal(removed.item.entity, null);
  assert.equal(f.overlay().bodyCodec, codec);
  assert.equal(f.overlay().previousMode, 'override');
  assert.equal(f.body(), raw);
  assert.deepEqual(f.overlay().bodyBinding, binding);
  await f.refresh();
  assert.equal((await f.review()).derived.unresolvedRelations, 1);
  await f.action('restore');
  assert.equal((await f.read()).item.mode, 'override');
  assert.equal(f.body(), raw);
  const refs = bodyRefs(f.db, f.context(), f.overlay());
  await f.action('discard');
  assert.equal((await f.read()).item.mode, 'base');
  assert.ok(!Object.hasOwn(f.overlay(), 'bodyCodec'));
  assert.equal(f.overlay().manifest, null);
  assert.ok(refs.every((r) => !f.records.has(r.path)));
  assert.deepEqual(f.records.get(f.basePath + '/items/' + heroKey), originalBase);
});

for (const removed of [false, true])
  test(
    'C3 keep-local preserves ' +
      (removed ? 'removed' : 'active') +
      ' portable body across native adoption and new-generation save',
    async () => {
      const f = await fixture((x) => [unresolved(x.target)]);
      if (removed) await f.action('remove');
      const before = f.body(),
        binding = structuredClone(f.overlay().bodyBinding),
        oldRefs = bodyRefs(f.db, f.context(), f.overlay());
      await f.adopt();
      assert.equal(f.overlay().bodyCodec, codec);
      assert.deepEqual(f.overlay().bodyBinding, binding);
      assert.equal(f.body(), before);
      assert.ok(
        !Object.hasOwn(
          f.records.get('users/' + uid + '/campaignBases/' + f.campaign.activeBaseId),
          'sourceMode',
        ),
      );
      if (removed) await f.action('restore');
      const result = await f.read();
      assert.deepEqual(result.item.entity.relations, []);
      const r = await f.save(
        'portable-variant-after-adopt-' + removed,
        result.item.revision,
        entity({ details: 'Nova geração 🐉' }),
      );
      assert.equal(f.overlay().bodyCodec, codec);
      assert.equal(f.overlay().bodyBinding.layout, 'generation');
      assert.equal(f.overlay().bodyBinding.baseId, f.campaign.activeBaseId);
      assert.ok(oldRefs.every((ref) => !f.records.has(ref.path)));
      assert.deepEqual(JSON.parse(f.body()).relations, [unresolved(f.target)]);
      assert.equal(r.result.item.entity.details, 'Nova geração 🐉');
      await f.refresh();
      assert.equal((await f.review()).derived.unresolvedRelations, 1);
    },
  );

test('C3 use-candidate clears the private codec and exposes only the candidate base', async () => {
  const f = await fixture();
  await f.adopt('use-candidate');
  assert.equal(f.overlay().mode, 'base');
  assert.ok(!Object.hasOwn(f.overlay(), 'bodyCodec'));
  assert.ok(!Object.hasOwn(f.overlay(), 'bodyBinding'));
  assert.equal(f.overlay().manifest, null);
  assert.equal((await f.read()).item.mode, 'base');
  assert.equal((await f.review()).derived.unresolvedRelations, 0);
});

test('authorized legacy owner retains opaque keys through adoption and a complete signed review', async () => {
  const f = await fixture();
  await f.removeReferences();
  await f.adopt();
  assert.equal((await f.read()).item.legacy, true);
  assert.equal(f.overlay().bodyCodec, codec);
  assert.equal((await f.review()).derived.unresolvedRelations, 1);
});

for (const mode of ['relations', 'bytes'])
  test(
    'merged ' +
      mode +
      ' overflow fails before writes and preserves the original body and prepared request',
    async () => {
      const f = await fixture();
      let value = entity({
        relations: Array.from({ length: 50 }, (_, i) => known(f.target, 'Tipo ' + i)),
      });
      if (mode === 'bytes') {
        value = entity({
          details: 'a'.repeat(150000),
          structuredDetails: {
            appearance: 'á'.repeat(150000),
            personality: 'á'.repeat(150000),
            history: 'a'.repeat(149000),
            notes: '',
          },
        });
        value.structuredDetails.notes = 'x'.repeat(
          899990 - Buffer.byteLength(JSON.stringify(value)),
        );
        assert.equal(Buffer.byteLength(JSON.stringify(value)), 899990);
      }
      const input = await f.prepare('portable-variant-overflow-' + mode, value),
        before = structuredClone([...f.records]),
        body = f.body();
      await assert.rejects(
        f.lore.saveCampaignLoreVariant(uid, input),
        /Nenhum conteúdo foi truncado/,
      );
      assert.deepEqual([...f.records], before);
      assert.equal(f.body(), body);
    },
  );

for (const [name, mutate] of [
  [
    'null',
    (r) => {
      r.bodyCodec = null;
    },
  ],
  [
    'unknown',
    (r) => {
      r.bodyCodec = 'future-codec';
    },
  ],
  [
    'base mode',
    (r) => {
      r.mode = 'base';
      r.manifest = null;
      delete r.bodyBinding;
    },
  ],
  [
    'removed base mode',
    (r) => {
      r.mode = 'removed';
      r.previousMode = 'base';
      r.manifest = null;
      delete r.bodyBinding;
    },
  ],
])
  test(
    'invalid private codec ' + name + ' fails in normal and backup metadata before body reads',
    async () => {
      const f = await fixture();
      mutate(f.overlay());
      f.reads.length = 0;
      await assert.rejects(f.read(), { code: 'failed-precondition' });
      assert.equal(f.bodyReads().length, 0);
      f.reads.length = 0;
      await assert.rejects(f.list(), { code: 'failed-precondition' });
      assert.equal(f.bodyReads().length, 0);
    },
  );

for (const [name, change] of [
  [
    'opaque labels',
    (v) => {
      v.relations[0].description = 'DO NOT EXPOSE';
    },
  ],
  [
    'opaque self',
    (v) => {
      v.relations[0].targetKey = heroKey;
    },
  ],
  [
    'opaque bad key',
    (v) => {
      v.relations[0].targetKey = 'invalid';
    },
  ],
  [
    'opaque unknown field',
    (v) => {
      v.relations[0].extra = true;
    },
  ],
  [
    'null availability',
    (v) => {
      v.relations[0].available = null;
    },
  ],
  [
    'unknown top field',
    (v) => {
      v.extra = true;
    },
  ],
  [
    'untrimmed name',
    (v) => {
      v.name = ' ' + v.name;
    },
  ],
  [
    'invalid UTF8 value',
    (v) => {
      v.details = '\ud800';
    },
  ],
  [
    'native relation inside portable codec',
    (v, x) => {
      v.relations = [known(x.target)];
    },
  ],
  [
    'known extra field',
    (v, x) => {
      v.relations = [{ ...wire(known(x.target)), extra: true }];
    },
  ],
])
  test(
    'canonical private parser rejects ' + name + ' even with a matching body manifest and hash',
    async () => {
      const f = await fixture(),
        v = JSON.parse(f.body());
      change(v, f);
      f.install(JSON.stringify(v));
      await assert.rejects(f.read());
      await assert.rejects(f.write());
    },
  );

test('missing codec is not guessed from a portable body, and noncanonical JSON is rejected', async () => {
  const f = await fixture(),
    raw = f.body();
  delete f.overlay().bodyCodec;
  await assert.rejects(f.read());
  await assert.rejects(f.write());
  f.install(' ' + raw);
  await assert.rejects(f.read(), { code: 'failed-precondition' });
  await assert.rejects(f.write());
});

for (const contraband of ['available', 'bodyCodec'])
  test(
    'sealed native save does not accept client ' +
      contraband +
      ' and leaves the private body untouched',
    async () => {
      const f = await fixture(),
        value = entity({ relations: [known(f.target)] });
      if (contraband === 'available') value.relations[0].available = false;
      else value.bodyCodec = codec;
      const input = await f.prepare('portable-variant-native-' + contraband, value),
        before = structuredClone([...f.records]);
      await assert.rejects(f.lore.saveCampaignLoreVariant(uid, input), {
        code: 'invalid-argument',
      });
      assert.deepEqual([...f.records], before);
    },
  );

test('revoked source stays unavailable despite the private codec and does not read its variant body', async () => {
  const f = await fixture();
  recreate(f, 'universes/world/lore/hero');
  f.reads.length = 0;
  assert.equal((await f.read()).item, null);
  assert.equal(f.bodyReads().length, 0);
  await f.refresh();
  assert.equal((await f.review()).derived.unresolvedRelations, 0);
});

for (const removed of [false, true])
  test(
    'C3 does not reject an ' +
      (removed ? 'removed' : 'active') +
      ' opaque relation when its authorized old target is absent from the candidate',
    async () => {
      const f = await fixture((x) => [unresolved(x.target)]),
        target = { kind: 'adventure', id: adventureId };
      if (removed) await f.action('remove');
      const scene = await f.scenes.getScene(uid, { target, sceneId: f.scene.id });
      await f.scenes.setSceneReference(uid, {
        target,
        sceneId: scene.id,
        operationId: 'portable-variant-drop-target-reference-' + removed,
        expectedRevision: scene.revision,
        remove: true,
        reference: { kind: 'adventure', scopeId: adventureId, entityId: localId },
      });
      assert.ok(f.records.has(f.basePath + '/items/' + f.target));
      await f.adopt();
      assert.ok(
        !f.records.has(
          'users/' + uid + '/campaignBases/' + f.campaign.activeBaseId + '/items/' + f.target,
        ),
      );
      assert.deepEqual(JSON.parse(f.body()).relations, [unresolved(f.target)]);
      if (removed) await f.action('restore');
      assert.deepEqual((await f.read()).item.entity.relations, []);
      assert.equal((await f.review()).derived.unresolvedRelations, 1);
    },
  );

test('C3 discard-local removes the codec of a legacy body instead of retaining hidden declarations', async () => {
  const f = await fixture();
  await f.removeReferences();
  await f.adopt('discard-local');
  assert.ok(!Object.hasOwn(f.overlay(), 'bodyCodec'));
  assert.ok(!Object.hasOwn(f.overlay(), 'bodyBinding'));
  assert.equal(f.overlay().manifest, null);
  assert.equal((await f.read()).item, null);
  assert.equal((await f.review()).derived.unresolvedRelations, 0);
});

test('50 combined relations remain accepted without truncation', async () => {
  const f = await fixture();
  await f.save(
    'portable-variant-fifty',
    1,
    entity({
      relations: Array.from({ length: 49 }, (_, i) => known(f.target, 'Tipo ' + i)),
    }),
  );
  assert.equal(JSON.parse(f.body()).relations.length, 50);
  assert.equal((await f.read()).item.entity.relations.length, 49);
  assert.deepEqual(JSON.parse(f.body()).relations[0], unresolved());
});

test('exactly 900000 canonical portable bytes remain accepted with complete native UTF8 chunks', async () => {
  const f = await fixture(),
    value = entity({
      details: 'a'.repeat(150000),
      structuredDetails: {
        appearance: 'á'.repeat(150000),
        personality: 'á'.repeat(150000),
        history: 'a'.repeat(149000),
        notes: '',
      },
      relations: [unresolved()],
    });
  value.structuredDetails.notes = 'x'.repeat(900000 - Buffer.byteLength(JSON.stringify(value)));
  f.install(JSON.stringify(value));
  const visible = (await f.read()).item.entity;
  assert.equal(Buffer.byteLength(f.body()), 900000);
  await f.save(
    'portable-variant-byte-boundary',
    1,
    entity({
      details: visible.details,
      structuredDetails: visible.structuredDetails,
    }),
  );
  assert.equal(f.overlay().manifest.bytes, 900000);
  assert.equal(JSON.parse(f.body()).structuredDetails.notes, value.structuredDetails.notes);
});

for (const phase of ['content', 'binding'])
  for (const change of ['drop', 'change', 'add'])
    test(
      'backup ' +
        phase +
        ' rejects codec ' +
        change +
        ' between metadata masks before variant prose',
      async () => {
        const f = await fixture();
        if (change === 'add') {
          f.install(JSON.stringify(entity()));
          delete f.overlay().bodyCodec;
          assert.equal((await f.read()).item.mode, 'override');
        }
        await f.refresh();
        const row = (await f.list()).items.find((r) => r.id === heroKey),
          transaction = f.db.runTransaction.bind(f.db);
        let tampered = 0;
        f.db.runTransaction = (fn) =>
          transaction((tx) =>
            fn({
              ...tx,
              getAll: async (ref, options) => {
                const result = await tx.getAll(ref, options);
                if (
                  ref.path.endsWith('/loreVariants/' + heroKey) &&
                  options.fieldMask.includes('manifest') &&
                  options.fieldMask.includes('name') === (phase === 'content')
                ) {
                  tampered++;
                  const s = result[0],
                    v = structuredClone(s.data());
                  if (change === 'drop') delete v.bodyCodec;
                  else v.bodyCodec = change === 'change' ? 'future-codec' : codec;
                  return [Object.create(s, { data: { value: () => v } })];
                }
                return result;
              },
            }),
          );
        f.reads.length = 0;
        await assert.rejects(
          phase === 'content'
            ? f.backup.readCampaignBackupLoreVariant(uid, {
                ...f.anchor,
                id: heroKey,
                variantToken: row.variantToken,
              })
            : f.db.runTransaction(async (tx) => {
                const c = await campaignBackupLoreContext(tx, {
                  db: f.db,
                  uid,
                  path: f.path,
                  campaignId: f.id,
                  expected: f.anchor.sourceToken,
                  derivedExpected: f.anchor.derivedToken,
                });
                return campaignBackupLoreBinding(c, await c.inspect(heroKey));
              }),
          (e) => e.details?.reason === 'campaign-backup-lore-variant-changed',
        );
        assert.ok(tampered > 0);
        assert.equal(f.bodyReads().length, 0);
      },
    );
