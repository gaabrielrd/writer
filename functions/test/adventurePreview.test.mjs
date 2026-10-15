import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { studioDb } from './helpers/studioDb.mjs';
import { createScenesService } from '../src/scenes.mjs';
import { createAdventureBlocksService } from '../src/adventureBlocks.mjs';
import {
  createAdventurePreviewService,
  deriveAdventurePreviewImage,
} from '../src/adventurePreview.mjs';
import {
  adventurePreviewHtml,
  previewImageKey,
  PREVIEW_BYTES,
  PREVIEW_IMAGE_BYTES,
} from '../src/adventurePreviewContracts.mjs';
import { createImageLibraryService } from '../src/imageLibrary.mjs';
import { createWorkHistoryService } from '../src/workHistory.mjs';
import { digest } from '../src/sceneContracts.mjs';

const target = { kind: 'adventure', id: 'adventure' },
  path = 'adventures/adventure',
  imageA = 'preview-image-00001',
  imageB = 'preview-image-00002',
  op = (name) => 'preview-operation-' + name.replaceAll(/[^a-zA-Z0-9-]/g, '-');
async function fixture(options = {}) {
  const f = studioDb(),
    documentReads = [],
    queryReads = [];
  const original = f.db.runTransaction;
  f.db.runTransaction = (operation) =>
    original((tx) =>
      operation({
        ...tx,
        get: async (ref) => {
          if (ref.collectionPath) queryReads.push(ref);
          else documentReads.push(ref.path);
          return tx.get(ref);
        },
      }),
    );
  f.records.set(path, {
    ownerId: 'author',
    title: 'PRIVATE ADVENTURE TITLE',
    createdAt: 1,
    updatedAt: 100,
  });
  f.records.set('users/author', { credits: 7 });
  for (const id of [imageA, imageB])
    f.records.set('users/author/imageLibrary/' + id, {
      state: 'active',
      useCount: 0,
      name: 'Ilustração',
      path: 'book-covers/author/' + id + '.png',
      url: 'https://storage.invalid/o/private?token=SECRET-TOKEN',
    });
  const scenes = createScenesService({ db: f.db, now: () => 200 }),
    group = await scenes.createSceneGroup('author', {
      target,
      operationId: op('group'),
      title: 'PRIVATE PART TITLE',
    }),
    scene = await scenes.createScene('author', {
      target,
      operationId: op('scene'),
      parentId: group.id,
      title: 'PRIVATE SCENE TITLE',
      content: 'MAIN SECRET',
      planning: { objective: 'PRIVATE PLANNING' },
    }),
    sceneId = scene.scene.id,
    api = createAdventureBlocksService({ db: f.db, now: () => 300 }),
    assets = { read: async () => Buffer.from('bytes'), remove: async () => {}, ...options.assets },
    preview = createAdventurePreviewService({
      db: f.db,
      assets,
      ...(options.deriveImage ? { deriveImage: options.deriveImage } : {}),
    });
  return {
    ...f,
    documentReads,
    queryReads,
    scenes,
    sceneId,
    api,
    preview,
    assets,
    library: createImageLibraryService({ db: f.db, assets }),
    history: createWorkHistoryService({ db: f.db, now: () => 400 }),
  };
}
const main = (f) => ({ kind: 'scene', id: f.sceneId });
const sceneRecord = (f) => f.records.get(path + '/scenes/' + f.sceneId);
const imageRecord = (f, id = imageA) => f.records.get('users/author/imageLibrary/' + id);
async function create(f, name, audience = 'creator', content = 'Texto adicional') {
  return f.api.createAdventureBlock('author', {
    adventureId: target.id,
    sceneId: f.sceneId,
    operationId: op(name),
    title: name,
    audience,
    content,
  });
}
async function set(f, resource, expectedRevision, name, imageId = imageA, fields = {}) {
  return f.api.setAdventureBlockImage('author', {
    adventureId: target.id,
    resource,
    expectedRevision,
    operationId: op(name),
    image: imageId
      ? { imageId, alt: 'Ilustração acessível', caption: 'Legenda permitida', ...fields }
      : null,
  });
}
const page = (f, audience, extras = {}) =>
  f.preview.readAdventureScenePreview('author', {
    adventureId: target.id,
    sceneId: f.sceneId,
    audience,
    ...extras,
  });

