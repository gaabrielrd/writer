import test from 'node:test';
import assert from 'node:assert/strict';
import { baseFixture, refreshBase, logical, row, uid } from './helpers/campaignBackupBase.mjs';
import { baseBodyKey, baseTextFields, digest } from '../src/campaignBaseContracts.mjs';
import { fixture as ownFixture } from './helpers/campaignBackup.mjs';
import { createCampaignBackupBaseReadService } from '../src/campaignBackupBaseRead.mjs';
import { createCampaignBackupDerivedSourceService } from '../src/campaignBackupDerivedSource.mjs';
import { loreGuardPath } from '../src/campaignLoreStorage.mjs';
import { campaignIdentityToken } from '../src/campaignIdentity.mjs';
const reason = (s) => (e) => e.details?.reason === s;
const inconsistent = reason('campaign-backup-base-inconsistent');
const changed = reason('campaign-backup-base-item-changed');
async function patch(f, path, update) {
  await f.db.runTransaction(async (tx) => tx.update(f.db.doc(path), update));
}
test('real capture reads all seven frozen kinds, declared fields and only logical image references', async () => {
  const f = await baseFixture(),
    before = structuredClone([...f.records]),
    page = await f.list();
  const kinds = new Set();
  for (const ref of page.items) {
    const v = await logical(f, ref);
    kinds.add(v.kind);
    const original = f.records.get(f.path + '/items/' + ref.id);
    assert.equal(v.title, original.title);
    assert.equal(v.archived, original.archived);
    assert.deepEqual(v.fields, original.fields);
    assert.ok(!JSON.stringify(v).includes('capturedExtra'));
    for (const field of v.fields) {
      const bytes = [];
      for (let index = 0; index < field.chunkCount; index++) {
        const chunk = await f.text(ref, field.field, { index });
        assert.equal(chunk.baseId, f.baseId);
        assert.ok(Buffer.from(chunk.chunkBase64, 'base64').length <= 65536);
        bytes.push(Buffer.from(chunk.chunkBase64, 'base64'));
      }
      const body = Buffer.concat(bytes);
      assert.equal(body.length, field.bytes);
      assert.equal(digest(body.toString('utf8')), field.sha256);
    }
    if (v.image) assert.deepEqual(Object.keys(v.image).sort(), ['alt', 'caption', 'imageKey']);
  }
  assert.deepEqual([...kinds].sort(), [
    'arc',
    'block',
    'event',
    'lore',
    'milestone',
    'part',
    'scene',
  ]);
  assert.deepEqual([...f.records], before);
  assert.equal(page.nextCursor, null);
});
test('current adventure/lore edits never replace the frozen edition', async () => {
  const f = await baseFixture(),
    scene = f.stored('scene'),
    lore = f.stored('lore');
  await patch(f, 'adventures/' + scene.origin.adventureId, { title: 'LIVE TITLE' });
  await patch(f, 'universes/world/lore/hero', { name: 'LIVE HERO', details: 'LIVE CONTENT' });
  await refreshBase(f);
  const ref = await row(f, scene),
    loreRef = await row(f, lore);
  assert.equal((await logical(f, ref)).title, scene.title);
  assert.equal(
    Buffer.from((await f.text(loreRef, 'details')).chunkBase64, 'base64').toString(),
    'Ficha 🐉',
  );
});
test('principal block shares only its scene content and returns identical body proof', async () => {
  const f = await baseFixture(),
    scene = f.stored('scene'),
    block = f.stored('block', (v) => v.role === 'main'),
    sceneRef = await row(f, scene),
    blockRef = await row(f, block),
    a = await f.text(sceneRef, 'content'),
    b = await f.text(blockRef, 'content');
  assert.equal(a.chunkBase64, b.chunkBase64);
  assert.equal(a.bodyToken, b.bodyToken);
  assert.equal((await logical(f, blockRef)).fields[0].bodySourceKey, scene.sourceKey);
});
test('empty, BOM, spaces and multichunk Unicode survive native text producers', async () => {
  const f = await baseFixture(),
    scene = f.stored('scene'),
    text = '\ufeff  ' + '🐉á'.repeat(15000) + ' \n',
    fields = baseTextFields(scene.sourceKey, { content: text, objective: '' });
  await f.db.runTransaction(async (tx) => {
    tx.update(f.db.doc(f.path + '/items/' + scene.sourceKey), { fields: fields.fields });
    for (const body of fields.bodies)
      tx.set(
        f.db.doc(f.path + '/bodies/' + baseBodyKey(body.sourceKey, body.field, body.index)),
        body,
      );
  });
  const ref = await row(f, scene),
    parts = [];
  const field = fields.fields[0];
  for (let index = 0; index < field.chunkCount; index++)
    parts.push(Buffer.from((await f.text(ref, 'content', { index })).chunkBase64, 'base64'));
  assert.equal(Buffer.concat(parts).toString('utf8'), text);
  const empty = await f.text(ref, 'objective');
  assert.equal(empty.chunkBase64, '');
  assert.equal(empty.fieldHash, digest(''));
  assert.equal(empty.fieldBytes, 0);
});
test('revoked lore appears without old name, manifests or text and no prose read occurs', async () => {
  const f = await baseFixture(),
    lore = f.stored('lore'),
    oldRef = await row(f, lore);
  await patch(f, 'universes/world/lore/hero', { deleted: true });
  f.metadataReads.length = 0;
  const ref = await row(f, lore);
  assert.equal(ref.availability, 'unavailable');
  await assert.rejects(f.item(oldRef), changed);
  const result = await f.item(ref);
  assert.equal(result.outcome, 'unavailable');
  assert.deepEqual(
    Object.keys(result).sort(),
    [
      'schemaVersion',
      'campaignId',
      'sourceToken',
      'derivedToken',
      'baseId',
      'id',
      'itemToken',
      'outcome',
    ].sort(),
  );
  await assert.rejects(f.text(ref, 'details'), reason('campaign-backup-base-item-unavailable'));
  assert.ok(
    f.metadataReads
      .filter((x) => x.path === f.path + '/items/' + lore.sourceKey)
      .every((x) => !x.fields.includes('title') && !x.fields.includes('fields')),
  );
  assert.ok(!JSON.stringify(result).includes(lore.title));
});
test('recreated lore identity cannot reauthorize frozen body', async () => {
  const f = await baseFixture(),
    lore = f.stored('lore'),
    p = 'universes/world/lore/hero',
    before = f.records.get(p);
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(p)));
  await f.db.runTransaction(async (tx) => tx.create(f.db.doc(p), before));
  const ref = await row(f, lore);
  assert.equal(ref.availability, 'unavailable');
  assert.equal((await f.item(ref)).outcome, 'unavailable');
});
test('unavailable relations preserve only logical key without type or description', async () => {
  const f = await baseFixture(),
    lore = f.stored('lore'),
    target = { kind: 'lore', scopeId: 'world', id: 'missing' },
    old = f.records.get(f.path + '/items/' + lore.sourceKey);
  await patch(f, f.path + '/items/' + lore.sourceKey, {
    structured: {
      ...old.structured,
      relations: [
        { targetEntityId: 'universe:world:missing', relationType: 'SECRET', description: 'HIDDEN' },
      ],
    },
  });
  const v = await logical(f, await row(f, lore));
  assert.deepEqual(v.structured.relations, [{ targetKey: digest(target), available: false }]);
  assert.ok(!JSON.stringify(v).includes('SECRET'));
});
test('authorized self relation preserves literal type and description without live target name', async () => {
  const f = await baseFixture(),
    lore = f.stored('lore');
  await patch(f, f.path + '/items/' + lore.sourceKey, {
    structured: {
      ...lore.structured,
      relations: [
        {
          targetEntityId: 'universe:world:hero',
          relationType: ' \ufeffAliada ',
          description: '  🐉  ',
        },
      ],
    },
  });
  const v = await logical(f, await row(f, lore));
  assert.deepEqual(v.structured.relations, [
    {
      targetKey: lore.sourceKey,
      available: true,
      relationType: ' \ufeffAliada ',
      description: '  🐉  ',
    },
  ]);
});
test('item pagination binds cursor to source, account, limit and includes lookahead', async () => {
  const f = await baseFixture(),
    all = await f.list(),
    first = await f.list({ limit: 1 });
  assert.equal(first.items.length, 1);
  const crossed = JSON.parse(Buffer.from(first.nextCursor, 'base64url').toString('utf8'));
  assert.equal(crossed.baseId, f.baseId);
  crossed.baseId = '0'.repeat(64);
  await assert.rejects(
    f.list({ limit: 1, cursor: Buffer.from(JSON.stringify(crossed)).toString('base64url') }),
    (e) => e.code === 'invalid-argument',
  );
  const next = await f.list({ limit: 1, cursor: first.nextCursor });
  assert.equal(next.items[0].id, all.items[1].id);
  await assert.rejects(
    f.list({ limit: 2, cursor: first.nextCursor }),
    (e) => e.code === 'invalid-argument',
  );
  const lookahead = all.items[1];
  await patch(f, f.path + '/items/' + lookahead.id, { title: 'changed' });
  await assert.rejects(
    f.list({ limit: 1, expectedPageToken: first.pageToken }),
    reason('campaign-backup-page-changed'),
  );
  assert.equal((await f.list({ limit: 1 })).items[0].itemToken, first.items[0].itemToken);
  const visited = [];
  let cursor = null;
  do {
    const p = await f.list({ limit: 2, cursor });
    visited.push(...p.items.map((x) => x.id));
    cursor = p.nextCursor;
  } while (cursor);
  assert.deepEqual(
    visited,
    all.items.map((x) => x.id),
  );
});
test('archived items remain present and absence of legacy fields is preserved', async () => {
  const f = await baseFixture(),
    scene = f.stored('scene'),
    part = f.stored('part');
  await patch(f, f.path + '/items/' + scene.sourceKey, { archived: true });
  assert.equal((await logical(f, await row(f, scene))).archived, true);
  assert.deepEqual((await logical(f, await row(f, part))).fields, []);
});
test('field bodies cannot cross logical items or reuse a foreign principal scene', async () => {
  const f = await baseFixture(),
    scene = f.stored('scene'),
    block = f.stored('block', (v) => v.role === 'additional');
  await patch(f, f.path + '/items/' + block.sourceKey, {
    fields: scene.fields.filter((x) => x.field === 'content'),
  });
  await assert.rejects(f.text(await row(f, block), 'content'), inconsistent);
});
test('principal shared manifest must equal its scene manifest', async () => {
  const f = await baseFixture(),
    block = f.stored('block', (v) => v.role === 'main');
  await patch(f, f.path + '/items/' + block.sourceKey, {
    fields: block.fields.map((v) => ({ ...v, sha256: '0'.repeat(64) })),
  });
  await assert.rejects(f.item(await row(f, block)), inconsistent);
});
test('parent kind, scope and native identity are proven before child prose', async () => {
  const f = await baseFixture(),
    scene = f.stored('scene'),
    ref = await row(f, scene),
    part = f.stored('part');
  await patch(f, f.path + '/items/' + part.sourceKey, { title: 'new' });
  f.metadataReads.length = 0;
  await assert.rejects(f.item(ref), changed);
  assert.ok(
    f.metadataReads
      .filter((x) => x.path === f.path + '/items/' + scene.sourceKey)
      .every((x) => !x.fields.includes('title')),
  );
  await patch(f, f.path + '/items/' + scene.sourceKey, { parentKey: f.stored('arc').sourceKey });
  await assert.rejects(f.list(), inconsistent);
});
test('malformed body coordinates, literal UTF8 and single chunk SHA fail closed', async () => {
  for (const mutation of [
    { field: 'notes' },
    { index: 3 },
    { content: 'WRONG' },
    { content: '\ud800' },
  ]) {
    const f = await baseFixture(),
      lore = f.stored('lore'),
      ref = await row(f, lore),
      field = lore.fields.find((x) => x.field === 'details'),
      key = baseBodyKey(field.bodySourceKey, 'details', 0);
    await patch(f, f.path + '/bodies/' + key, mutation);
    await assert.rejects(f.text(ref, 'details'), inconsistent);
  }
});
test('closed inputs reject paths, fields, invalid indexes and detached mutable requests', async () => {
  const f = await baseFixture(),
    scene = f.stored('scene'),
    ref = await row(f, scene);
  for (const extra of [
    { field: '../body' },
    { index: -1 },
    { index: 1.5 },
    { path: 'private' },
    { id: '../../x' },
  ])
    await assert.rejects(f.text(ref, 'content', extra), (e) => e.code === 'invalid-argument');
  const input = { ...f.anchor, id: ref.id, itemToken: ref.itemToken, index: 0, field: 'content' },
    pending = f.backup.readCampaignBackupBaseText(uid, input);
  input.field = 'details';
  input.id = '0'.repeat(64);
  assert.equal((await pending).field, 'content');
});
test('stale own source, derived source, adoption and C4 refuse before content', async () => {
  const f = await baseFixture(),
    ref = await row(f, f.stored('scene'));
  await assert.rejects(
    f.text(ref, 'content', { sourceToken: '0'.repeat(64) }),
    reason('campaign-backup-source-changed'),
  );
  await assert.rejects(
    f.text(ref, 'content', { derivedToken: '0'.repeat(64) }),
    reason('campaign-backup-derived-source-changed'),
  );
  const token = campaignIdentityToken(uid, f.id, await f.db.doc('campaigns/' + f.id).get());
  await f.db.runTransaction(async (tx) =>
    tx.set(f.db.doc(loreGuardPath(uid, f.id, token)), {
      schemaVersion: 1,
      ownerId: uid,
      campaignId: f.id,
      campaignToken: token,
      admissionEpoch: 1,
      adoptionId: 'pending',
    }),
  );
  await assert.rejects(f.text(ref, 'content'), reason('adoption-in-progress'));
  await patch(f, 'campaigns/' + f.id, { deleting: true });
  await assert.rejects(
    f.text(ref, 'content'),
    (e) => e.code === 'not-found' || e.code === 'failed-precondition',
  );
});
test('independent base is unavailable, never a successful empty frozen inventory', async () => {
  const f = await ownFixture(),
    own = await f.source.getCampaignBackupSource(uid, { campaignId: f.id }),
    derived = await createCampaignBackupDerivedSourceService({
      db: f.db,
    }).getCampaignBackupDerivedSource(uid, { campaignId: f.id, sourceToken: own.sourceToken });
  await assert.rejects(
    createCampaignBackupBaseReadService({ db: f.db }).listCampaignBackupBaseItems(uid, {
      campaignId: f.id,
      sourceToken: own.sourceToken,
      derivedToken: derived.derivedToken,
    }),
    reason('campaign-backup-base-unavailable'),
  );
});

