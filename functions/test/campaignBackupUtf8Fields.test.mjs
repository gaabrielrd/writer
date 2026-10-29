import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createHash, sign } from 'node:crypto';
import { createCampaignBackupFileService } from '../src/campaignBackupFile.mjs';
import { createCampaignBackupAttestationService } from '../src/campaignBackupAttestation.mjs';
import { baseBodyKey, baseSourceKey } from '../src/campaignBaseContracts.mjs';
import { validateCampaignBackupFile } from '../src/campaignBackupFileValidation.mjs';
import { createCampaignBackupOriginReviewService } from '../src/campaignBackupOriginReview.mjs';
import { createCampaignBackupOwnSemanticsService } from '../src/campaignBackupOwnSemantics.mjs';
import { encodeCampaignBackup, decodeCampaignBackup } from '../src/campaignBackupContainer.mjs';
import { CAMPAIGN_ATTESTATION_DOMAIN } from '../src/portableCampaignManifest.mjs';
import { campaignFieldChunk, campaignFieldChunkCount } from '../src/campaignBackupTextChunks.mjs';
import { campaignFileUnit } from '../src/campaignBackupFileRecords.mjs';
import { backupLoreFixture, uid, entity, patch } from './helpers/campaignBackupLore.mjs';
import { campaignBackupLoreDb } from './helpers/campaignBackupLoreDb.mjs';
import { imageStorageFixture } from './helpers/campaignBackupImage.mjs';
const literal = '\ufeff  ' + '🐉á'.repeat(15000) + ' \n',
  json = (r) => JSON.parse(Buffer.from(r.payload).toString()),
  payload = (v) => Buffer.from(JSON.stringify(v));