test('image set/swap/unlink/replay, archive and duplicate maintain one typed use per block without touching credits or covers', async () => {
  const f = await fixture(),
    a = await create(f, 'block', 'gm');
  const linked = await set(f, a.block.resource, 1, 'link');
  assert.equal(imageRecord(f).useCount, 1);
  assert.equal(linked.sceneWordCount, 4);
  assert.equal(linked.mainBodyHash, digest('MAIN SECRET'));
  assert.deepEqual(await set(f, a.block.resource, 1, 'link'), linked);
  const edited = await set(f, a.block.resource, 2, 'caption', imageA, { caption: 'Nova legenda' });
  assert.equal(imageRecord(f).useCount, 1);
  const image = await f.api.getAdventureBlockImage('author', {
    adventureId: target.id,
    resource: a.block.resource,
  });
  assert.deepEqual(image, {
    revision: 3,
    image: {
      imageId: imageA,
      name: 'Ilustração',
      alt: 'Ilustração acessível',
      caption: 'Nova legenda',
    },
  });
  assert.equal(JSON.stringify(image).includes('token'), false);
  const swapped = await set(f, a.block.resource, edited.block.revision, 'swap', imageB);
  assert.equal(imageRecord(f).useCount, 0);
  assert.equal(imageRecord(f, imageB).useCount, 1);
  const copy = await f.api.duplicateAdventureBlock('author', {
    adventureId: target.id,
    resource: a.block.resource,
    operationId: op('copy'),
    expectedRevision: swapped.block.revision,
  });
  assert.equal(copy.block.audience, 'gm');
  assert.equal(imageRecord(f, imageB).useCount, 2);
  await f.api.archiveAdventureBlock('author', {
    adventureId: target.id,
    blockId: copy.block.resource.id,
    operationId: op('archive'),
    expectedRevision: 1,
    archived: true,
  });
  assert.equal(imageRecord(f, imageB).useCount, 2);
  await assert.rejects(f.library.remove('author', { id: imageB }), { code: 'failed-precondition' });
  await f.api.deleteAdventureBlock('author', {
    adventureId: target.id,
    blockId: copy.block.resource.id,
    operationId: op('delete'),
    expectedRevision: 2,
  });
  assert.equal(imageRecord(f, imageB).useCount, 1);
  await set(f, a.block.resource, swapped.block.revision, 'unlink', null);
  assert.equal(imageRecord(f, imageB).useCount, 0);
  assert.equal(
    (
      await f.api.getAdventureBlockImage('author', {
        adventureId: target.id,
        resource: a.block.resource,
      })
    ).image,
    null,
  );
  const uses = [...f.records.entries()].filter(([key]) => key.includes('/uses/'));
  assert.equal(uses.length, 0);
  assert.equal(f.records.get('users/author').credits, 7);
});

