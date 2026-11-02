import test from 'node:test';
import assert from 'node:assert/strict';
import { createCampaignBackupAuditService } from '../src/campaignBackupAudit.mjs';
import { campaignBackupLoreDb } from './helpers/campaignBackupLoreDb.mjs';
import {
  backupLoreFixture,
  uid,
  entity,
  heroKey,
  patch,
  remove,
} from './helpers/campaignBackupLore.mjs';
import { imageStorageFixture } from './helpers/campaignBackupImage.mjs';
import { createCampaignNotesService } from '../src/campaignNotes.mjs';
import { createCampaignSessionsService } from '../src/campaignSessions.mjs';
import { createCampaignPreparationService } from '../src/campaignPreparation.mjs';
import { createCampaignSessionReferencesService } from '../src/campaignSessionReferences.mjs';
import { createWorkProgressService } from '../src/workProgress.mjs';
import { createStudioService } from '../src/studio.mjs';
import { baseSourceKey, digest } from '../src/campaignBaseContracts.mjs';
import { note, session, preparation, link, reference } from './helpers/campaignBackup.mjs';
const changed = (e) => e.details?.reason === 'campaign-backup-audit-changed';
const defer = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
async function fixture(rich = true) {
  const media = await imageStorageFixture(),
    f = await backupLoreFixture(undefined, campaignBackupLoreDb(), media.storage);
  Object.assign(f, media);
  f.audit = createCampaignBackupAuditService({ db: f.db, storage: f.storage });
  f.begin = (extra = {}, options = {}) =>
    f.audit.auditCampaignBackup(uid, { campaignId: f.id, ...extra }, options);
  f.basePath = 'users/' + uid + '/campaignBases/' + f.campaign.activeBaseId;
  if (rich) {
    await f.save('audit-save', 0, entity({ details: '\ufeff  🐉á'.repeat(15000) + '\n  ' }));
    const g = {
      ...f,
      scope: { campaignId: f.id, campaignToken: f.campaignToken },
      notes: createCampaignNotesService({ db: f.db }),
      sessions: createCampaignSessionsService({ db: f.db }),
      preparation: createCampaignPreparationService({ db: f.db }),
      references: createCampaignSessionReferencesService({ db: f.db }),
      progress: createWorkProgressService({ db: f.db }),
      sceneKey: baseSourceKey({
        kind: 'scene',
        adventureId: f.campaign.provenance.adventureId,
        id: f.scene.id,
      }),
    };
    g.noteId = await note(g, 'audit-note');
    g.sessionId = await session(g, 'audit-session');
    g.itemId = await preparation(g, 'audit-clue');
    await preparation(g, 'audit-quest', 'quest');
    await link(g, 'audit-link', g.sessionId, g.itemId);
    await reference(g, 'audit-reference', g.sessionId);
    await g.progress.createWorkChecklistItem(uid, {
      target: { kind: 'campaign', id: f.id },
      operationId: 'audit-checklist-operation',
      title: 'PRIVATE CHECKLIST',
    });
    f.ownFixture = g;
  }
  await f.refresh();
  f.controls.events.length = 0;
  return f;
}
async function collect(iterator, visit = () => {}) {
  const progress = [];
  for (;;) {
    const r = await iterator.next();
    if (r.done) return { proof: r.value, progress };
    progress.push(r.value);
    await visit(r.value);
  }
}
test('rich campaign jointly audits every own/base/lore/media family twice with bounded progress and no writes', async () => {
  const f = await fixture(),
    before = structuredClone([...f.records]);
  const forbidden = () => assert.fail('Audit may not write or full-read a document');
  const db = {
    ...f.db,
    runTransaction: (fn) =>
      f.db.runTransaction((tx) =>
        fn({
          ...tx,
          create: forbidden,
          set: forbidden,
          update: forbidden,
          delete: forbidden,
          get: (q) => {
            assert.ok(q.collectionPath || q.groupName);
            assert.ok(q.maximum <= 26);
            assert.ok(q.fields?.length);
            return tx.get(q);
          },
          getAll: (ref, options) => {
            assert.ok(options.fieldMask.length);
            return tx.getAll(ref, options);
          },
        }),
      ),
  };
  f.audit = createCampaignBackupAuditService({ db, storage: f.storage });
  const { proof, progress } = await collect(f.begin());
  assert.equal(proof.validation, 'campaign-native-audit');
  assert.equal(proof.availability, 'available');
  assert.ok(proof.content.units > 40);
  assert.ok(proof.content.bytes > f.bytes.length);
  assert.ok(proof.content.omitted >= 2);
  assert.match(proof.content.digest, /^[a-f0-9]{64}$/);
  assert.match(proof.nativeDigest, /^[a-f0-9]{64}$/);
  assert.deepEqual([...f.records], before);
  for (const pass of ['capture', 'recheck']) {
    const stages = progress.filter((r) => r.pass === pass).map((r) => r.stage);
    for (const stage of [
      'own:campaign',
      'own:progress',
      'own:note',
      'own:session',
      'own:checklist',
      'own:preparation-item',
      'own:preparation-body',
      'own:session-reference',
      'own:session-reference-state',
      'own:session-preparation-link',
      'own:session-preparation-state',
      'base:snapshot',
      'base:items',
      'base:bodies',
      'base:links',
      'base:loreReferences',
      'base:images',
      'lore:variants',
      'lore:stores',
      'lore:bodies',
      'lore:probe',
    ])
      assert.ok(stages.includes(stage), stage);
  }
  const out = JSON.stringify({ proof, progress });
  for (const secret of [
    'PRIVATE NOTE',
    'PRIVATE CLUE',
    'Guardião',
    'book-covers/',
    'loreVariantBodies',
    '12345678901234567890',
  ])
    assert.equal(out.includes(secret), false);
  assert.equal(f.controls.events.filter((e) => e.method === 'hash').length, 2);
  assert.ok(f.controls.streams.every((s) => s.destroyed));
  assert.ok(f.reads.every((q) => q.maximum <= 26));
});
test('unchanged campaign yields stable roots across separate complete audits', async () => {
  const f = await fixture(),
    first = (await collect(f.begin())).proof,
    second = (await collect(f.begin())).proof;
  assert.deepEqual(first, second);
});
test('S2 mutation after first inventory invalidates joint proof even when own root anchor stays unchanged', async () => {
  const f = await fixture();
  let done = false;
  await assert.rejects(
    collect(f.begin(), async (p) => {
      if (!done && p.pass === 'capture' && p.stage === 'lore:probe') {
        done = true;
        const g = f.ownFixture,
          scope = { ...g.scope, sessionId: g.sessionId, expectedSessionRevision: 1 },
          view = await g.references.listCampaignSessionReferences(uid, {
            ...scope,
            view: 'references',
          });
        await g.references.addCampaignSessionReference(uid, {
          ...scope,
          referenceId: 'audit-late-reference',
          operationId: 'audit-late-reference',
          expectedReferenceCollectionRevision: view.referenceCollectionRevision,
          sourceContext: view.sourceContext,
          target: { kind: 'lore', sourceKey: heroKey },
        });
        const token = f.anchor.sourceToken;
        await f.refresh();
        assert.equal(f.anchor.sourceToken, token);
      }
    }),
    changed,
  );
  assert.equal(done, true);
});
test('native body rewrite with identical bytes changes private audit proof', async () => {
  const f = await fixture(false);
  let done = false;
  await assert.rejects(
    collect(f.begin(), async (p) => {
      if (!done && p.pass === 'capture' && p.stage === 'lore:probe') {
        done = true;
        const [path, value] = [...f.records].find(([path]) =>
          path.startsWith(f.basePath + '/bodies/'),
        );
        await patch(f, path, { content: value.content });
      }
    }),
    changed,
  );
});
test('same-sized frozen body corruption between passes refuses', async () => {
  const f = await fixture(false);
  let done = false;
  await assert.rejects(
    collect(f.begin(), async (p) => {
      if (!done && p.pass === 'capture' && p.stage === 'base:images') {
        done = true;
        const [path, value] = [...f.records].find(
          ([path, v]) => path.startsWith(f.basePath + '/bodies/') && v.content.includes('Original'),
        );
        await patch(f, path, { content: value.content.replace('Original', 'Modified') });
      }
    }),
  );
});
test('insertion behind a completed base cursor is detected from the beginning on recheck', async () => {
  const f = await fixture(false);
  let done = false;
  await assert.rejects(
    collect(f.begin(), async (p) => {
      if (!done && p.pass === 'capture' && p.stage === 'base:images') {
        done = true;
        await f.db.runTransaction(async (tx) =>
          tx.create(f.db.doc(f.basePath + '/bodies/' + '0'.repeat(64)), {
            sourceKey: '0'.repeat(64),
            field: 'content',
            index: 0,
            content: 'orphan',
          }),
        );
      }
    }),
  );
});
test('missing declared field or variant body cannot be hidden by physical listings', async () => {
  for (const family of ['base', 'variant']) {
    const f = await fixture(),
      entry = [...f.records].find(([p]) =>
        family === 'base'
          ? p.startsWith(f.basePath + '/bodies/')
          : p.includes('/loreVariantBodies/'),
      );
    await remove(f, entry[0]);
    await assert.rejects(collect(f.begin()));
  }
});
test('revoked origin preserves own content and explicitly omits derived base/lore/media without Storage', async () => {
  const f = await fixture();
  await patch(f, 'adventures/' + f.campaign.provenance.adventureId, { deleting: true });
  const { proof, progress } = await collect(f.begin());
  assert.equal(proof.availability, 'unavailable');
  assert.ok(proof.content.unavailable >= 3);
  assert.ok(progress.some((p) => p.stage === 'own:preparation-body'));
  assert.equal(
    progress.some((p) => p.stage.startsWith('base:')),
    false,
  );
  assert.equal(f.controls.events.length, 0);
});
test('revocation of one ficha during capture cannot certify old derived output', async () => {
  const f = await fixture();
  let done = false;
  await assert.rejects(
    collect(f.begin(), async (p) => {
      if (!done && p.pass === 'capture' && p.stage === 'lore:probe') {
        done = true;
        await remove(f, 'universes/world/lore/hero');
      }
    }),
  );
});
test('historical anchors and body bindings survive adoption without recapturing current adventure lore', async () => {
  const f = await fixture();
  await f.adopt();
  const overlays = [...f.records].filter(
    ([p]) => p.includes('/loreVariants/') && p.startsWith('campaigns/' + f.id + '/'),
  );
  assert.ok(overlays.length > 0);
  const proof = (await collect(f.begin())).proof;
  assert.equal(proof.availability, 'available');
  assert.ok(proof.content.units > 40);
});
test('removed variants remain native content without silently restoring their participation', async () => {
  const f = await fixture(),
    path = f.overlayPath() + heroKey;
  await patch(f, path, { mode: 'removed', previousMode: 'override' });
  const proof = (await collect(f.begin())).proof;
  assert.equal(proof.availability, 'available');
  assert.equal(f.records.get(path).mode, 'removed');
});
test('missing historical store parent is rejected by collection group orphan probe', async () => {
  const f = await fixture();
  await f.adopt();
  const [path] = [...f.records].find(([p]) => p.includes('/loreVariantBodies/'));
  const value = f.records.get(path),
    unknown = digest('audit-missing-store');
  await f.db.runTransaction(async (tx) =>
    tx.create(
      f.db.doc(
        'campaigns/' +
          f.id +
          '/loreGenerations/' +
          unknown +
          '/loreVariantBodies/' +
          path.split('/').at(-1),
      ),
      value,
    ),
  );
  await assert.rejects(collect(f.begin()));
});
test('new latest Storage version is ignored, while removal or metadata drift of pinned version refuses', async () => {
  const f = await fixture(false),
    version = f.versions.get(f.generation),
    gen = '12345678901234567891';
  f.versions.set(gen, {
    bytes: Buffer.from('wrong'),
    metadata: { ...version.metadata, generation: gen, size: '5' },
  });
  f.controls.latest = gen;
  assert.equal((await collect(f.begin())).proof.availability, 'available');
  f.versions.delete(f.generation);
  await assert.rejects(collect(f.begin()));
});
test('pinned metadata change between complete passes invalidates proof', async () => {
  const f = await fixture(false);
  let done = false;
  await assert.rejects(
    collect(f.begin(), (p) => {
      if (!done && p.pass === 'capture' && p.stage === 'lore:probe') {
        done = true;
        f.versions.get(f.generation).metadata.metageneration = '2';
      }
    }),
    changed,
  );
});
test('closed intent is detached before first pull; no prefetch or initial I/O', async () => {
  const f = await fixture(false);
  f.metadataReads.length = 0;
  const input = { campaignId: f.id, expectedSourceToken: f.anchor.sourceToken },
    iterator = f.audit.auditCampaignBackup(uid, input);
  input.campaignId = 'wrong';
  input.expectedSourceToken = '0'.repeat(64);
  assert.equal(f.metadataReads.length, 0);
  assert.equal((await iterator.next()).done, false);
  const reads = f.metadataReads.length;
  await Promise.resolve();
  assert.equal(f.metadataReads.length, reads);
  await iterator.return();
  assert.equal((await iterator.next()).done, true);
  assert.equal(f.metadataReads.length, reads);
  assert.throws(() => f.audit.auditCampaignBackup(uid, { campaignId: f.id, path: 'arbitrary' }));
  assert.throws(() => f.audit.auditCampaignBackup('', { campaignId: f.id }));
});
for (const action of ['abort', 'return', 'throw'])
  test(
    action + ' during native image I/O drops late result and makes no subsequent call',
    async () => {
      const f = await fixture(false),
        started = defer(),
        late = defer(),
        controller = new AbortController();
      f.controls.hooks.hash = async () => {
        started.resolve();
        await late.promise;
      };
      const iterator = f.begin({}, { signal: controller.signal }),
        pending = collect(iterator);
      void pending.catch(() => {});
      await started.promise;
      const stop = new Error('stop audit');
      if (action === 'return')
        assert.deepEqual(await iterator.return(), { done: true, value: undefined });
      else if (action === 'throw') await assert.rejects(iterator.throw(stop), (e) => e === stop);
      else controller.abort();
      const calls = f.controls.events.length;
      late.resolve();
      await assert.rejects(pending, (e) =>
        action === 'throw' ? e === stop : e.name === 'AbortError',
      );
      assert.equal(f.controls.events.length, calls + 1); // Image reader performs its mandatory post-I/O metadata check.
    },
  );