async function fixture(long = true) {
  const media = await imageStorageFixture(),
    target = { kind: 'adventure', id: 'comparison-adventure-001' },
    f = await backupLoreFixture(
      long
        ? async (f) => {
            const current = await f.scenes.getScene(uid, { target, sceneId: f.scene.id });
            await f.scenes.updateScene(uid, {
              target,
              sceneId: f.scene.id,
              operationId: 'utf8-long-scene-operation',
              expectedRevision: current.revision,
              patch: { content: typeof long === 'string' ? long : literal },
            });
            await f.blocks.createAdventureBlock(uid, {
              adventureId: target.id,
              sceneId: f.scene.id,
              operationId: 'utf8-extra-block-operation',
              title: 'Additional',
              content: literal,
              audience: 'creator',
            });
            await f.universe.saveUniverseLore(uid, {
              universeId: 'world',
              id: 'hero',
              input: {
                name: 'Heroína',
                aliases: [],
                category: 'character',
                summary: 'Resumo',
                details: literal,
                structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
                relations: [],
                isPublic: false,
              },
            });
          }
        : undefined,
      campaignBackupLoreDb(),
      media.storage,
    );
  Object.assign(f, media);
  await f.save('utf8-variant-operation', 0, entity());
  f.expectedLore = (await f.db.doc('universes/world/lore/hero').get()).data().details;
  f.pair = generateKeyPairSync('ed25519');
  f.keys = [{ id: 'utf8-test-key', state: 'active', publicKey: f.pair.publicKey }];
  f.writer = createCampaignBackupFileService({
    db: f.db,
    storage: f.storage,
    keys: f.keys,
    keyId: f.keys[0].id,
    privateKey: f.pair.privateKey,
    now: () => 5000,
  });
  f.makeFile = async (options) => {
    const frames = [];
    f.packet = await f.writer.writeCampaignBackupFile(
      uid,
      { campaignId: f.id },
      {
        ...options,
        sink: {
          write: async (b) => frames.push(Buffer.from(b)),
          commit: async () => {},
          abort: async () => {
            frames.length = 0;
          },
        },
      },
    );
    return Buffer.concat(frames);
  };
  f.file = await f.makeFile();
  f.source = () => ({
    size: f.file.length,
    read: async (offset, length) => f.file.subarray(offset, offset + length),
  });
  f.validate = () => validateCampaignBackupFile(uid, f.source(), { keys: f.keys, now: () => 6000 });
  return f;
}
async function records(f) {
  const out = [];
  for await (const r of decodeCampaignBackup(f.source()))
    out.push({ ...r, payload: Buffer.from(r.payload) });
  return out;
}
async function recode(f, all) {
  const frames = [];
  for await (const r of encodeCampaignBackup(all)) frames.push(Buffer.from(r));
  f.file = Buffer.concat(frames);
}
function groups(all) {
  const out = [];
  for (let i = 0; i < all.length; i++)
    if (all[i].kind === 'unit') {
      const descriptor = json(all[i]),
        chunks = [];
      while (all[i + 1]?.kind === 'data') chunks.push(all[++i]);
      out.push({ descriptor, chunks });
    }
  return out;
}
async function legacy(f, provenanceVersion = 2) {
  const all = await records(f),
    header = json(all[0]),
    packet = json(all.at(-1));
  header.contentVersion = packet.manifest.contentVersion = 1;
  header.provenanceVersion = packet.manifest.provenanceVersion = provenanceVersion;
  if (provenanceVersion === 1)
    all.splice(
      all.findIndex((r) => r.kind === 'witness' && json(r)[0] === 'project'),
      1,
    );
  const content = createHash('sha256'),
    provenance = createHash('sha256');
  content.update(
    JSON.stringify([
      'writer-campaign-logical-units-v1',
      header.originCampaignId,
      header.availability,
    ]) + '\n',
  );
  provenance.update(
    JSON.stringify(['writer-campaign-witnesses-v' + provenanceVersion, header.originCampaignId]) +
      '\n',
  );
  let count = 0,
    bytes = 0;
  for (const r of all) {
    if (r.kind === 'unit') content.update(JSON.stringify(json(r)) + '\n');
    if (r.kind === 'witness') {
      r.id = String(count++);
      const v = json(r);
      provenance.update(JSON.stringify(v) + '\n');
      bytes += v[3] === null ? 0 : payload(v[3]).length;
    }
  }
  packet.manifest.content.digest = content.digest('hex');
  packet.manifest.provenance = { units: count, bytes, digest: provenance.digest('hex') };
  packet.attestation.signature = sign(
    null,
    Buffer.from(
      CAMPAIGN_ATTESTATION_DOMAIN +
        '\0' +
        JSON.stringify({
          schemaVersion: 1,
          algorithm: 'Ed25519',
          keyId: packet.attestation.keyId,
          manifest: packet.manifest,
        }),
    ),
    f.pair.privateKey,
  ).toString('base64url');
  all[0].payload = payload(header);
  all.at(-1).payload = payload(packet);
  await recode(f, all);
}
function index(own = false) {
  const rows = new Map(),
    byKey = new Map();
  return {
    write: async (r) => {
      rows.set(r.index, { ...r, payload: Buffer.from(r.payload) });
      if (own) byKey.set(JSON.stringify([r.family, r.id]), r.index);
    },
    seal: async () => {},
    read: async (start, count) => Array.from({ length: count }, (_, i) => rows.get(start + i)),
    lookup: async (family, id) => rows.get(byKey.get(JSON.stringify([family, id]))),
    dispose: async () => {
      rows.clear();
      byKey.clear();
    },
  };
}
test('native long scene, principal/additional blocks and lore/anchor export literal UTF8 into a real signed v2 file', async () => {
  const f = await fixture(),
    valid = await f.validate(),
    all = await records(f),
    entries = groups(all);
  assert.equal(valid.manifest.contentVersion, 2);
  assert.equal(valid.manifest.provenanceVersion, 2);
  assert.equal(f.packet.manifest.contentVersion, 2);
  let longFields = 0,
    empty = 0,
    variable = 0,
    anchors = 0;
  for (const { descriptor: d, chunks } of entries)
    if (['base:field', 'anchor:field'].includes(d.section)) {
      const bytes = Buffer.concat(chunks.map((r) => r.payload));
      assert.equal(bytes.length, d.byteLength);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), d.contentHash);
      if (bytes.length === 0) {
        empty++;
        assert.equal(chunks.length, 1);
      }
      if (bytes.length > 65536) {
        assert.equal(bytes.toString(), d.field === 'details' ? f.expectedLore : literal);
        longFields++;
        if (d.section === 'anchor:field') anchors++;
        assert.ok(chunks.length > 1);
        let previous;
        for (let i = 0; i < chunks.length; i++) {
          assert.ok(
            campaignFieldChunk(chunks[i].payload, i, chunks.length, bytes.length, previous),
          );
          if (i < chunks.length - 1 && chunks[i].payload.length < 65536) variable++;
          previous = chunks[i].payload.length;
        }
      }
    }
  assert.equal(longFields, 5);
  assert.ok(anchors >= 1);
  assert.ok(variable >= 1);
  assert.ok(empty > 0);
  assert.equal(
    (
      await createCampaignBackupOriginReviewService({
        db: f.db,
        keys: f.keys,
        now: () => 6000,
      }).reviewCampaignBackupOrigins(uid, f.source(), { index: index() })
    ).validation,
    'campaign-origin-review-only',
  );
  assert.equal(
    (
      await createCampaignBackupOwnSemanticsService({
        keys: f.keys,
        now: () => 6000,
      }).reviewCampaignBackupOwnContent(uid, f.source(), { index: index(true) })
    ).validation,
    'campaign-own-semantics-only',
  );
});
for (const provenance of [1, 2])
  test('real signed content v1 remains valid with provenance v' + provenance, async () => {
    const f = await fixture(false);
    await legacy(f, provenance);
    f.keys[0].state = 'verify-only';
    const valid = await f.validate();
    assert.equal(valid.manifest.contentVersion, 1);
    assert.equal(valid.manifest.provenanceVersion, provenance);
    assert.equal(
      (
        await createCampaignBackupOwnSemanticsService({
          keys: f.keys,
          now: () => 6000,
        }).reviewCampaignBackupOwnContent(uid, f.source(), { index: index(true) })
      ).own.organizationalUniverse,
      provenance === 1 ? 'unproven' : 'matched',
    );
  });