test('principal image duplicates atomically, history preserves current illustration, and revoked/corrupt images fail without a partial copy', async () => {
  const f = await fixture(),
    linked = await set(f, main(f), 1, 'main-image');
  const initial = await f.history.getWorkVersionSource('author', { target, resource: main(f) });
  const version = await f.history.createWorkVersion('author', {
    target,
    resource: main(f),
    operationId: op('version'),
    expectedSourceToken: initial.sourceToken,
  });
  const copied = await f.api.duplicateAdventureBlock('author', {
    adventureId: target.id,
    resource: main(f),
    operationId: op('copy-main'),
    expectedRevision: linked.sceneRevision,
  });
  assert.equal(copied.block.audience, 'creator');
  assert.equal(imageRecord(f).useCount, 2);
  const changed = await f.scenes.updateScene('author', {
    target,
    sceneId: f.sceneId,
    expectedRevision: copied.sceneRevision,
    operationId: op('rewrite-main'),
    patch: { content: 'Outro texto' },
  });
  const swapped = await set(f, main(f), changed.scene.revision, 'swap-main', imageB);
  await f.history.restoreWorkVersion('author', {
    target,
    resource: main(f),
    versionId: version.version.id,
    operationId: op('restore-main'),
    expectedSourceToken: (
      await f.history.getWorkVersionSource('author', { target, resource: main(f) })
    ).sourceToken,
  });
  assert.equal(sceneRecord(f).mainBlockImage.imageId, imageB);
  assert.equal(imageRecord(f, imageB).useCount, 1);
  imageRecord(f, imageB).state = 'deleted';
  const before = structuredClone([...f.records]);
  await assert.rejects(
    f.api.duplicateAdventureBlock('author', {
      adventureId: target.id,
      resource: main(f),
      operationId: op('revoked-copy'),
      expectedRevision: sceneRecord(f).revision,
    }),
    { code: 'not-found' },
  );
  assert.deepEqual([...f.records], before);
  imageRecord(f, imageB).state = 'active';
  imageRecord(f, imageB).useCount = null;
  await assert.rejects(set(f, main(f), sceneRecord(f).revision, 'corrupt-unlink', null), {
    code: 'failed-precondition',
  });
  await assert.rejects(f.library.remove('author', { id: imageB }), { code: 'failed-precondition' });
  assert.ok(swapped.sceneWordCount > 0);
});

test('image input and owner/CAS validation reject forged authority, oversized metadata and cross-account images', async () => {
  const f = await fixture(),
    a = await create(f, 'block');
  await assert.rejects(
    set(f, a.block.resource, 0, 'stale'),
    (error) => error.details?.reason === 'revision-conflict',
  );
  await assert.rejects(
    set(f, a.block.resource, 1, 'url', imageA, { url: 'https://evil.invalid' }),
    { code: 'invalid-argument' },
  );
  await assert.rejects(set(f, a.block.resource, 1, 'alt', imageA, { alt: 'x'.repeat(1001) }), {
    code: 'invalid-argument',
  });
  await assert.rejects(
    set(f, a.block.resource, 1, 'caption-long', imageA, { caption: 'x'.repeat(4001) }),
    { code: 'invalid-argument' },
  );
  await assert.rejects(
    f.api.setAdventureBlockImage('other', {
      adventureId: target.id,
      resource: a.block.resource,
      operationId: op('other'),
      expectedRevision: 1,
      image: null,
    }),
    { code: 'not-found' },
  );
  f.records.delete('users/author/imageLibrary/' + imageA);
  f.records.set('users/other/imageLibrary/' + imageA, {
    state: 'active',
    useCount: 0,
    path: 'private-other',
  });
  await assert.rejects(set(f, a.block.resource, 1, 'foreign-image'), { code: 'not-found' });
  assert.equal(f.records.get(path + '/sceneBlocks/' + a.block.resource.id).revision, 1);
});

test('image and duplicate replays reauthorize active illustration without adding or removing uses', async () => {
  const f = await fixture(),
    a = await create(f, 'block');
  const linked = await set(f, a.block.resource, 1, 'link');
  imageRecord(f).state = 'deleted';
  await assert.rejects(set(f, a.block.resource, 1, 'link'), { code: 'not-found' });
  assert.equal(imageRecord(f).useCount, 1);
  imageRecord(f).state = 'active';
  const request = {
    adventureId: target.id,
    resource: a.block.resource,
    operationId: op('copy-replay'),
    expectedRevision: linked.block.revision,
  };
  const copied = await f.api.duplicateAdventureBlock('author', request);
  imageRecord(f).state = 'deleted';
  await assert.rejects(f.api.duplicateAdventureBlock('author', request), { code: 'not-found' });
  assert.equal(imageRecord(f).useCount, 2);
  imageRecord(f).state = 'active';
  assert.deepEqual(await f.api.duplicateAdventureBlock('author', request), copied);
  assert.equal(imageRecord(f).useCount, 2);
});