test('local lore uses real metadata and frozen text, and requires its original adventure token', async () => {
  const entityId = 'backup-local-lore-001';
  const f = await baseFixture(async ({ db, scenes, scene }) => {
    const { createAdventureLoreService } = await import('../src/adventureLore.mjs');
    const api = createAdventureLoreService({ db }),
      adventureId = 'comparison-adventure-001',
      scope = await api.listAdventureLore(uid, { adventureId, scope: 'adventure' });
    await api.saveAdventureLore(uid, {
      adventureId,
      adventureToken: scope.adventureToken,
      entityId,
      operationId: entityId,
      expectedRevision: 0,
      expectedCollectionRevision: 0,
      entity: {
        name: 'Local',
        aliases: [],
        category: 'character',
        summary: 'Resumo local',
        details: ' \ufeffLocal 🐉 ',
        structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
        relations: [],
        isPublic: false,
      },
    });
    const target = { kind: 'adventure', id: adventureId };
    await scenes.setSceneReference(uid, {
      target,
      sceneId: scene.id,
      operationId: 'backup-local-reference-001',
      expectedRevision: (await scenes.getScene(uid, { target, sceneId: scene.id })).revision,
      reference: { kind: 'adventure', scopeId: adventureId, entityId },
    });
  });
  const lore = f.stored('lore', (v) => v.origin.kind === 'adventure-lore'),
    ref = await row(f, lore);
  assert.equal(ref.availability, 'available');
  assert.equal(
    Buffer.from((await f.text(ref, 'details')).chunkBase64, 'base64').toString(),
    ' \ufeffLocal 🐉 ',
  );
  await patch(f, f.path + '/items/' + lore.sourceKey, { originAdventureToken: '0'.repeat(64) });
  const unavailable = await row(f, lore);
  assert.equal(unavailable.availability, 'unavailable');
  assert.equal((await f.item(unavailable)).outcome, 'unavailable');
});
test('content mask cannot adopt a different native item after metadata proof', async () => {
  const f = await baseFixture(),
    scene = f.stored('scene'),
    ref = await row(f, scene);
  const db = {
    ...f.db,
    runTransaction: (cb) =>
      f.db.runTransaction((tx) =>
        cb({
          ...tx,
          getAll: async (r, o) => {
            if (r.path === f.path + '/items/' + scene.sourceKey && o.fieldMask.includes('title'))
              f.metadata.set(r.path, { updatedAt: 100 });
            return tx.getAll(r, o);
          },
        }),
      ),
  };
  await assert.rejects(
    createCampaignBackupBaseReadService({ db }).readCampaignBackupBaseItem(uid, {
      ...f.anchor,
      id: ref.id,
      itemToken: ref.itemToken,
      index: 0,
    }),
    changed,
  );
});
test('orphaned parents fail without reading captured prose', async () => {
  const f = await baseFixture(),
    scene = f.stored('scene');
  await patch(f, f.path + '/items/' + scene.sourceKey, { parentKey: '0'.repeat(64) });
  f.metadataReads.length = 0;
  await assert.rejects(f.list(), inconsistent);
  assert.ok(
    f.metadataReads.every((v) => !v.fields.includes('title') && !v.fields.includes('fields')),
  );
});