test('independent empty campaign audits own defaults and empty lore stores without pretending it has a base', async () => {
  const data = campaignBackupLoreDb(),
    studio = createStudioService({ db: data.db });
  const { campaign } = await studio.createCampaign(uid, {
    operationId: 'audit-independent-campaign',
    title: 'Empty',
  });
  const id = campaign?.id ?? 'audit-independent-campaign',
    api = createCampaignBackupAuditService({ db: data.db, storage: {} }),
    proof = (await collect(api.auditCampaignBackup(uid, { campaignId: id }))).proof;
  assert.equal(proof.availability, 'none');
  assert.equal(proof.content.bytes > 0, true);
  assert.equal(proof.content.unavailable, 0);
});

test('pagination covers notes and historical stores across boundaries and visits legacy exactly once per pass', async () => {
  const f = await fixture(false),
    g = {
      ...f,
      scope: { campaignId: f.id, campaignToken: f.campaignToken },
      notes: createCampaignNotesService({ db: f.db }),
    };
  for (let i = 0; i < 30; i++) await note(g, 'audit-page-note-' + String(i).padStart(3, '0'));
  await f.db.runTransaction(async (tx) => {
    for (let i = 0; i < 28; i++) {
      const id = digest('audit-page-store-' + i);
      tx.create(f.db.doc('campaigns/' + f.id + '/loreGenerations/' + id), {
        schemaVersion: 1,
        id,
        ownerId: uid,
        campaignId: f.id,
        campaignToken: f.campaignToken,
        baseId: f.campaign.activeBaseId,
        state: 'preparing',
      });
    }
  });
  const { progress, proof } = await collect(f.begin());
  for (const pass of ['capture', 'recheck']) {
    const observed = progress.filter((p) => p.pass === pass);
    assert.equal(observed.filter((p) => p.stage === 'own:note').length, 2);
    assert.equal(observed.filter((p) => p.stage === 'lore:stores').length, 2);
    assert.equal(observed.filter((p) => p.stage === 'lore:bodies').length, 29);
  }
  assert.ok(proof.inventory.resources > 50);
  assert.ok(Object.isFrozen(proof.content));
});
test('C4, wrong account, stale anchor and root mutation at the end withhold final audit', async () => {
  const f = await fixture(false);
  await assert.rejects(collect(f.audit.auditCampaignBackup('other', { campaignId: f.id })));
  await assert.rejects(collect(f.begin({ expectedSourceToken: '0'.repeat(64) })));
  let done = false;
  await assert.rejects(
    collect(f.begin(), async (p) => {
      if (!done && p.pass === 'recheck' && p.stage === 'lore:probe') {
        done = true;
        await patch(f, 'campaigns/' + f.id, { title: 'Changed at final gate' });
      }
    }),
  );
  await patch(f, 'campaigns/' + f.id, { deleting: true });
  await assert.rejects(collect(f.begin()));
});

test('return before first pull and already-aborted intent do not perform I/O', async () => {
  const f = await fixture(false),
    controller = new AbortController();
  f.metadataReads.length = 0;
  const iterator = f.begin();
  await iterator.return();
  assert.deepEqual(await iterator.next(), { done: true, value: undefined });
  controller.abort();
  await assert.rejects(
    collect(f.begin({}, { signal: controller.signal })),
    (e) => e.name === 'AbortError',
  );
  assert.equal(f.metadataReads.length, 0);
  assert.equal(f.controls.events.length, 0);
});