test('typed adventure use coexists with legacy cover usage and child text restoration preserves its current image', async () => {
  const f = await fixture(),
    legacyKey = 'book-cover-0000001';
  imageRecord(f).useCount = 1;
  f.records.set('users/author/imageLibrary/' + imageA + '/uses/' + legacyKey, {
    bookId: legacyKey,
  });
  const a = await create(f, 'child');
  const linked = await set(f, a.block.resource, 1, 'link-child');
  assert.equal(imageRecord(f).useCount, 2);
  const initial = await f.history.getWorkVersionSource('author', {
    target,
    resource: a.block.resource,
  });
  const captured = await f.history.createWorkVersion('author', {
    target,
    resource: a.block.resource,
    operationId: op('capture-child'),
    expectedSourceToken: initial.sourceToken,
  });
  const edited = await f.api.updateAdventureBlock('author', {
    adventureId: target.id,
    resource: a.block.resource,
    expectedRevision: linked.block.revision,
    operationId: op('child-content'),
    patch: { content: 'Mudou' },
  });
  await set(f, a.block.resource, edited.block.revision, 'new-child-image', imageB);
  await f.history.restoreWorkVersion('author', {
    target,
    resource: a.block.resource,
    versionId: captured.version.id,
    operationId: op('restore-child'),
    expectedSourceToken: (
      await f.history.getWorkVersionSource('author', { target, resource: a.block.resource })
    ).sourceToken,
  });
  assert.equal(
    (
      await f.api.getAdventureBlockImage('author', {
        adventureId: target.id,
        resource: a.block.resource,
      })
    ).image.imageId,
    imageB,
  );
  assert.equal(imageRecord(f).useCount, 1);
  assert.equal(imageRecord(f, imageB).useCount, 1);
  assert.deepEqual(f.records.get('users/author/imageLibrary/' + imageA + '/uses/' + legacyKey), {
    bookId: legacyKey,
  });
  await assert.rejects(f.library.remove('author', { id: imageA }), { code: 'failed-precondition' });
});

test('preview filters before bodies, uses only explicit public fields and rebuilds HTML without lore attributes, hidden markup or URLs', async () => {
  const f = await fixture();
  const gm = await create(f, 'GM SECRET', 'gm', 'MESTRE TEXTO');
  await create(f, 'AUTHOR SECRET', 'creator', 'AUTOR TEXTO');
  const players = await create(
    f,
    'Jogadores',
    'players',
    '<h2 onclick="evil()">Entrada</h2><p><span data-lore-id="PRIVATE LORE" data-entity="PRIVATE JSON">Nome literal</span><a href="https://private.invalid?token=SECRET-TOKEN">Link literal</a><strong>Ênfase</strong><img src="https://storage.invalid/secret"><script>PRIVATE SCRIPT</script><style>PRIVATE CSS</style><iframe>PRIVATE FRAME</iframe></p>',
  );
  await set(f, players.block.resource, 1, 'players-image');
  f.documentReads.length = 0;
  f.queryReads.length = 0;
  const result = await page(f, 'players');
  assert.equal(result.items.length, 1);
  assert.deepEqual(Object.keys(result).sort(), ['items', 'nextCursor', 'projectionToken']);
  assert.deepEqual(Object.keys(result.items[0]).sort(), [
    'html',
    'image',
    'key',
    'narrativeType',
    'title',
  ]);
  const encoded = JSON.stringify(result);
  for (const secret of [
    'PRIVATE',
    'AUTHOR SECRET',
    'GM SECRET',
    'MAIN SECRET',
    'AUTOR TEXTO',
    'MESTRE TEXTO',
    imageA,
    'storage.invalid',
    'https:',
    'data-lore',
    'onclick',
    'href=',
    'src=',
  ])
    assert.equal(encoded.includes(secret), false, secret);
  assert.ok(result.items[0].html.includes('<strong>Ênfase</strong>'));
  assert.ok(result.items[0].html.includes('Nome literal'));
  assert.equal(
    f.documentReads.some((key) => key.endsWith('/scenes/' + f.sceneId + '/body/current')),
    false,
  );
  assert.equal(
    f.documentReads.some((key) =>
      key.includes('/sceneBlocks/' + gm.block.resource.id + '/body/current'),
    ),
    false,
  );
  assert.ok(
    f.queryReads.every(
      (query) =>
        query.maximum === 26 &&
        query.filters.some(([key, value]) => key === 'audience' && value === 'players'),
    ),
  );
  assert.equal((await page(f, 'gm')).items.length, 2);
  const original = await page(f, 'creator');
  assert.equal(original.items.length, 4);
  assert.equal(original.items[0].title, 'Texto principal');
  assert.equal(original.items[0].html, 'MAIN SECRET');
  await assert.rejects(
    f.preview.readAdventureScenePreview('other', {
      adventureId: target.id,
      sceneId: f.sceneId,
      audience: 'creator',
    }),
    { code: 'not-found' },
  );
});