test('content v1 never silently accepts the new native variable chunk grammar', async () => {
  const f = await fixture();
  await legacy(f);
  await assert.rejects(f.validate());
});
test('reframing unchanged signed text with a split UTF8 character refuses although whole bytes and SHA stay identical', async () => {
  const f = await fixture(),
    all = await records(f),
    group = groups(all).find(
      (g) =>
        g.descriptor.section === 'base:field' &&
        g.chunks.length > 1 &&
        g.chunks[0].payload.length < 65536,
    ),
    first = group.chunks[0],
    next = group.chunks[1],
    before = Buffer.concat([first.payload, next.payload]);
  first.payload = Buffer.concat([first.payload, next.payload.subarray(0, 1)]);
  next.payload = next.payload.subarray(1);
  assert.deepEqual(Buffer.concat([first.payload, next.payload]), before);
  await recode(f, all);
  await assert.rejects(f.validate());
});
for (const mode of ['header-version', 'manifest-version', 'both-versions', 'unknown-version'])
  test('version-bound roots/signature reject reframed tampering: ' + mode, async () => {
    const f = await fixture(false),
      all = await records(f),
      header = json(all[0]),
      packet = json(all.at(-1));
    if (mode !== 'manifest-version') header.contentVersion = mode === 'unknown-version' ? 3 : 1;
    if (mode === 'manifest-version' || mode === 'both-versions') packet.manifest.contentVersion = 1;
    all[0].payload = payload(header);
    all.at(-1).payload = payload(packet);
    await recode(f, all);
    await assert.rejects(f.validate());
  });
for (const width of [1, 2, 3, 4])
  test(
    'native boundary validator handles ' +
      width +
      '-byte characters and rejects nonmaximal boundaries',
    () => {
      const character = ['a', 'á', '漢', '🐉'][width - 1],
        firstLength = width === 1 ? 65536 : 65537 - width,
        first = Buffer.alloc(firstLength, 97),
        next = Buffer.from(character),
        bytes = first.length + next.length;
      assert.ok(campaignFieldChunkCount(bytes, 2));
      assert.ok(campaignFieldChunk(first, 0, 2, bytes));
      assert.ok(campaignFieldChunk(next, 1, 2, bytes, first.length));
      if (width > 1)
        assert.equal(
          campaignFieldChunk(Buffer.from('a'), 1, 2, first.length + 1, first.length),
          false,
        );
    },
  );
test('field chunk validation refuses malformed UTF8, excess parts, empty middle/final, wrong bounds and missing predecessor', () => {
  assert.equal(campaignFieldChunkCount(0, 2), false);
  assert.equal(campaignFieldChunkCount(1, 0), false);
  assert.equal(campaignFieldChunkCount(Number.MAX_SAFE_INTEGER + 1, 1), false);
  assert.equal(campaignFieldChunk(Buffer.from([255]), 0, 1, 1), false);
  assert.equal(campaignFieldChunk(Buffer.from([0xed, 0xa0, 0x80]), 0, 1, 3), false);
  assert.equal(campaignFieldChunk(Buffer.alloc(0), 0, 2, 70000), false);
  assert.equal(campaignFieldChunk(Buffer.alloc(0), 1, 2, 70000, 65536), false);
  assert.equal(campaignFieldChunk(Buffer.alloc(65532, 97), 0, 2, 70000), false);
  assert.equal(campaignFieldChunk(Buffer.alloc(65537, 97), 0, 2, 70000), false);
  assert.equal(campaignFieldChunk(Buffer.from('tail'), 1, 2, 70000), false);
  assert.ok(campaignFieldChunk(Buffer.alloc(0), 0, 1, 0));
  assert.ok(campaignFieldChunk(Buffer.from('\ufeff  \u0000\n'), 0, 1, 7));
});
test('only frozen text sections allow variable chunk counts; JSON and images retain fixed sizes', () => {
  const d = {
    section: 'base:field',
    id: '1'.repeat(64),
    field: 'content',
    outcome: 'available',
    byteLength: 65536,
    chunkCount: 2,
    contentHash: '2'.repeat(64),
  };
  assert.equal(campaignFileUnit(d, 2).chunkCount, 2);
  assert.throws(() => campaignFileUnit(d, 1));
  for (const section of ['base:item', 'variant', 'own:note', 'image']) {
    const dto = {
      section,
      id: d.id,
      outcome: 'available',
      ...(section === 'image' ? { contentType: 'image/png' } : {}),
      byteLength: d.byteLength,
      chunkCount: 2,
      contentHash: d.contentHash,
    };
    assert.throws(() => campaignFileUnit(dto, 2));
  }
});
test('native source mutation during long-field publication aborts the file rather than signing mixed bytes', async () => {
  const f = await fixture();
  let changed = false;
  await assert.rejects(
    f.makeFile({
      onProgress: async (p) => {
        if (!changed && p.pass === 'capture' && p.stage === 'base:items') {
          changed = true;
          await patch(f, 'adventures/' + f.campaign.provenance.adventureId, { deleting: true });
        }
      },
    }),
  );
  assert.equal(changed, true);
});

