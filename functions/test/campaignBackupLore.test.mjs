import test from 'node:test';
import assert from 'node:assert/strict';
import {
  backupLoreFixture,
  savedLoreFixture,
  uid,
  heroKey,
  entity,
  op,
  patch,
  remove,
} from './helpers/campaignBackupLore.mjs';
import { baseSourceKey, digest } from '../src/campaignBaseContracts.mjs';
import { createCampaignBackupLoreService } from '../src/campaignBackupLore.mjs';
import { loreGuardPath } from '../src/campaignLoreStorage.mjs';
const bad = (e) => e.code === 'failed-precondition';
const changed = (e) => e.details?.reason === 'campaign-backup-lore-variant-changed';
const first = async (f) => (await f.list()).items.find((v) => v.id === heroKey);
const bodies = (f) => [...f.records].filter(([p]) => p.includes('/loreVariantBodies/'));
test('empty legacy layout is read-only and never creates controls or grants', async () => {
  const f = await backupLoreFixture(),
    before = structuredClone([...f.records]);
  assert.deepEqual((await f.list()).items, []);
  assert.deepEqual([...f.records], before);
});
test('native legacy variant preserves exact canonical text and exports no physical control or binding', async () => {
  const input = entity({ details: '\ufeff  🐉\n  ' }),
    f = await savedLoreFixture(input),
    before = structuredClone([...f.records]),
    ref = await first(f),
    r = await f.read(ref);
  assert.equal(r.outcome, 'available');
  assert.equal(r.content.entity.details, input.details);
  assert.equal(r.content.mode, 'override');
  assert.deepEqual(Object.keys(ref).sort(), ['availability', 'id', 'variantToken']);
  assert.deepEqual(Object.keys(r.content).sort(), [
    'anchorKey',
    'category',
    'entity',
    'mode',
    'name',
    'sourceKey',
  ]);
  for (const word of [
    'bodyBinding',
    'bodyRevision',
    'campaignToken',
    'loreVariantBodies',
    'keyBase64',
  ])
    assert.ok(!JSON.stringify(r.content).includes(word));
  assert.equal(r.byteLength, Buffer.byteLength(JSON.stringify(r.content)));
  assert.equal(r.contentHash, digest(JSON.stringify(r.content)));
  assert.match(r.contentToken, /^[a-f0-9]{64}$/);
  assert.deepEqual([...f.records], before);
});
test('inventory never reads names, textual hashes, manifests or body content', async () => {
  const f = await savedLoreFixture();
  f.metadataReads.length = 0;
  f.reads.length = 0;
  await f.list();
  assert.ok(
    f.metadataReads.every((r) =>
      r.fields.every(
        (k) => !['title', 'name', 'category', 'manifest', 'content', 'fields'].includes(k),
      ),
    ),
  );
  assert.ok(
    f.reads.every((r) => r.fields?.every((k) => !['name', 'manifest', 'content'].includes(k))),
  );
});
test('removed override retains its text and previousMode without restoring it', async () => {
  const f = await savedLoreFixture();
  await f.lore.removeCampaignLore(uid, {
    ...f.scope(),
    sourceKey: heroKey,
    expectedRevision: 1,
    operationId: op('remove-backup'),
  });
  await f.refresh();
  const r = await f.read(await first(f));
  assert.equal(r.content.mode, 'removed');
  assert.equal(r.content.previousMode, 'override');
  assert.equal(r.content.entity.details, entity().details);
});
test('discard to base and removed base preserve absence of override body', async () => {
  const f = await savedLoreFixture();
  await f.lore.discardCampaignLoreVariant(uid, {
    ...f.scope(),
    sourceKey: heroKey,
    expectedRevision: 1,
    operationId: op('discard-backup'),
  });
  await f.refresh();
  let r = await f.read(await first(f));
  assert.equal(r.content.mode, 'base');
  assert.ok(!('entity' in r.content));
  await f.lore.removeCampaignLore(uid, {
    ...f.scope(),
    sourceKey: heroKey,
    expectedRevision: 2,
    operationId: op('remove-base-backup'),
  });
  await f.refresh();
  r = await f.read(await first(f));
  assert.equal(r.content.mode, 'removed');
  assert.equal(r.content.previousMode, 'base');
  assert.ok(!('entity' in r.content));
});
test('adopted generation follows a legacy binding, not its empty new body directory', async () => {
  const f = await savedLoreFixture(),
    before = bodies(f).map(([p]) => p);
  await f.adopt();
  const ref = await first(f),
    r = await f.read(ref);
  assert.equal(r.content.participation, 'candidate');
  assert.equal(r.content.entity.details, entity().details);
  assert.ok(bodies(f).every(([p]) => before.includes(p)));
  assert.equal(f.records.get(f.overlayPath() + heroKey).bodyBinding.layout, 'legacy');
});
test('second generation follows immutable bodies in a previous ready generation', async () => {
  const f = await savedLoreFixture();
  await f.adopt();
  await f.save('write-in-generation', 2, entity({ details: 'Corpo da geração anterior 🐉' }));
  const oldRoot = structuredClone(f.records.get(f.path));
  await f.adopt();
  const header = f.records.get(f.overlayPath() + heroKey);
  assert.equal(header.bodyBinding.generationId, oldRoot.activeLoreGenerationId);
  assert.notEqual(header.bodyBinding.generationId, f.records.get(f.path).activeLoreGenerationId);
  assert.equal(
    (await f.read(await first(f))).content.entity.details,
    'Corpo da geração anterior 🐉',
  );
});
test('explicit retained legacy keeps its old anchor and exact frozen text after candidate omits the ficha', async () => {
  const f = await savedLoreFixture(),
    oldBase = f.campaign.activeBaseId;
  await f.removeReferences();
  await f.adopt();
  const ref = await first(f),
    r = await f.read(ref),
    anchor = await f.readAnchor(ref);
  assert.equal(r.content.participation, 'legacy');
  assert.notEqual(f.campaign.activeBaseId, oldBase);
  assert.equal(anchor.content.anchorKey, r.content.anchorKey);
  assert.equal(anchor.content.item.title, 'Heroína');
  assert.equal(
    Buffer.from((await f.text(ref, 'details')).chunkBase64, 'base64').toString(),
    'Ficha 🐉',
  );
  assert.ok(anchor.fields.every((v) => /^[a-f0-9]{64}$/.test(v.bodyProof)));
});
test('a later edit of retained legacy may bind a base without the ficha while keeping the authorized old anchor', async () => {
  const f = await savedLoreFixture();
  await f.removeReferences();
  await f.adopt();
  await f.save('edited-legacy', 2, entity({ details: 'Legada editada' }));
  await f.refresh();
  const header = f.records.get(f.overlayPath() + heroKey);
  assert.equal(header.bodyBinding.baseId, f.campaign.activeBaseId);
  assert.notEqual(header.anchor.capturedBaseId, header.bodyBinding.baseId);
  assert.equal((await f.read(await first(f))).content.entity.details, 'Legada editada');
});
test('inactive tombstone remains inactive and does not copy discarded old physical bodies', async () => {
  const f = await savedLoreFixture();
  await f.removeReferences();
  await f.adopt('discard-local');
  const r = await f.read(await first(f));
  assert.equal(r.content.participation, 'inactive');
  assert.equal(r.content.mode, 'base');
  assert.ok(!('entity' in r.content));
  assert.ok(bodies(f).length > 0);
});
test('revoked origin keeps explicit entry but no name, manifest, body or textual hash', async () => {
  const f = await savedLoreFixture(),
    old = await first(f);
  await f.universe.deleteUniverseLore(uid, { universeId: 'world', id: 'hero' });
  await f.refresh();
  f.metadataReads.length = 0;
  const ref = await first(f),
    r = await f.read(ref);
  assert.equal(ref.availability, 'unavailable');
  assert.equal(r.outcome, 'unavailable');
  assert.deepEqual(Object.keys(r).sort(), [
    'baseId',
    'campaignId',
    'derivedToken',
    'id',
    'outcome',
    'schemaVersion',
    'sourceToken',
    'variantToken',
  ]);
  assert.equal((await f.readAnchor(ref)).outcome, 'unavailable');
  assert.equal((await f.text(ref, 'details')).outcome, 'unavailable');
  assert.ok(
    f.metadataReads.every((r) =>
      r.fields.every((k) => !['name', 'manifest', 'content', 'title', 'fields'].includes(k)),
    ),
  );
  await assert.rejects(f.read(old), changed);
});
test('recreated global ficha does not reauthorize an old variant or anchor', async () => {
  const f = await savedLoreFixture();
  const record = f.records.get('universes/world/lore/hero');
  await remove(f, 'universes/world/lore/hero');
  await f.db.runTransaction(async (tx) => tx.create(f.db.doc('universes/world/lore/hero'), record));
  const ref = await first(f);
  assert.equal(ref.availability, 'unavailable');
  assert.equal((await f.read(ref)).outcome, 'unavailable');
});
test('advancing to a newer anchor cannot reauthorize a body bound before the origin incarnation', async () => {
  const f = await savedLoreFixture(),
    record = f.records.get('universes/world/lore/hero');
  await remove(f, 'universes/world/lore/hero');
  await f.db.runTransaction(async (tx) => tx.create(f.db.doc('universes/world/lore/hero'), record));
  await f.adopt();
  const stored = f.records.get(f.overlayPath() + heroKey);
  assert.equal(stored.anchor.capturedBaseId, f.campaign.activeBaseId);
  assert.notEqual(stored.bodyBinding.baseId, stored.anchor.capturedBaseId);
  f.metadataReads.length = 0;
  const ref = await first(f);
  assert.equal(ref.availability, 'unavailable');
  assert.equal((await f.read(ref)).outcome, 'unavailable');
  assert.ok(
    f.metadataReads.every((r) => !r.fields.includes('name') && !r.fields.includes('content')),
  );
});
test('missing adventure still permits metadata inventory with unavailable variants', async () => {
  const f = await savedLoreFixture();
  await remove(f, 'adventures/comparison-adventure-001');
  await f.refresh();
  f.metadataReads.length = 0;
  const ref = await first(f);
  assert.equal(ref.availability, 'unavailable');
  assert.equal((await f.read(ref)).outcome, 'unavailable');
  assert.ok(
    f.metadataReads.every((r) => !r.fields.includes('name') && !r.fields.includes('manifest')),
  );
});
test('current source prose never substitutes the frozen anchor', async () => {
  const f = await savedLoreFixture();
  await patch(f, 'universes/world/lore/hero', { name: 'LIVE', details: 'LIVE BODY' });
  const ref = await first(f),
    anchor = await f.readAnchor(ref);
  assert.equal(anchor.content.item.title, 'Heroína');
  assert.equal(
    Buffer.from((await f.text(ref, 'details')).chunkBase64, 'base64').toString(),
    'Ficha 🐉',
  );
});
test('literal multichunk variant is verified in full before returning one bounded logical entity', async () => {
  const value = entity({ details: '\ufeff  ' + '🐉'.repeat(24000) + ' \n' }),
    f = await savedLoreFixture(value);
  assert.ok(bodies(f).length > 1);
  assert.equal((await f.read(await first(f))).content.entity.details, value.details);
  const [p, body] = bodies(f).at(-1);
  await patch(f, p, { content: body.content.replace('🐉', 'a') });
  await assert.rejects(f.read(await first(f)), bad);
});
test('native body rewrite with identical bytes changes content proof without changing variant metadata', async () => {
  const f = await savedLoreFixture(),
    ref = await first(f),
    before = await f.read(ref),
    [p, body] = bodies(f)[0];
  await patch(f, p, { content: body.content });
  const next = await f.read(ref);
  assert.equal(next.contentHash, before.contentHash);
  assert.notEqual(next.contentToken, before.contentToken);
});
test('missing body, corrupted metadata and noncanonical JSON all refuse', async () => {
  for (const change of ['missing', 'metadata', 'noncanonical']) {
    const f = await savedLoreFixture(),
      [p, body] = bodies(f)[0];
    if (change === 'missing') await remove(f, p);
    if (change === 'metadata') await patch(f, p, { campaignToken: '0'.repeat(64) });
    if (change === 'noncanonical') {
      const raw = ' ' + body.content;
      await patch(f, p, { content: raw });
      const h = f.records.get(f.overlayPath() + heroKey);
      await patch(f, f.overlayPath() + heroKey, {
        manifest: { ...h.manifest, bytes: Buffer.byteLength(raw), sha256: digest(raw) },
      });
    }
    await assert.rejects(f.read(await first(f)), bad);
  }
});
test('cross-campaign or preparing body generation is rejected before text', async () => {
  const f = await savedLoreFixture();
  await f.adopt();
  await f.save('generation-body', 2, entity());
  await f.adopt();
  const h = f.records.get(f.overlayPath() + heroKey),
    p = f.path + '/loreGenerations/' + h.bodyBinding.generationId;
  await patch(f, p, { campaignToken: '0'.repeat(64) });
  f.metadataReads.length = 0;
  await assert.rejects(f.list(), bad);
  assert.ok(f.metadataReads.every((r) => !r.fields.includes('content')));
});
test('active generation mismatch never falls back to legacy overlays even with unavailable origin', async () => {
  const f = await savedLoreFixture();
  await f.adopt();
  await remove(f, 'adventures/comparison-adventure-001');
  await f.refresh();
  const root = f.records.get(f.path),
    p = f.path + '/loreGenerations/' + root.activeLoreGenerationId;
  await patch(f, p, { state: 'preparing' });
  await assert.rejects(f.list(), bad);
});
test('stale variant proof is refused before reading its protected header', async () => {
  const f = await savedLoreFixture(),
    ref = await first(f);
  await patch(f, f.overlayPath() + heroKey, { name: 'Changed' });
  f.metadataReads.length = 0;
  await assert.rejects(f.read(ref), changed);
  assert.ok(
    f.metadataReads.every((r) => !r.fields.includes('name') && !r.fields.includes('manifest')),
  );
});
test('closed inputs and detached resource requests cannot switch targets after await', async () => {
  const f = await savedLoreFixture(),
    ref = await first(f);
  for (const extra of [{ path: 'hidden' }, { id: '../bad' }, { variantToken: 'bad' }])
    await assert.rejects(f.read(ref, extra), (e) => e.code === 'invalid-argument');
  await assert.rejects(
    f.text(ref, 'details', { field: 'unknown' }),
    (e) => e.code === 'invalid-argument',
  );
  const request = { ...f.anchor, id: ref.id, variantToken: ref.variantToken },
    pending = f.backup.readCampaignBackupLoreVariant(uid, request);
  request.id = '0'.repeat(64);
  request.variantToken = '0'.repeat(64);
  assert.equal((await pending).content.sourceKey, heroKey);
});
test('account, own source, derived token, admission and C4 guards precede lore', async () => {
  const f = await savedLoreFixture(),
    ref = await first(f);
  await assert.rejects(
    f.backup.listCampaignBackupLoreVariants('foreign', f.anchor),
    (e) => e.code === 'not-found',
  );
  await assert.rejects(f.read(ref, { sourceToken: '0'.repeat(64) }), bad);
  await assert.rejects(f.read(ref, { derivedToken: '0'.repeat(64) }), bad);
  await f.db.runTransaction(async (tx) =>
    tx.set(f.db.doc(loreGuardPath(uid, f.id, f.campaignToken)), {
      schemaVersion: 1,
      ownerId: uid,
      campaignId: f.id,
      campaignToken: f.campaignToken,
      admissionEpoch: 1,
      adoptionId: 'pending',
    }),
  );
  await assert.rejects(f.read(ref), (e) => e.details?.reason === 'adoption-in-progress');
  await patch(f, f.path, { deleting: true });
  await assert.rejects(f.list(), (e) => e.code === 'not-found' || e.code === 'failed-precondition');
});
test('relations hide unavailable target prose while preserving an authorized declared relation', async () => {
  const otherKey = baseSourceKey({ kind: 'lore', scopeId: 'world', id: 'ally' });
  const f = await savedLoreFixture(
    entity({
      relations: [{ targetKey: otherKey, relationType: 'Aliada', description: 'SECRETO' }],
    }),
    async ({ universe, scenes, scene }) => {
      await universe.saveUniverseLore(uid, {
        universeId: 'world',
        id: 'ally',
        create: true,
        input: {
          name: 'Aliada',
          summary: 'Resumo',
          details: 'Alvo',
          category: 'character',
          aliases: [],
          relations: [],
          isPublic: false,
          structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
        },
      });
      const target = { kind: 'adventure', id: 'comparison-adventure-001' };
      await scenes.setSceneReference(uid, {
        target,
        sceneId: scene.id,
        operationId: 'backup-relation-ally',
        expectedRevision: (await scenes.getScene(uid, { target, sceneId: scene.id })).revision,
        reference: { kind: 'universe', scopeId: 'world', entityId: 'ally' },
      });
    },
  );
  const ref = await first(f),
    before = await f.read(ref);
  assert.deepEqual(before.content.entity.relations, [
    { targetKey: otherKey, relationType: 'Aliada', description: 'SECRETO', available: true },
  ]);
  await patch(f, 'universes/world/lore/ally', { deleted: true });
  const after = await f.read(ref);
  assert.deepEqual(after.content.entity.relations, [{ targetKey: otherKey, available: false }]);
  assert.ok(!JSON.stringify(after.content).includes('SECRETO'));
  assert.notEqual(before.contentHash, after.contentHash);
  assert.notEqual(before.contentToken, after.contentToken);
});

