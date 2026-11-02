import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { before, after, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { createCampaignBaseReadService } from '../../functions/src/campaignBaseRead.mjs';
import {
  baseSourceKey,
  baseTextFields,
  baseBodyKey,
  baseImageKey,
  baseImageUseKey,
  digest,
} from '../../functions/src/campaignBaseContracts.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const { Firestore } = requireFunctions('firebase-admin/firestore');
const projectId = 'demo-writer-campaign-base-read-tests',
  uid = 'owner',
  campaignId = 'campaign',
  baseId = 'base',
  adventureId = 'adventure',
  universeId = 'world',
  path = 'users/owner/campaignBases/base';
let environment, admin, api, assets;
const previousMetadata = process.env.METADATA_SERVER_DETECTION;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!address) throw new Error('Use somente o emulador demo.');
  process.env.METADATA_SERVER_DETECTION = 'none';
  const [host, port] = address.split(':');
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await admin.doc('campaigns/' + campaignId).set({
    schemaVersion: 1,
    ownerId: uid,
    activeBaseId: baseId,
    provenance: { kind: 'original', adventureId, baseId },
    universeId: null,
  });
  await admin.doc(path).set({
    id: baseId,
    schemaVersion: 1,
    ownerId: uid,
    state: 'ready',
    campaignId,
    adventureId,
    universeId,
    sourceToken: digest('frozen'),
    createdAt: 1,
    capturedAt: 20,
    snapshot: { title: 'Captured title', synopsis: 'Captured synopsis', language: 'pt-BR' },
  });
  await admin
    .doc('adventures/' + adventureId)
    .set({ schemaVersion: 1, ownerId: uid, title: 'Live title' });
  await admin
    .doc('universes/' + universeId)
    .set({ authorId: uid, loreVersion: 1, privacyVersion: 1 });
  assets = {
    metadata: async () => ({ generation: '9007199254740993', size: 4 }),
    readGeneration: async () => Buffer.from('data'),
  };
  api = createCampaignBaseReadService({
    db: admin,
    assets,
    deriveImage: async () => Buffer.from('webp'),
  });
});
after(async () => {
  await admin?.terminate();
  await environment?.cleanup();
  if (previousMetadata === undefined) delete process.env.METADATA_SERVER_DETECTION;
  else process.env.METADATA_SERVER_DETECTION = previousMetadata;
});
async function item(kind, id, extras = {}, texts = { content: 'Captured body' }) {
  const origin = kind === 'lore' ? { kind, id, scopeId: universeId } : { kind, id, adventureId };
  const sourceKey = baseSourceKey(origin),
    text = baseTextFields(sourceKey, texts);
  const value = {
    sourceKey,
    kind,
    origin,
    parentKey: null,
    archived: false,
    title: 'Captured ' + id,
    orderKey: id,
    fields: text.fields,
    structured: {},
    image: null,
    ...extras,
  };
  const batch = admin.batch();
  batch.set(admin.doc(path + '/items/' + sourceKey), value);
  for (const chunk of text.bodies)
    batch.set(
      admin.doc(path + '/bodies/' + baseBodyKey(sourceKey, chunk.field, chunk.index)),
      chunk,
    );
  if (kind === 'lore') batch.set(admin.doc('universes/world/lore/' + id), { name: 'Live ' + id });
  await batch.commit();
  return value;
}
const read = (value, extras = {}) =>
  api.readCampaignBaseItem(uid, { campaignId, sourceKey: value.sourceKey, ...extras });

test('SDK base controls, all child collections, chunks and pins deny direct browser reads/writes to owner, foreign and anonymous clients', async () => {
  const value = await item('block', 'block');
  const paths = [
    path,
    path + '/items/' + value.sourceKey,
    path + '/bodies/' + baseBodyKey(value.sourceKey, 'content', 0),
    path + '/images/image',
    path + '/links/link',
    path + '/loreReferences/reference',
    'users/owner/campaignPreparations/preparation',
    'users/owner/imageLibrary/image/uses/pin',
  ];
  for (const identity of [uid, 'other', null]) {
    const client = identity
      ? environment.authenticatedContext(identity).firestore()
      : environment.unauthenticatedContext().firestore();
    for (const key of paths) {
      await assertFails(getDoc(doc(client, key)));
      await assertFails(setDoc(doc(client, key), { forged: true }));
    }
  }
  await assert.rejects(
    api.readCampaignBaseItem('other', { campaignId, sourceKey: value.sourceKey }),
    { code: 'not-found' },
  );
});

test('SDK frozen source metadata, legacy part text and shared main body survive ordinary source edits with exact raw Unicode hashes', async () => {
  const content = '"á😀\n'.repeat(40000),
    scene = await item('scene', 'scene', {}, { content, objective: 'Plano' }),
    part = await item('part', 'part', {}, { legacyContent: 'Legado separado' });
  const main = await item('block', 'main', { parentKey: scene.sourceKey, role: 'main' });
  await admin
    .doc(path + '/items/' + main.sourceKey)
    .update({ fields: scene.fields.filter((field) => field.field === 'content') });
  const metadata = await api.getCampaignBase(uid, { campaignId });
  await admin
    .doc('adventures/adventure')
    .update({ title: 'New live title', sceneRevision: 900, universeId: 'different' });
  await admin.doc('campaigns/campaign').update({ universeId: 'organization' });
  assert.deepEqual(await api.getCampaignBase(uid, { campaignId }), metadata);
  let result = await read(main, { limit: 1 });
  const chunks = [...result.chunks];
  while (result.nextCursor) {
    result = await read(main, { limit: 1, cursor: result.nextCursor });
    chunks.push(...result.chunks);
  }
  assert.equal(chunks.map((chunk) => chunk.content).join(''), content);
  assert.equal(result.projectionToken, metadata.projectionToken);
  assert.equal(result.item.fields[0].sha256, digest(content));
  assert.equal((await read(part)).chunks[0].field, 'legacyContent');
  assert.equal((await read(part)).chunks[0].content, 'Legado separado');
  assert.equal(JSON.stringify(result).includes('bodySourceKey'), false);
  const list = await api.listCampaignBaseItems(uid, {
    campaignId,
    kind: 'block',
    parentKey: scene.sourceKey,
    limit: 1,
  });
  assert.deepEqual(
    list.items.map((entry) => entry.sourceKey),
    [main.sourceKey],
  );
  await admin.doc('adventures/adventure').delete();
  await assert.rejects(read(main), { code: 'not-found' });
});