test('retained legacy anchor preserves its long frozen lore after adoption and old-base removal', async () => {
  const f = await fixture(),
    oldBase = f.campaign.activeBaseId;
  await f.removeReferences();
  await f.adopt();
  assert.notEqual(f.campaign.activeBaseId, oldBase);
  f.file = await f.makeFile();
  const valid = await f.validate(),
    all = await records(f),
    anchor = groups(all).find(
      (g) => g.descriptor.section === 'anchor:field' && g.descriptor.field === 'details',
    );
  assert.equal(valid.manifest.contentVersion, 2);
  assert.equal(Buffer.concat(anchor.chunks.map((r) => r.payload)).toString(), f.expectedLore);
  await f.db.recursiveDelete(f.db.doc('users/' + uid + '/campaignBases/' + oldBase));
  assert.equal(
    (
      await createCampaignBackupOriginReviewService({
        db: f.db,
        keys: f.keys,
        now: () => 6000,
      }).reviewCampaignBackupOrigins(uid, f.source(), { index: index() })
    ).origins.unavailable,
    0,
  );
});

test('native boundary loss can require more chunks than fixed ceil and the signed descriptor preserves all three parts', async () => {
  const text = 'a'.repeat(65535) + '🐉' + 'a'.repeat(65533),
    f = await fixture(text),
    all = await records(f),
    hash = createHash('sha256').update(text).digest('hex'),
    fields = groups(all).filter(
      (g) => g.descriptor.section === 'base:field' && g.descriptor.contentHash === hash,
    );
  assert.equal(Buffer.byteLength(text), 131072);
  assert.equal(fields.length, 2);
  for (const field of fields) {
    assert.equal(field.descriptor.chunkCount, 3);
    assert.deepEqual(
      field.chunks.map((r) => r.payload.length),
      [65535, 65536, 1],
    );
    assert.equal(Buffer.concat(field.chunks.map((r) => r.payload)).toString(), text);
  }
  assert.equal((await f.validate()).manifest.contentVersion, 2);
  await legacy(f);
  await assert.rejects(f.validate());
});

test('metadata-only issuance also refuses nonmaximal native chunks with unchanged complete text and SHA', async () => {
  const text = 'a'.repeat(65535) + '🐉' + 'a'.repeat(65533),
    f = await fixture(text),
    key = baseSourceKey({
      adventureId: f.campaign.provenance.adventureId,
      kind: 'scene',
      id: f.scene.id,
    }),
    prefix = 'users/' + uid + '/campaignBases/' + f.campaign.activeBaseId + '/bodies/',
    paths = [0, 1, 2].map((i) => prefix + baseBodyKey(key, 'content', i)),
    chunks = paths.map((p) => f.records.get(p).content);
  const altered = [chunks[0].slice(0, -1), 'a' + chunks[1].slice(0, -1), 'a' + chunks[2]];
  assert.equal(altered.join(''), text);
  assert.ok(altered.every((s) => Buffer.byteLength(s) <= 65536));
  for (let i = 0; i < paths.length; i++) await patch(f, paths[i], { content: altered[i] });
  await assert.rejects(
    createCampaignBackupAttestationService({
      db: f.db,
      storage: f.storage,
      keys: f.keys,
      keyId: f.keys[0].id,
      privateKey: f.pair.privateKey,
      now: () => 5000,
    }).issueCampaignBackupAttestation(uid, { campaignId: f.id }),
    (e) => e.details?.reason === 'campaign-backup-base-inconsistent',
  );
});