test('many real overlays paginate without filtering and bind cursors and lookahead', async () => {
  const count = 27,
    f = await backupLoreFixture(async ({ universe, scenes, scene }) => {
      const target = { kind: 'adventure', id: 'comparison-adventure-001' };
      for (let index = 0; index < count; index++) {
        const id = 'page-' + index;
        await universe.saveUniverseLore(uid, {
          universeId: 'world',
          id,
          create: true,
          input: {
            name: 'Ficha ' + index,
            summary: 'Resumo',
            category: 'character',
            details: 'Base ' + index,
            aliases: [],
            relations: [],
            isPublic: false,
            structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
          },
        });
        await scenes.setSceneReference(uid, {
          target,
          sceneId: scene.id,
          operationId: 'backup-page-ref-' + index,
          expectedRevision: (await scenes.getScene(uid, { target, sceneId: scene.id })).revision,
          reference: { kind: 'universe', scopeId: 'world', entityId: id },
        });
      }
    });
  for (let index = 0; index < count; index++)
    await f.save(
      'page-save-' + index,
      0,
      entity(),
      baseSourceKey({ kind: 'lore', scopeId: 'world', id: 'page-' + index }),
    );
  await f.refresh();
  const all = [];
  let cursor = null;
  do {
    const p = await f.list({ limit: 5, cursor });
    assert.ok(p.items.length <= 5);
    all.push(...p.items);
    cursor = p.nextCursor;
  } while (cursor !== null);
  assert.equal(all.length, count);
  assert.deepEqual(
    all.map((r) => r.id),
    all.map((r) => r.id).sort(),
  );
  const page = await f.list({ limit: 1 });
  await assert.rejects(
    f.list({ limit: 2, cursor: page.nextCursor }),
    (e) => e.code === 'invalid-argument',
  );
  const parsed = JSON.parse(Buffer.from(page.nextCursor, 'base64url').toString('utf8'));
  parsed.storageToken = '0'.repeat(64);
  await assert.rejects(
    f.list({ limit: 1, cursor: Buffer.from(JSON.stringify(parsed)).toString('base64url') }),
    (e) => e.code === 'invalid-argument',
  );
  const next = all[1],
    old = f.records.get(f.overlayPath() + next.id);
  await patch(f, f.overlayPath() + next.id, { updatedAt: old.updatedAt + 1 });
  await assert.rejects(
    f.list({ limit: 1, expectedPageToken: page.pageToken }),
    (e) => e.details?.reason === 'campaign-backup-page-changed',
  );
});
test('local lore uses its original adventure incarnation for variant and anchor authorization', async () => {
  const { createAdventureLoreService } = await import('../src/adventureLore.mjs');
  const entityId = 'backup-local-lore-001',
    adventureId = 'comparison-adventure-001';
  let api, scope;
  const f = await backupLoreFixture(async ({ db, scenes, scene }) => {
    api = createAdventureLoreService({ db });
    const first = await api.listAdventureLore(uid, { adventureId, scope: 'adventure' });
    scope = { adventureId, adventureToken: first.adventureToken };
    await api.saveAdventureLore(uid, {
      ...scope,
      entityId,
      operationId: entityId,
      expectedRevision: 0,
      expectedCollectionRevision: 0,
      entity: { ...entity(), isPublic: false },
    });
    const target = { kind: 'adventure', id: adventureId };
    await scenes.setSceneReference(uid, {
      target,
      sceneId: scene.id,
      operationId: 'backup-local-lore-ref',
      expectedRevision: (await scenes.getScene(uid, { target, sceneId: scene.id })).revision,
      reference: { kind: 'adventure', scopeId: adventureId, entityId },
    });
  });
  const key = baseSourceKey({ kind: 'adventure-lore', adventureId, id: entityId });
  await f.save('save-local-variant', 0, entity({ details: 'Variante local' }), key);
  await f.refresh();
  const ref = (await f.list()).items.find((v) => v.id === key);
  assert.equal((await f.read(ref)).content.entity.details, 'Variante local');
  assert.equal((await f.readAnchor(ref)).content.item.origin.kind, 'adventure-lore');
  await api.deleteAdventureLore(uid, {
    ...scope,
    entityId,
    operationId: 'backup-local-lore-delete',
    expectedRevision: 1,
    expectedCollectionRevision: 1,
  });
  await f.refresh();
  const next = (await f.list()).items.find((v) => v.id === key);
  assert.equal(next.availability, 'unavailable');
  assert.equal((await f.read(next)).outcome, 'unavailable');
});
test('all readers use masked documents and never write operational state', async () => {
  const f = await savedLoreFixture(),
    before = structuredClone([...f.records]),
    deny = () => assert.fail('Read only');
  const db = {
      ...f.db,
      runTransaction: (cb) =>
        f.db.runTransaction((tx) =>
          cb({
            ...tx,
            set: deny,
            create: deny,
            update: deny,
            delete: deny,
            get: (query) => {
              assert.ok(query.collectionPath);
              assert.ok(query.maximum <= 26);
              return tx.get(query);
            },
          }),
        ),
    },
    api = createCampaignBackupLoreService({ db }),
    page = await api.listCampaignBackupLoreVariants(uid, f.anchor),
    ref = page.items[0],
    request = { ...f.anchor, id: ref.id, variantToken: ref.variantToken };
  await api.readCampaignBackupLoreVariant(uid, request);
  await api.readCampaignBackupLoreAnchor(uid, request);
  await api.readCampaignBackupLoreAnchorText(uid, { ...request, field: 'details', index: 0 });
  assert.deepEqual([...f.records], before);
});

test('declared null generation refuses legacy fallback after origin disappears', async () => {
  const f = await savedLoreFixture();
  await f.adopt();
  await remove(f, 'adventures/comparison-adventure-001');
  await patch(f, f.path, { activeLoreGenerationId: null });
  await f.refresh();
  f.metadataReads.length = 0;
  await assert.rejects(f.list(), bad);
  assert.ok(
    f.metadataReads.every((r) => !r.fields.includes('name') && !r.fields.includes('content')),
  );
});