test('projected pagination keeps oversized next item for the next page and cursor carries only the last permitted item', async () => {
  const f = await fixture();
  const secret = await create(f, 'SECRET-BEFORE', 'creator', 'SECRET-BODY');
  const a = await create(f, 'A', 'players', '&'.repeat(800000));
  const b = await create(f, 'B', 'players', '&'.repeat(800000));
  const first = await page(f, 'players');
  assert.equal(first.items.length, 1);
  assert.ok(Buffer.byteLength(JSON.stringify(first)) <= PREVIEW_BYTES);
  const cursor = JSON.parse(Buffer.from(first.nextCursor, 'base64url').toString());
  assert.equal(cursor.id, a.block.resource.id);
  assert.equal(JSON.stringify(cursor).includes(secret.block.resource.id), false);
  const second = await page(f, 'players', { cursor: first.nextCursor });
  assert.equal(second.items.length, 1);
  assert.equal(second.items[0].title, 'B');
  assert.equal(second.nextCursor, null);
  assert.notEqual(first.items[0].key, second.items[0].key);
  const malformed = Buffer.from(JSON.stringify({ ...cursor, audience: 'creator' })).toString(
    'base64url',
  );
  await assert.rejects(page(f, 'players', { cursor: malformed }), { code: 'invalid-argument' });
  await assert.rejects(page(f, 'gm', { cursor: first.nextCursor }), { code: 'invalid-argument' });
  await f.api.updateAdventureBlock('author', {
    adventureId: target.id,
    resource: b.block.resource,
    expectedRevision: 1,
    operationId: op('body-changed'),
    patch: { content: 'Novo' },
  });
  await assert.rejects(page(f, 'players', { cursor: first.nextCursor }), {
    code: 'invalid-argument',
  });
});

test('safe HTML handles deep markup iteratively and preserves literal author text; first over-budget block fails without truncation', async () => {
  assert.equal(
    adventurePreviewHtml(
      '<p>&lt;script&gt; literal https://example.invalid</p><svg><text>hidden</text></svg>',
    ),
    '<p>&lt;script&gt; literal https://example.invalid</p>',
  );
  assert.equal(
    adventurePreviewHtml('<span>'.repeat(5000) + 'Texto' + '</span>'.repeat(5000)),
    'Texto',
  );
  const f = await fixture(),
    a = await create(f, 'Large', 'players', 'Texto');
  const content = '&'.repeat(1000000),
    metadata = f.records.get(path + '/sceneBlocks/' + a.block.resource.id);
  f.records.set(path + '/sceneBlocks/' + a.block.resource.id, {
    ...metadata,
    bodyHash: digest(content),
  });
  f.records.set(path + '/sceneBlocks/' + a.block.resource.id + '/body/current', {
    content,
    hash: digest(content),
  });
  await assert.rejects(page(f, 'players'), { code: 'failed-precondition' });
  assert.equal(
    f.records.get(path + '/sceneBlocks/' + a.block.resource.id + '/body/current').content,
    content,
  );
});

