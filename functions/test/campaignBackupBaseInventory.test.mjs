import test from 'node:test';
import assert from 'node:assert/strict';
import { baseFixture, logical, row, refreshBase, uid } from './helpers/campaignBackupBase.mjs';
import { createCampaignBackupBaseInventoryService } from '../src/campaignBackupBaseInventory.mjs';
import { baseBodyKey, baseTextFields, digest } from '../src/campaignBaseContracts.mjs';
import { campaignIdentityToken } from '../src/campaignIdentity.mjs';
import { loreGuardPath } from '../src/campaignLoreStorage.mjs';
const inconsistent = (e) => e.details?.reason === 'campaign-backup-base-inconsistent';
const changed = (e) => e.details?.reason === 'campaign-backup-base-item-changed';
const families = ['bodies', 'links', 'loreReferences', 'images'];
async function fixture(before) {
  const f = await baseFixture(before);
  f.inventory = createCampaignBackupBaseInventoryService({ db: f.db });
  f.resources = (family, extra = {}) =>
    f.inventory.listCampaignBackupBaseResources(uid, { ...f.anchor, family, ...extra });
  f.resource = (family, ref, extra = {}) =>
    f.inventory.readCampaignBackupBaseResource(uid, {
      ...f.anchor,
      family,
      id: ref.id,
      resourceToken: ref.resourceToken,
      index: 0,
      ...extra,
    });
  f.audit = (ref, extra = {}) =>
    f.inventory.auditCampaignBackupBaseItem(uid, {
      ...f.anchor,
      id: ref.id,
      itemToken: ref.itemToken,
      ...extra,
    });
  return f;
}
async function patch(f, path, value) {
  await f.db.runTransaction(async (tx) => tx.update(f.db.doc(path), value));
}
async function remove(f, path) {
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(path)));
}
async function dto(f, family, ref) {
  const chunks = [];
  let result;
  for (let index = 0; !result || index < result.chunkCount; index++) {
    result = await f.resource(family, ref, { index });
    if (result.outcome === 'unavailable') return { result, content: null };
    chunks.push(Buffer.from(result.chunkBase64, 'base64'));
  }
  const bytes = Buffer.concat(chunks);
  assert.equal(bytes.length, result.byteLength);
  assert.equal(digest(bytes.toString('utf8')), result.contentHash);
  return { result, content: JSON.parse(bytes.toString('utf8')) };
}
async function rewrite(f, scene, text) {
  const plan = baseTextFields(scene.sourceKey, { content: text });
  await f.db.runTransaction(async (tx) => {
    tx.update(f.db.doc(f.path + '/items/' + scene.sourceKey), {
      fields: scene.fields.map((field) => (field.field === 'content' ? plan.fields[0] : field)),
    });
    for (const body of plan.bodies)
      tx.set(
        f.db.doc(f.path + '/bodies/' + baseBodyKey(body.sourceKey, body.field, body.index)),
        body,
      );
  });
  // Principal is a distinct header sharing the same scene manifest.
  const main = f.stored('block', (v) => v.role === 'main' && v.parentKey === scene.sourceKey);
  await patch(f, f.path + '/items/' + main.sourceKey, { fields: [plan.fields[0]] });
  return plan;
}
test('all physical families cover the real native capture including shared bodies and closed DTOs', async () => {
  const f = await fixture(),
    before = structuredClone([...f.records]);
  let physical = 0;
  for (const family of families) {
    const page = await f.resources(family);
    assert.equal(page.nextCursor, null);
    const expected = [...f.records.keys()].filter((p) => p.startsWith(f.path + '/' + family + '/'));
    assert.equal(page.items.length, expected.length);
    for (const entry of page.items) {
      assert.deepEqual(Object.keys(entry).sort(), ['availability', 'id', 'resourceToken']);
      assert.equal(entry.availability, 'available');
      const { content } = await dto(f, family, entry);
      if (family === 'bodies') {
        physical++;
        assert.deepEqual(Object.keys(content).sort(), ['field', 'index', 'sourceKey']);
      }
      if (family === 'images') {
        assert.deepEqual(Object.keys(content).sort(), ['byteLength', 'imageKey']);
        assert.equal(content.byteLength, 4);
      }
      if (family === 'links')
        assert.deepEqual(Object.keys(content).sort(), ['id', 'kind', 'sourceKey', 'target']);
      if (family === 'loreReferences')
        assert.deepEqual(Object.keys(content).sort(), ['available', 'id', 'targetKey']);
      assert.ok(!JSON.stringify(content).includes('campaign-base:'));
      assert.ok(!JSON.stringify(content).includes('book-covers/'));
    }
  }
  const main = f.stored('block', (v) => v.role === 'main');
  assert.ok(![...f.records.values()].some((v) => v.sourceKey === main.sourceKey && 'content' in v));
  assert.equal(physical, 16);
  assert.deepEqual([...f.records], before);
});
test('physical list reads no captured prose or names and never writes', async () => {
  const f = await fixture();
  f.metadataReads.length = 0;
  f.reads.length = 0;
  const forbidden = () => assert.fail('Physical inventory may not write or full-read a document');
  const db = {
    ...f.db,
    runTransaction: (cb) =>
      f.db.runTransaction((tx) =>
        cb({
          ...tx,
          set: forbidden,
          update: forbidden,
          create: forbidden,
          delete: forbidden,
          get: (q) => {
            assert.ok(q.collectionPath);
            assert.ok(q.maximum <= 26);
            return tx.get(q);
          },
        }),
      ),
  };
  const api = createCampaignBackupBaseInventoryService({ db });
  for (const family of families)
    await api.listCampaignBackupBaseResources(uid, { ...f.anchor, family });
  assert.ok(
    f.metadataReads.every((r) =>
      r.fields.every(
        (field) => !/^(title|name|summary|details|content|snapshot|synopsis)(\.|$)/.test(field),
      ),
    ),
  );
  assert.ok(
    f.reads.every((q) => q.fields?.every((field) => !['title', 'content'].includes(field))),
  );
});
test('native item auditor verifies every declared field and logical image without returning text', async () => {
  const f = await fixture(),
    refs = (await f.list()).items;
  let fields = 0;
  for (const ref of refs) {
    const header = await logical(f, ref),
      result = await f.audit(ref);
    assert.equal(result.availability, 'available');
    assert.equal(result.fields.length, header.fields.length);
    for (let index = 0; index < result.fields.length; index++) {
      const check = result.fields[index],
        stored = header.fields[index];
      assert.equal(check.sha256, stored.sha256);
      assert.equal(check.bytes, stored.bytes);
      assert.equal(check.chunkCount, stored.chunkCount);
      assert.match(check.bodyProof, /^[a-f0-9]{64}$/);
      fields++;
    }
    assert.match(result.itemAuditToken, /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(result).includes('Ficha 🐉'), false);
    assert.equal(JSON.stringify(result).includes('book-covers/'), false);
    if (header.image) assert.equal(result.image.availability, 'available');
  }
  assert.equal(fields, 17);
});
test('server audit checks whole multichunk SHA, including a corrupted part outside the requested first part', async () => {
  const f = await fixture(),
    scene = f.stored('scene'),
    text = '\ufeff  ' + '🐉á'.repeat(15000) + ' \n',
    plan = await rewrite(f, scene, text),
    ref = await row(f, scene),
    valid = await f.audit(ref);
  assert.equal(valid.fields[0].sha256, digest(text));
  assert.equal(valid.fields[0].bytes, Buffer.byteLength(text));
  assert.ok(valid.fields[0].chunkCount > 1);
  const last = plan.bodies.at(-1),
    p = f.path + '/bodies/' + baseBodyKey(scene.sourceKey, 'content', last.index);
  await patch(f, p, { content: last.content.replace('á', 'a') });
  await assert.rejects(f.audit(ref), inconsistent);
  // One-part reads are provisional; corruption in another part is caught by this auditor.
  await assert.doesNotReject(f.text(ref, 'content'));
});
test('body mutation changes native audit proof even when the bytes are identical', async () => {
  const f = await fixture(),
    scene = f.stored('scene'),
    ref = await row(f, scene),
    first = await f.audit(ref),
    field = scene.fields[0],
    p = f.path + '/bodies/' + baseBodyKey(scene.sourceKey, field.field, 0),
    old = f.records.get(p);
  await patch(f, p, { content: old.content });
  const next = await f.audit(ref);
  assert.equal(next.fields[0].sha256, first.fields[0].sha256);
  assert.notEqual(next.fields[0].bodyProof, first.fields[0].bodyProof);
  assert.notEqual(next.itemAuditToken, first.itemAuditToken);
});
test('missing declared body is detected by item audit even when physical listing cannot see it', async () => {
  const f = await fixture(),
    scene = f.stored('scene'),
    ref = await row(f, scene),
    field = scene.fields[0],
    p = f.path + '/bodies/' + baseBodyKey(scene.sourceKey, field.field, 0);
  await remove(f, p);
  assert.equal((await f.resources('bodies')).items.length, 15);
  await assert.rejects(f.audit(ref), inconsistent);
});
test('extra body outside a manifest and body without an owner both refuse without reading content', async () => {
  for (const unknown of [false, true]) {
    const f = await fixture(),
      scene = f.stored('scene'),
      sourceKey = unknown ? '0'.repeat(64) : scene.sourceKey,
      index = unknown ? 0 : 99,
      key = baseBodyKey(sourceKey, 'content', index);
    await f.db.runTransaction(async (tx) =>
      tx.create(f.db.doc(f.path + '/bodies/' + key), {
        sourceKey,
        field: 'content',
        index,
        content: 'SECRET ORPHAN',
      }),
    );
    f.metadataReads.length = 0;
    await assert.rejects(f.resources('bodies'), inconsistent);
    assert.ok(f.metadataReads.every((r) => !r.fields.includes('content')));
  }
});
test('wrong body document key or malformed coordinates refuse', async () => {
  for (const update of [{ field: 'unknown' }, { index: -1 }, { sourceKey: 'bad' }]) {
    const f = await fixture(),
      [p] = [...f.records].find(([p]) => p.startsWith(f.path + '/bodies/'));
    await patch(f, p, update);
    await assert.rejects(f.resources('bodies'), inconsistent);
  }
});
test('revoked lore bodies remain explicit entries without manifest, prose or content hashes', async () => {
  const f = await fixture(),
    lore = f.stored('lore'),
    ref = await row(f, lore);
  await patch(f, 'universes/world/lore/hero', { deleted: true });
  const fresh = await row(f, lore),
    bodyKeys = lore.fields.map((v) => baseBodyKey(lore.sourceKey, v.field, 0));
  f.metadataReads.length = 0;
  const page = await f.resources('bodies');
  for (const key of bodyKeys) {
    const entry = page.items.find((v) => v.id === key);
    assert.equal(entry.availability, 'unavailable');
    const result = await f.resource('bodies', entry);
    assert.equal(result.outcome, 'unavailable');
    assert.ok(!('contentHash' in result));
  }
  const audit = await f.audit(fresh);
  assert.equal(audit.availability, 'unavailable');
  assert.ok(!('fields' in audit));
  assert.ok(
    f.metadataReads
      .filter((r) => r.path === f.path + '/items/' + lore.sourceKey)
      .every((r) => !r.fields.includes('fields')),
  );
  assert.ok(f.metadataReads.every((r) => !r.fields.includes('content')));
  await assert.rejects(f.audit(ref), changed);
});
test('revoked link and reference targets keep only logical unavailable keys', async () => {
  const f = await fixture(),
    lore = f.stored('lore');
  await patch(f, 'universes/world/lore/hero', { deleted: true });
  for (const family of ['links', 'loreReferences']) {
    const page = await f.resources(family);
    for (const entry of page.items) {
      const { content } = await dto(f, family, entry);
      const target = family === 'links' ? content.target : content;
      assert.equal(target.available, false);
      assert.equal(family === 'links' ? target.sourceKey : target.targetKey, lore.sourceKey);
      assert.equal(JSON.stringify(content).includes('hero'), false);
      assert.equal(JSON.stringify(content).includes('Heroína'), false);
    }
  }
});
test('lore link cannot lose its captured reference ledger, and ledger cannot lose its source links', async () => {
  const f = await fixture(),
    ledger = [...f.records.keys()].find((p) => p.startsWith(f.path + '/loreReferences/'));
  await remove(f, ledger);
  await assert.rejects(f.resources('links'), inconsistent);
  const g = await fixture();
  for (const p of [...g.records.keys()].filter((p) => p.startsWith(g.path + '/links/')))
    await remove(g, p);
  await assert.rejects(g.resources('loreReferences'), inconsistent);
});
test('reference ledger must be canonical, processed and coherent with its captured lore', async () => {
  for (const update of [
    { processed: false },
    { referenceKey: '0'.repeat(64) },
    { available: false },
    { sourceKey: '0'.repeat(64) },
  ]) {
    const f = await fixture(),
      p = [...f.records.keys()].find((p) => p.startsWith(f.path + '/loreReferences/'));
    await patch(f, p, update);
    await assert.rejects(f.resources('loreReferences'), inconsistent);
  }
});
test('orphan source or incorrect source kind invalidates links before prose', async () => {
  for (const sourceKey of ['0'.repeat(64), 'part']) {
    const f = await fixture(),
      p = [...f.records.keys()].find(
        (p) => p.startsWith(f.path + '/links/') && f.records.get(p).kind === 'scene',
      );
    await patch(f, p, { sourceKey: sourceKey === 'part' ? f.stored('part').sourceKey : sourceKey });
    await assert.rejects(f.resources('links'), inconsistent);
  }
});
test('narrative scene/event targets preserve logical links and explicitly mark missing targets', async () => {
  const f = await fixture(async ({ db, narrative, arc, scene, event }) => {
    const target = { kind: 'adventure', id: 'comparison-adventure-001' },
      source = { kind: 'arc', id: arc.item.id },
      p = 'adventures/' + target.id + '/arcs/' + arc.item.id;
    for (const reference of [
      { kind: 'scene', sceneId: scene.id },
      { kind: 'event', eventId: event.item.id },
    ])
      await narrative.setNarrativeReference(uid, {
        target,
        source,
        reference,
        operationId: 'inventory-target-' + reference.kind,
        expectedRevision: (await db.doc(p).get()).data().revision,
      });
  });
  const results = [];
  for (const entry of (await f.resources('links')).items)
    results.push((await dto(f, 'links', entry)).content);
  assert.deepEqual(results.map((v) => v.target.kind).sort(), ['event', 'lore', 'lore', 'scene']);
  const event = f.stored('event');
  await remove(f, f.path + '/items/' + event.sourceKey);
  const next = [];
  for (const entry of (await f.resources('links')).items)
    next.push((await dto(f, 'links', entry)).content);
  assert.deepEqual(next.find((v) => v.target.kind === 'event').target, {
    kind: 'event',
    sourceKey: event.sourceKey,
    available: false,
  });
});
test('external-scope lore declarations never trigger a lookup outside the captured scope', async () => {
  const f = await fixture(),
    p = [...f.records.keys()].find(
      (p) => p.startsWith(f.path + '/links/') && f.records.get(p).kind === 'scene',
    );
  await patch(f, p, { reference: { kind: 'universe', scopeId: 'outside', entityId: 'hidden' } });
  f.metadataReads.length = 0;
  const page = await f.resources('links');
  const entry = page.items.find((v) => v.id === p.split('/').at(-1)),
    { content } = await dto(f, 'links', entry);
  assert.equal(content.target.available, false);
  assert.ok(f.metadataReads.every((r) => !r.path.includes('outside')));
  assert.ok(!JSON.stringify(content).includes('hidden'));
});
test('image with no captured referencing block and missing declared image are caught in opposite passes', async () => {
  const f = await fixture(),
    main = f.stored('block', (v) => v.role === 'main');
  await patch(f, f.path + '/items/' + main.sourceKey, { image: null });
  await assert.rejects(f.resources('images'), inconsistent);
  const g = await fixture(),
    block = g.stored('block', (v) => v.role === 'main'),
    image = [...g.records.keys()].find((p) => p.startsWith(g.path + '/images/'));
  await remove(g, image);
  assert.equal((await g.resources('images')).items.length, 0);
  await assert.rejects(g.audit(await row(g, block)), inconsistent);
});
test('removed image use or library revokes bytes while the logical text remains auditable', async () => {
  for (const target of ['use', 'library']) {
    const f = await fixture(),
      [imagePath, image] = [...f.records].find(([p]) => p.startsWith(f.path + '/images/')),
      library = 'users/' + uid + '/imageLibrary/' + image.imageId;
    assert.ok(imagePath);
    await remove(f, target === 'use' ? library + '/uses/' + image.useKey : library);
    const entry = (await f.resources('images')).items[0],
      result = await f.resource('images', entry);
    assert.equal(entry.availability, 'unavailable');
    assert.equal(result.outcome, 'unavailable');
    assert.ok(!('contentHash' in result));
    const main = f.stored('block', (v) => v.role === 'main'),
      audit = await f.audit(await row(f, main));
    assert.equal(audit.image.availability, 'unavailable');
    assert.equal(audit.fields[0].sha256, main.fields[0].sha256);
  }
});
test('malformed image pins and sizes never pass as logical images', async () => {
  for (const update of [
    { generation: '1e20' },
    { size: 0 },
    { size: 16 * 1024 * 1024 + 1 },
    { useKey: 'bad' },
    { imageKey: '0'.repeat(64) },
  ]) {
    const f = await fixture(),
      p = [...f.records.keys()].find((p) => p.startsWith(f.path + '/images/'));
    await patch(f, p, update);
    await assert.rejects(f.resources('images'), inconsistent);
  }
});
test('physical pagination crosses multiple windows, keeps order and binds family, base and limit', async () => {
  const f = await fixture(),
    scene = f.stored('scene');
  await rewrite(f, scene, 'á'.repeat(900000));
  const first = await f.resources('bodies', { limit: 4 }),
    ids = [];
  assert.ok(first.nextCursor);
  let cursor = null;
  do {
    const p = await f.resources('bodies', { limit: 4, cursor });
    assert.ok(p.items.length <= 4);
    ids.push(...p.items.map((v) => v.id));
    cursor = p.nextCursor;
  } while (cursor);
  assert.equal(ids.length, 43);
  assert.deepEqual(ids, [...ids].sort());
  assert.equal(new Set(ids).size, ids.length);
  await assert.rejects(
    f.resources('links', { limit: 4, cursor: first.nextCursor }),
    (e) => e.code === 'invalid-argument',
  );
  await assert.rejects(
    f.resources('bodies', { limit: 5, cursor: first.nextCursor }),
    (e) => e.code === 'invalid-argument',
  );
  const crossed = JSON.parse(Buffer.from(first.nextCursor, 'base64url').toString('utf8'));
  crossed.baseId = '0'.repeat(64);
  await assert.rejects(
    f.resources('bodies', {
      limit: 4,
      cursor: Buffer.from(JSON.stringify(crossed)).toString('base64url'),
    }),
    (e) => e.code === 'invalid-argument',
  );
});
test('lookahead and content changes invalidate page and resource proofs without changing source anchor', async () => {
  const f = await fixture(),
    all = await f.resources('bodies'),
    first = await f.resources('bodies', { limit: 1 }),
    second = all.items[1],
    p = f.path + '/bodies/' + second.id,
    body = f.records.get(p);
  await patch(f, p, { content: body.content });
  await assert.rejects(
    f.resources('bodies', { limit: 1, expectedPageToken: first.pageToken }),
    (e) => e.details?.reason === 'campaign-backup-page-changed',
  );
  await assert.rejects(f.resource('bodies', second), changed);
});
test('snapshot comes from frozen base, validates native scope and exports no operational controls', async () => {
  const f = await fixture();
  await patch(f, 'adventures/comparison-adventure-001', {
    title: 'LIVE',
    synopsis: 'LIVE SYNOPSIS',
    language: 'en',
  });
  const ref = { id: f.baseId, resourceToken: f.anchor.derivedToken },
    { content } = await dto(f, 'base', ref);
  assert.equal(content.title, 'Aventura');
  assert.equal(content.synopsis, 'Sinopse');
  assert.equal(content.language, 'pt-BR');
  assert.deepEqual(Object.keys(content).sort(), [
    'adventureId',
    'capturedAt',
    'language',
    'synopsis',
    'title',
    'universeId',
  ]);
  f.metadataReads.length = 0;
  await assert.rejects(f.resource('base', { ...ref, resourceToken: '0'.repeat(64) }), changed);
  assert.ok(f.metadataReads.every((r) => !r.fields.includes('snapshot.title')));
});
test('closed requests are detached before await and unknown paths/families/indexes refuse', async () => {
  const f = await fixture(),
    ref = (await f.resources('links')).items[0];
  for (const extra of [{ family: '../items' }, { index: -1 }, { index: 1.5 }, { path: 'hidden' }])
    await assert.rejects(f.resource('links', ref, extra), (e) => e.code === 'invalid-argument');
  const input = {
      ...f.anchor,
      family: 'links',
      id: ref.id,
      resourceToken: ref.resourceToken,
      index: 0,
    },
    pending = f.inventory.readCampaignBackupBaseResource(uid, input);
  input.family = 'images';
  input.id = '0'.repeat(64);
  assert.equal((await pending).family, 'links');
});
test('foreign account, stale source and derived token, admission guard and C4 precede resources', async () => {
  const f = await fixture(),
    ref = await row(f, f.stored('scene'));
  await assert.rejects(
    f.inventory.listCampaignBackupBaseResources('foreign', { ...f.anchor, family: 'bodies' }),
    (e) => e.code === 'not-found' || e.code === 'permission-denied',
  );
  await assert.rejects(
    f.audit(ref, { sourceToken: '0'.repeat(64) }),
    (e) => e.details?.reason === 'campaign-backup-source-changed',
  );
  await assert.rejects(
    f.audit(ref, { derivedToken: '0'.repeat(64) }),
    (e) => e.details?.reason === 'campaign-backup-derived-source-changed',
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
  await assert.rejects(f.audit(ref), (e) => e.details?.reason === 'adoption-in-progress');
  await patch(f, 'campaigns/' + f.id, { deleting: true });
  await assert.rejects(
    f.resources('bodies'),
    (e) => e.code === 'not-found' || e.code === 'failed-precondition',
  );
});

test('originally unavailable captured lore references remain unavailable without synthesizing a ficha', async () => {
  const f = await fixture(async ({ scenes, scene, universe }) => {
    const target = { kind: 'adventure', id: 'comparison-adventure-001' };
    await universe.saveUniverseLore(uid, {
      universeId: 'world',
      id: 'temporary',
      create: true,
      input: {
        name: 'Temporária',
        summary: 'Resumo',
        category: 'other',
        details: '',
        aliases: [],
        relations: [],
        isPublic: false,
        structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
      },
    });
    await scenes.setSceneReference(uid, {
      target,
      sceneId: scene.id,
      operationId: 'physical-missing-lore-reference',
      expectedRevision: (await scenes.getScene(uid, { target, sceneId: scene.id })).revision,
      reference: { kind: 'universe', scopeId: 'world', entityId: 'temporary' },
    });
    await universe.deleteUniverseLore(uid, { universeId: 'world', id: 'temporary' });
  });
  const records = [];
  for (const entry of (await f.resources('loreReferences')).items)
    records.push((await dto(f, 'loreReferences', entry)).content);
  assert.equal(records.length, 2);
  assert.equal(records.filter((r) => r.available === false).length, 1);
});
test('frozen snapshot metadata is chunked by bytes without truncating Unicode or BOM', async () => {
  const f = await fixture(),
    text = '\ufeff  ' + '🐉'.repeat(20000) + ' \n';
  await patch(f, f.path, { snapshot: { title: 'Aventura', synopsis: text, language: 'pt-BR' } });
  await refreshBase(f);
  const ref = { id: f.baseId, resourceToken: f.anchor.derivedToken },
    { result, content } = await dto(f, 'base', ref);
  assert.ok(result.chunkCount > 1);
  assert.equal(content.synopsis, text);
});
test('index configuration enables only the image key while preserving the private image map exemption', async () => {
  const { readFile } = await import('node:fs/promises'),
    config = JSON.parse(
      await readFile(new URL('../../firestore.indexes.json', import.meta.url), 'utf8'),
    ),
    item = config.fieldOverrides.filter((v) => v.collectionGroup === 'items');
  assert.deepEqual(item.find((v) => v.fieldPath === 'image').indexes, []);
  assert.deepEqual(item.find((v) => v.fieldPath === 'image.imageKey').indexes, [
    { order: 'ASCENDING', queryScope: 'COLLECTION' },
  ]);
  assert.equal(
    item.some((v) => ['image.alt', 'image.caption'].includes(v.fieldPath)),
    false,
  );
});