test('SDK paginated lore reauthorizes current origins and filters whole relations to absent/noncaptured targets before output', async () => {
  const target = await item('lore', 'b', {}, { details: 'Target' });
  const source = await item(
    'lore',
    'a',
    {
      structured: {
        aliases: ['Captured alias'],
        category: 'character',
        isPublic: false,
        relations: [
          {
            targetEntityId: 'universe:world:b',
            relationType: 'Knows',
            description: 'Captured relation',
          },
          {
            targetEntityId: 'universe:world:SECRET-UNCAPTURED',
            relationType: 'SECRET TYPE',
            description: 'SECRET DESCRIPTION',
          },
        ],
      },
    },
    { details: 'á'.repeat(100000) },
  );
  const first = await read(source, { limit: 1 });
  assert.deepEqual(first.item.structured.relations, [
    {
      targetKey: target.sourceKey,
      title: 'Captured b',
      relationType: 'Knows',
      description: 'Captured relation',
    },
  ]);
  assert.equal(JSON.stringify(first).includes('SECRET'), false);
  await admin.doc('universes/world/lore/b').delete();
  await assert.rejects(
    read(source, { cursor: first.nextCursor }),
    (error) => error.details?.reason === 'cursor-invalidated',
  );
  assert.deepEqual((await read(source)).item.structured.relations, []);
  await admin.doc('universes/world').update({ authorId: 'other' });
  await assert.rejects(read(source), { code: 'not-found' });
  const result = await api.listCampaignBaseItems(uid, { campaignId, kind: 'lore', limit: 1 });
  assert.deepEqual(result.items, []);
  assert.ok(result.nextCursor);
});

test('SDK references expose captured target keys only, paginate and preserve unavailable sentinel without original IDs', async () => {
  const source = await item('arc', 'arc', {}, { objective: 'Arc' }),
    target = await item('event', 'event', {}, { description: 'Event' });
  await admin.doc(path + '/links/' + digest('one')).set({
    kind: 'narrative',
    sourceKey: source.sourceKey,
    reference: { kind: 'event', eventId: 'event' },
  });
  await admin.doc(path + '/links/' + digest('two')).set({
    kind: 'narrative',
    sourceKey: source.sourceKey,
    reference: { kind: 'event', eventId: 'SECRET-MISSING' },
  });
  const pages = [];
  let cursor = null;
  do {
    const result = await api.listCampaignBaseReferences(uid, {
      campaignId,
      sourceKey: source.sourceKey,
      limit: 1,
      cursor,
    });
    pages.push(...result.items);
    cursor = result.nextCursor;
  } while (cursor);
  assert.equal(pages.length, 2);
  assert.equal(pages.find((entry) => entry.available).targetKey, target.sourceKey);
  assert.equal(pages.find((entry) => !entry.available).targetKey, null);
  assert.equal(JSON.stringify(pages).includes('SECRET-MISSING'), false);
});

test('SDK captured image requires real typed pin and current auth before/after injected Storage I/O without binding library updateTime', async () => {
  const imageId = 'image',
    imageKey = baseImageKey(imageId),
    useKey = baseImageUseKey(baseId, imageId);
  await admin.doc(path + '/images/' + imageKey).set({
    imageKey,
    imageId,
    useKey,
    path: 'book-covers/owner/image.png',
    generation: '9007199254740993',
    state: 'ready',
  });
  await admin
    .doc('users/owner/imageLibrary/image')
    .set({ state: 'active', useCount: 1, path: 'book-covers/owner/image.png', updatedAt: 1 });
  const pin = admin.doc('users/owner/imageLibrary/image/uses/' + useKey);
  await pin.set({ kind: 'campaign-base', campaignId, baseId });
  const result = await api.readCampaignBaseImage(uid, { campaignId, imageKey });
  await admin.doc('users/owner/imageLibrary/image').update({ updatedAt: 900, useCount: 2 });
  assert.deepEqual(await api.readCampaignBaseImage(uid, { campaignId, imageKey }), result);
  let reads = 0;
  assets.readGeneration = async () => {
    reads++;
    await pin.delete();
    return Buffer.from('data');
  };
  await assert.rejects(api.readCampaignBaseImage(uid, { campaignId, imageKey }), {
    code: 'not-found',
  });
  assert.equal(reads, 1);
  await pin.set({ kind: 'campaign-base', campaignId, baseId });
  assets.metadata = async () => ({ generation: 'different', size: 4 });
  await assert.rejects(api.readCampaignBaseImage(uid, { campaignId, imageKey }), {
    code: 'failed-precondition',
  });
  assert.equal(reads, 1);
});