test('preview media is resized WebP without metadata and never returns storage paths, permanent URLs or image IDs', async () => {
  const original = await sharp({
    create: { width: 2000, height: 1500, channels: 3, background: '#123456' },
  })
    .withMetadata()
    .png()
    .toBuffer();
  const f = await fixture({
    assets: {
      read: async (key) => {
        assert.equal(key, 'book-covers/author/' + imageA + '.png');
        return original;
      },
    },
  });
  const a = await create(f, 'Image', 'players');
  await set(f, a.block.resource, 1, 'image');
  const result = await page(f, 'players'),
    request = {
      adventureId: target.id,
      sceneId: f.sceneId,
      audience: 'players',
      projectionToken: result.projectionToken,
      imageKey: result.items[0].image.imageKey,
    };
  const media = await f.preview.readAdventurePreviewImage('author', request);
  assert.deepEqual(Object.keys(media), ['dataUrl']);
  const bytes = Buffer.from(media.dataUrl.split(',')[1], 'base64'),
    metadata = await sharp(bytes).metadata();
  assert.equal(metadata.format, 'webp');
  assert.ok(metadata.width <= 1024 && metadata.height <= 1024);
  assert.equal(metadata.exif, undefined);
  assert.ok(bytes.length <= PREVIEW_IMAGE_BYTES);
  assert.equal(media.dataUrl.includes(imageA), false);
  assert.equal(imageRecord(f).useCount, 1);
  await assert.rejects(deriveAdventurePreviewImage(Buffer.from('invalid image')), {
    code: 'failed-precondition',
  });
  await assert.rejects(f.preview.readAdventurePreviewImage('other', request), {
    code: 'not-found',
  });
  const malformed = Buffer.from(
    JSON.stringify({
      version: 1,
      token: request.projectionToken,
      resource: a.block.resource,
      imageId: imageA,
    }),
  ).toString('base64url');
  await assert.rejects(
    f.preview.readAdventurePreviewImage('author', { ...request, imageKey: malformed }),
    { code: 'invalid-argument' },
  );
  await assert.rejects(
    f.preview.readAdventurePreviewImage('author', {
      ...request,
      imageKey: previewImageKey(request.projectionToken, main(f)),
    }),
    { code: 'not-found' },
  );
});

test('revocation or content changes during media I/O suppress all output, and derivation never returns a partial oversized data URL', async () => {
  const f = await fixture({
    assets: {
      read: async () => {
        imageRecord(f).state = 'deleted';
        return Buffer.from('bytes');
      },
    },
    deriveImage: async () => Buffer.from('webp'),
  });
  const a = await create(f, 'Image', 'players');
  await set(f, a.block.resource, 1, 'image');
  const result = await page(f, 'players'),
    request = {
      adventureId: target.id,
      sceneId: f.sceneId,
      audience: 'players',
      projectionToken: result.projectionToken,
      imageKey: result.items[0].image.imageKey,
    };
  await assert.rejects(f.preview.readAdventurePreviewImage('author', request), {
    code: 'not-found',
  });
  imageRecord(f).state = 'active';
  f.assets.read = async () => {
    await f.api.updateAdventureBlock('author', {
      adventureId: target.id,
      resource: a.block.resource,
      operationId: op('revoke-audience'),
      expectedRevision: 2,
      patch: { audience: 'creator' },
    });
    return Buffer.from('bytes');
  };
  await assert.rejects(f.preview.readAdventurePreviewImage('author', request), {
    code: 'failed-precondition',
  });
  const oversized = createAdventurePreviewService({
    db: f.db,
    assets: { read: async () => Buffer.from('x') },
    deriveImage: async () => Buffer.alloc(PREVIEW_IMAGE_BYTES + 1),
  });
  const original = await page(f, 'creator'),
    image = original.items.find((item) => item.image);
  await assert.rejects(
    oversized.readAdventurePreviewImage('author', {
      ...request,
      audience: 'creator',
      projectionToken: original.projectionToken,
      imageKey: image.image.imageKey,
    }),
    { code: 'failed-precondition' },
  );
});
