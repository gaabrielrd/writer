import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createHash, sign } from 'node:crypto';
import { encodeCampaignBackup, decodeCampaignBackup } from '../src/campaignBackupContainer.mjs';
import { validateCampaignBackupFile } from '../src/campaignBackupFileValidation.mjs';
import { CAMPAIGN_ATTESTATION_DOMAIN } from '../src/portableCampaignManifest.mjs';
import { createCampaignBackupWitnessService } from '../src/campaignBackupWitness.mjs';
import { createCampaignBackupFileService } from '../src/campaignBackupFile.mjs';
import { createCampaignBackupOriginReviewService } from '../src/campaignBackupOriginReview.mjs';
import {
  backupLoreFixture,
  uid,
  entity,
  heroKey,
  patch,
  remove,
} from './helpers/campaignBackupLore.mjs';
import { campaignBackupLoreDb } from './helpers/campaignBackupLoreDb.mjs';
import { imageStorageFixture } from './helpers/campaignBackupImage.mjs';
const changed = (e) => e.details?.reason === 'campaign-backup-origin-changed';
const indexBad = (e) => e.details?.reason === 'campaign-backup-origin-index-invalid';
function temporaryIndex() {
  const f = { rows: new Map(), sealed: 0, disposed: 0, reads: [], hooks: {} };
  f.port = {
    async write(row) {
      f.rows.set(row.index, { ...row, payload: Buffer.from(row.payload) });
      await f.hooks.write?.(row);
    },
    async seal() {
      f.sealed++;
      await f.hooks.seal?.();
    },
    async read(start, limit) {
      f.reads.push({ start, limit });
      await f.hooks.read?.(start, limit);
      return Array.from({ length: limit }, (_, i) => f.rows.get(start + i));
    },
    async dispose() {
      f.disposed++;
      await f.hooks.dispose?.();
      f.rows.clear();
    },
  };
  return f;
}
async function fixture(beforeCapture) {
  const media = await imageStorageFixture(),
    f = await backupLoreFixture(beforeCapture, campaignBackupLoreDb(), media.storage),
    pair = generateKeyPairSync('ed25519');
  Object.assign(f, media);
  f.signingPair = pair;
  await f.save('origin-review-variant', 0, entity());
  await f.refresh();
  f.keys = [{ id: 'origin-test-key', state: 'active', publicKey: pair.publicKey }];
  f.writer = createCampaignBackupFileService({
    db: f.db,
    storage: f.storage,
    keys: f.keys,
    keyId: 'origin-test-key',
    privateKey: pair.privateKey,
    now: () => 5000,
  });
  f.makeFile = async () => {
    const frames = [];
    await f.writer.writeCampaignBackupFile(
      uid,
      { campaignId: f.id },
      {
        sink: {
          write: async (b) => {
            frames.push(Buffer.from(b));
          },
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
  f.review = createCampaignBackupOriginReviewService({ db: f.db, keys: f.keys, now: () => 6000 });
  f.run = (index = temporaryIndex(), extra = {}) =>
    f.review.reviewCampaignBackupOrigins(uid, f.source(), { index: index.port, ...extra });
  f.metadataReads.length = 0;
  return f;
}
function noOriginReads(f) {
  assert.ok(
    f.metadataReads.every((r) => r.path === 'users/' + uid + '/campaignAuthorization/current'),
  );
}
test('authenticated file reviews all origins twice, without prose, writes or old campaign/base lookups', async () => {
  const f = await fixture(),
    index = temporaryIndex(),
    before = structuredClone([...f.records]),
    decisions = [];
  const forbidden = () => assert.fail('Origin review must not full-read or write');
  const db = {
    ...f.db,
    doc: (path) => {
      assert.ok(!path.startsWith('campaigns/') && !path.includes('/campaignBases/'));
      return f.db.doc(path);
    },
    runTransaction: (fn) =>
      f.db.runTransaction((tx) =>
        fn({
          ...tx,
          get: forbidden,
          set: forbidden,
          create: forbidden,
          update: forbidden,
          delete: forbidden,
          getAll: (ref, options) => {
            assert.ok(options.fieldMask.length);
            assert.ok(
              options.fieldMask.every(
                (k) => !['name', 'title', 'content', 'summary', 'details', 'body'].includes(k),
              ),
            );
            return tx.getAll(ref, options);
          },
        }),
      ),
  };
  const review = createCampaignBackupOriginReviewService({ db, keys: f.keys, now: () => 6000 }),
    result = await review.reviewCampaignBackupOrigins(uid, f.source(), {
      index: index.port,
      onDecision: (d) => decisions.push(d),
    });
  assert.equal(result.validation, 'campaign-origin-review-only');
  assert.equal(result.origins.unavailable, 0);
  assert.ok(result.origins.available > 1);
  assert.equal(decisions.length, result.origins.witnesses);
  assert.ok(decisions.every(Object.isFrozen));
  assert.ok(index.reads.every((r) => r.limit <= 25));
  assert.equal(index.sealed, 1);
  assert.equal(index.disposed, 1);
  assert.equal(index.rows.size, 0);
  assert.deepEqual([...f.records], before);
  const out = JSON.stringify({ result, decisions });
  for (const text of [
    'Heroína',
    'Guardião',
    'book-covers/',
    'PRIVATE',
    'adventureToken',
    'keyBase64',
  ])
    assert.equal(out.includes(text), false);
});
test('deleting campaign/bases does not prevent same-incarnation origin review', async () => {
  const f = await fixture();
  await f.db.recursiveDelete(f.db.doc('campaigns/' + f.id));
  for (const [path] of [...f.records])
    if (path.startsWith('users/' + uid + '/campaignBases/')) f.records.delete(path);
  f.metadataReads.length = 0;
  const r = await f.run();
  assert.equal(r.origins.unavailable, 0);
  assert.ok(
    f.metadataReads.every(
      (r) => !r.path.startsWith('campaigns/') && !r.path.includes('/campaignBases/'),
    ),
  );
});
for (const kind of ['adventure', 'universe', 'ficha'])
  test('recreated ' + kind + ' under the same ID cannot inherit an old witness', async () => {
    const f = await fixture(),
      path =
        kind === 'adventure'
          ? 'adventures/' + f.campaign.provenance.adventureId
          : kind === 'universe'
            ? 'universes/world'
            : 'universes/world/lore/hero',
      value = f.records.get(path);
    await remove(f, path);
    await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), value));
    const decisions = [],
      r = await f.run(temporaryIndex(), { onDecision: (d) => decisions.push(d) });
    assert.ok(r.origins.unavailable > 0);
    if (kind === 'adventure') assert.equal(r.origins.available, 0);
    else {
      assert.ok(r.origins.available > 0);
      assert.ok(
        decisions.filter((d) => d.id === heroKey).every((d) => d.availability === 'unavailable'),
      );
    }
  });
test('removed universe revokes global lore while adventure material stays available and child fichas are not probed', async () => {
  const f = await fixture();
  await remove(f, 'universes/world');
  f.metadataReads.length = 0;
  const r = await f.run();
  assert.ok(r.origins.globalUnavailable > 0);
  assert.ok(r.origins.available > 0);
  assert.ok(r.origins.unavailable > 0);
  assert.equal(
    f.metadataReads.some((r) => r.path.startsWith('universes/world/lore/')),
    false,
  );
});
test('permanent adventure reservation denies derivatives even when the root still exists and is active', async () => {
  const f = await fixture(),
    id = f.campaign.provenance.adventureId;
  await f.db.runTransaction(async (tx) =>
    tx.create(f.db.doc('adventureDeletionReservations/' + id), {
      schemaVersion: 1,
      ownerId: uid,
      adventureId: id,
      adventureToken: '1'.repeat(64),
      deletionId: 'origin-deletion-operation',
      state: 'deleted',
      createdAt: 100,
      updatedAt: 101,
    }),
  );
  const r = await f.run();
  assert.equal(r.origins.available, 0);
  assert.ok(r.origins.unavailable > 0);
});
test('retained legacy uses its own old source birth after active-base adoption', async () => {
  const f = await fixture();
  await f.removeReferences();
  await f.adopt();
  f.file = await f.makeFile();
  const r = await f.run();
  assert.equal(r.origins.unavailable, 0);
});
test('exported unavailable origins stay unavailable without probing a newly recreated origin', async () => {
  const f = await fixture(),
    id = f.campaign.provenance.adventureId;
  await patch(f, 'adventures/' + id, { deleting: true });
  f.file = await f.makeFile();
  f.metadataReads.length = 0;
  const r = await f.run();
  assert.ok(r.origins.unavailable > 0);
  assert.equal(r.origins.available, 0);
  assert.ok(f.metadataReads.every((r) => !r.path.startsWith('adventures/')));
  assert.equal(r.origins.organizationalUniverse.availability, 'available');
});
test('invalid signature, wrong account and corrupt footer cause no origin or clock reads and dispose the provisional index', async () => {
  for (const mode of ['signature', 'account', 'footer']) {
    const f = await fixture(),
      index = temporaryIndex();
    if (mode === 'signature') f.keys[0].state = 'revoked';
    if (mode === 'footer') f.file[f.file.length - 1] ^= 1;
    await assert.rejects(
      f.review.reviewCampaignBackupOrigins(mode === 'account' ? 'other' : uid, f.source(), {
        index: index.port,
      }),
    );
    assert.equal(f.metadataReads.length, 0);
    assert.equal(index.sealed, 0);
    assert.equal(index.disposed, 1);
  }
});
for (const mode of ['payload', 'tag', 'ordinal', 'missing', 'foreign-run'])
  test('index ' + mode + ' alteration is rejected before any origin lookup', async () => {
    const f = await fixture(),
      index = temporaryIndex();
    let old;
    if (mode === 'foreign-run') {
      const previous = temporaryIndex();
      previous.hooks.dispose = () => {
        old = structuredClone(previous.rows.get(0));
      };
      await f.run(previous);
    }
    f.metadataReads.length = 0;
    index.hooks.seal = () => {
      const row = index.rows.get(0);
      if (mode === 'payload') row.payload = Buffer.concat([row.payload, Buffer.from(' ')]);
      if (mode === 'tag') row.tag = '0'.repeat(64);
      if (mode === 'ordinal') row.index = 1;
      if (mode === 'missing') index.rows.delete(0);
      if (mode === 'foreign-run') index.rows.set(0, old);
    };
    await assert.rejects(f.run(index), indexBad);
    noOriginReads(f);
    assert.equal(index.disposed, 1);
  });
test('source mutation after validation cannot replace the already authenticated index', async () => {
  const f = await fixture(),
    index = temporaryIndex();
  let modified = false;
  index.hooks.seal = () => {
    f.file.fill(0);
    modified = true;
  };
  const r = await f.run(index);
  assert.equal(modified, true);
  assert.equal(r.origins.unavailable, 0);
  assert.match(r.archive.chainHash, /^[a-f0-9]{64}$/);
});
test('native source mutation after the first authorization pass withholds final review proof', async () => {
  const f = await fixture();
  let changedSource = false;
  await assert.rejects(
    f.run(temporaryIndex(), {
      onProgress: async (p) => {
        if (
          !changedSource &&
          p.phase === 'origins' &&
          p.pass === 'capture' &&
          p.processed === p.total
        ) {
          changedSource = true;
          await patch(f, 'adventures/' + f.campaign.provenance.adventureId, { deleting: true });
        }
      },
    }),
    changed,
  );
  assert.equal(changedSource, true);
});
test('global authorization clock changes are detected even when the origin rows stay untouched', async () => {
  const f = await fixture();
  let bumped = false;
  await assert.rejects(
    f.run(temporaryIndex(), {
      onDecision: async () => {
        if (!bumped) {
          bumped = true;
          const { prepareCampaignAuthorization } = await import('../src/campaignAuthorization.mjs');
          await f.db.runTransaction(async (tx) =>
            (await prepareCampaignAuthorization(tx, f.db, uid, { bump: true })).commit(),
          );
        }
      },
    }),
    changed,
  );
});
test('registry revocation during origin reads invalidates the final cryptographic context', async () => {
  const f = await fixture();
  let revoked = false;
  await assert.rejects(
    f.run(temporaryIndex(), {
      onDecision: () => {
        if (!revoked) {
          revoked = true;
          f.keys[0].state = 'revoked';
        }
      },
    }),
    (e) => e.details?.reason === 'campaign-backup-invalid-attestation',
  );
});
test('page payloads are detached before DB awaits; later index mutation cannot redirect a query', async () => {
  const f = await fixture(),
    index = temporaryIndex();
  let changedIndex = false;
  await assert.rejects(
    f.run(index, {
      onDecision: () => {
        if (!changedIndex) {
          changedIndex = true;
          const row = index.rows.get(1),
            v = JSON.parse(row.payload);
          if (v[3]?.origin?.scopeId) v[3].origin.scopeId = 'foreign-world';
          else v[3].baseId = '0'.repeat(64);
          row.payload = Buffer.from(JSON.stringify(v));
        }
      },
    }),
    indexBad,
  );
  assert.equal(
    f.metadataReads.some((r) => r.path.includes('foreign-world')),
    false,
  );
});
test('abort during integrity or origin review disposes the temporary index without a proof', async () => {
  for (const phase of ['integrity', 'origins']) {
    const f = await fixture(),
      index = temporaryIndex(),
      controller = new AbortController();
    await assert.rejects(
      f.run(index, {
        signal: controller.signal,
        onProgress: (p) => {
          if (p.phase === phase) controller.abort();
        },
      }),
      (e) => e.name === 'AbortError',
    );
    assert.equal(index.disposed, 1);
    if (phase === 'integrity') assert.equal(f.metadataReads.length, 0);
  }
});

test('pagination authenticates and authorizes every witness across 25-row boundaries', async () => {
  const f = await fixture(async ({ scenes }) => {
      for (let i = 0; i < 14; i++)
        await scenes.createScene(uid, {
          target: { kind: 'adventure', id: 'comparison-adventure-001' },
          operationId: 'origin-page-scene-' + String(i).padStart(3, '0'),
          title: 'Cena ' + i,
          parentId: null,
          content: '<p>Planejamento</p>',
        });
    }),
    index = temporaryIndex(),
    r = await f.run(index);
  assert.ok(r.origins.witnesses > 25);
  assert.equal(r.origins.unavailable, 0);
  assert.deepEqual(
    index.reads.map((p) => p.start),
    [0, 25, 0, 25],
  );
  assert.ok(index.reads.every((p) => p.limit <= 25));
});
test('same-value authorization clock recreation cannot reset its native identity', async () => {
  const f = await fixture(),
    path = 'users/' + uid + '/campaignAuthorization/current',
    old = f.records.get(path);
  assert.ok(old);
  let reset = false;
  await assert.rejects(
    f.run(temporaryIndex(), {
      onDecision: async () => {
        if (!reset) {
          reset = true;
          await remove(f, path);
          await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), old));
        }
      },
    }),
    changed,
  );
});
test('native local lore requires its original birth and current adventure token', async () => {
  const localId = 'origin-local-ficha',
    f = await fixture(async ({ db, scenes, scene }) => {
      const { createAdventureLoreService } = await import('../src/adventureLore.mjs'),
        api = createAdventureLoreService({ db }),
        adventureId = 'comparison-adventure-001',
        scope = await api.listAdventureLore(uid, { adventureId, scope: 'adventure' });
      await api.saveAdventureLore(uid, {
        adventureId,
        adventureToken: scope.adventureToken,
        entityId: localId,
        operationId: localId,
        expectedRevision: 0,
        expectedCollectionRevision: 0,
        entity: { ...entity(), isPublic: false },
      });
      const target = { kind: 'adventure', id: adventureId };
      await scenes.setSceneReference(uid, {
        target,
        sceneId: scene.id,
        operationId: 'origin-local-reference',
        expectedRevision: (await scenes.getScene(uid, { target, sceneId: scene.id })).revision,
        reference: { kind: 'adventure', scopeId: adventureId, entityId: localId },
      });
    }),
    { baseSourceKey } = await import('../src/campaignBaseContracts.mjs'),
    key = baseSourceKey({
      kind: 'adventure-lore',
      adventureId: f.campaign.provenance.adventureId,
      id: localId,
    }),
    path = 'adventures/' + f.campaign.provenance.adventureId + '/lore/' + localId,
    old = f.records.get(path);
  async function decision() {
    const seen = [];
    await f.run(temporaryIndex(), {
      onDecision: (d) => {
        if (d.id === key) seen.push(d);
      },
    });
    return seen[0];
  }
  assert.equal((await decision()).availability, 'available');
  await patch(f, path, { adventureToken: '0'.repeat(64) });
  assert.equal((await decision()).availability, 'unavailable');
  await remove(f, path);
  await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), old));
  assert.equal((await decision()).availability, 'unavailable');
});
test('retired verification keys preserve access review and prose edits before review do not recapture old text', async () => {
  const f = await fixture();
  f.keys[0].state = 'verify-only';
  await patch(f, 'universes/world/lore/hero', { details: 'New private text' });
  const r = await f.run();
  assert.equal(r.origins.unavailable, 0);
  assert.equal(
    f.metadataReads.some((r) => r.fields.includes('details')),
    false,
  );
});
for (const kind of ['adventure', 'universe'])
  test(
    'changed ' + kind + ' ownership does not become authorized through a signed private file',
    async () => {
      const f = await fixture();
      await patch(
        f,
        kind === 'adventure'
          ? 'adventures/' + f.campaign.provenance.adventureId
          : 'universes/world',
        kind === 'adventure' ? { ownerId: 'other' } : { authorId: 'other', isPublic: true },
      );
      const r = await f.run();
      assert.ok(r.origins.unavailable > 0);
      if (kind === 'adventure') assert.equal(r.origins.available, 0);
      else assert.ok(r.origins.available > 0);
    },
  );
for (const phase of ['write', 'seal', 'read'])
  test(
    'temporary index ' + phase + ' failure always disposes the index and cannot produce a review',
    async () => {
      const f = await fixture(),
        index = temporaryIndex();
      index.hooks[phase] = () => {
        throw new Error('index ' + phase + ' error');
      };
      await assert.rejects(f.run(index), new RegExp('index ' + phase + ' error'));
      assert.equal(index.disposed, 1);
      if (phase !== 'read') assert.equal(f.metadataReads.length, 0);
      else noOriginReads(f);
    },
  );
test('sparse index pages cannot hide missing entries from pre-query authentication', async () => {
  const f = await fixture(),
    index = temporaryIndex(),
    read = index.port.read;
  index.port.read = async (...args) => {
    const page = await read(...args);
    delete page[page.length - 1];
    return page;
  };
  await assert.rejects(f.run(index), indexBad);
  noOriginReads(f);
});
test('custom array iteration cannot hide witness positions or return an incomplete successful review', async () => {
  const f = await fixture(),
    index = temporaryIndex(),
    read = index.port.read;
  index.port.read = async (...args) => {
    const page = await read(...args);
    page[Symbol.iterator] = function* () {
      yield page[0];
    };
    return page;
  };
  const r = await f.run(index);
  assert.equal(r.origins.witnesses, r.manifest.provenance.units);
  assert.ok(r.origins.witnesses > 1);
});

test('index methods are captured before awaits and final disposal cannot be replaced mid-review', async () => {
  const f = await fixture(),
    index = temporaryIndex();
  let replaced = false;
  const result = await f.run(index, {
    onDecision: () => {
      if (!replaced) {
        replaced = true;
        for (const method of ['read', 'dispose'])
          index.port[method] = () => {
            throw new Error('late replacement');
          };
      }
    },
  });
  assert.equal(result.origins.unavailable, 0);
  assert.equal(index.disposed, 1);
});
test('malformed native versions or a port without masks cannot yield origin approval', async () => {
  for (const [path, change] of [
    ['adventures/comparison-adventure-001', { loreVersion: -1 }],
    ['universes/world', { privacyVersion: 0.5 }],
  ]) {
    const f = await fixture();
    await patch(f, path, change);
    await assert.rejects(
      f.run(),
      (e) => e.details?.reason === 'campaign-backup-origin-inconsistent',
    );
  }
  const f = await fixture(),
    index = temporaryIndex(),
    db = {
      ...f.db,
      runTransaction: (fn) => f.db.runTransaction((tx) => fn({ ...tx, getAll: undefined })),
    },
    review = createCampaignBackupOriginReviewService({ db, keys: f.keys, now: () => 6000 });
  await assert.rejects(
    review.reviewCampaignBackupOrigins(uid, f.source(), { index: index.port }),
    (e) => e.details?.reason === 'campaign-backup-origin-inconsistent',
  );
  assert.equal(index.disposed, 1);
});

test('independent empty backup preserves an absent authorization clock and has no unavailable origin', async () => {
  const { createStudioService } = await import('../src/studio.mjs'),
    data = campaignBackupLoreDb(),
    id = 'origin-independent-campaign',
    pair = generateKeyPairSync('ed25519'),
    keys = [{ id: 'origin-empty-key', state: 'active', publicKey: pair.publicKey }],
    frames = [];
  await createStudioService({ db: data.db }).createCampaign(uid, {
    operationId: id,
    title: 'Empty',
  });
  await createCampaignBackupFileService({
    db: data.db,
    storage: {},
    keys,
    keyId: 'origin-empty-key',
    privateKey: pair.privateKey,
    now: () => 1000,
  }).writeCampaignBackupFile(
    uid,
    { campaignId: id },
    {
      sink: {
        write: async (b) => {
          frames.push(Buffer.from(b));
        },
        commit: async () => {},
        abort: async () => {
          frames.length = 0;
        },
      },
    },
  );
  const file = Buffer.concat(frames),
    index = temporaryIndex(),
    before = structuredClone([...data.records]),
    result = await createCampaignBackupOriginReviewService({
      db: data.db,
      keys,
      now: () => 2000,
    }).reviewCampaignBackupOrigins(
      uid,
      { size: file.length, read: async (offset, length) => file.subarray(offset, offset + length) },
      { index: index.port },
    );
  assert.equal(result.origins.none, 1);
  assert.equal(result.origins.available, 0);
  assert.equal(result.origins.unavailable, 0);
  assert.deepEqual([...data.records], before);
  assert.equal(data.records.has('users/' + uid + '/campaignAuthorization/current'), false);
  assert.equal(index.disposed, 1);
});

async function organizationalWorld(f, id = 'organizational-world') {
  await f.db.runTransaction(async (tx) =>
    tx.create(f.db.doc('universes/' + id), { authorId: uid, deleting: false }),
  );
  await patch(f, f.path, { universeId: id });
  await f.refresh();
  f.file = await f.makeFile();
  return id;
}
async function rewriteOrganizationalFile(f, mutate, alterPacket) {
  const records = [];
  for await (const r of decodeCampaignBackup(f.source()))
    records.push({ ...r, payload: Buffer.from(r.payload) });
  const header = JSON.parse(records[0].payload),
    packet = JSON.parse(records.at(-1).payload);
  mutate(records, header, packet);
  records[0].payload = Buffer.from(JSON.stringify(header));
  const root = createHash('sha256');
  root.update(
    JSON.stringify([
      'writer-campaign-witnesses-v' + header.provenanceVersion,
      header.originCampaignId,
    ]) + '\n',
  );
  let count = 0,
    bytes = 0;
  for (const r of records)
    if (r.kind === 'witness') {
      r.id = String(count++);
      const value = JSON.parse(r.payload);
      root.update(JSON.stringify(value) + '\n');
      bytes += value[3] === null ? 0 : Buffer.byteLength(JSON.stringify(value[3]));
    }
  packet.manifest.provenanceVersion = header.provenanceVersion;
  packet.manifest.provenance = { units: count, bytes, digest: root.digest('hex') };
  alterPacket?.(packet);
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
    f.signingPair.privateKey,
  ).toString('base64url');
  records.at(-1).payload = Buffer.from(JSON.stringify(packet));
  const frames = [];
  for await (const frame of encodeCampaignBackup(records)) frames.push(Buffer.from(frame));
  f.file = Buffer.concat(frames);
}
test('organizational universe is a separate signed birth witness, independent of the captured base universe', async () => {
  const f = await fixture(),
    id = await organizationalWorld(f),
    decisions = [];
  const witness = await createCampaignBackupWitnessService({
    db: f.db,
  }).getCampaignBackupProjectWitness(uid, f.anchor);
  assert.equal(witness.content.kind, 'project');
  assert.equal(witness.content.universe.id, id);
  const world = await f.db.doc('universes/' + id).get();
  assert.deepEqual(witness.content.universe.born, {
    seconds: world.createTime.seconds,
    nanoseconds: world.createTime.nanoseconds,
  });
  assert.ok(Object.isFrozen(witness.content.universe.born));
  await patch(f, 'universes/world', { deleting: true });
  const result = await f.run(temporaryIndex(), { onDecision: (d) => decisions.push(d) });
  assert.equal(result.manifest.provenanceVersion, 2);
  assert.deepEqual(result.origins.organizationalUniverse, { availability: 'available', id });
  assert.equal(decisions[0].section, 'project');
  assert.equal(decisions[0].id, f.id);
  assert.ok(result.origins.globalUnavailable > 0);
  assert.equal(result.origins.derivedWitnesses + 1, result.origins.witnesses);
});
for (const mode of ['missing', 'recreated', 'owner', 'deleting'])
  test(
    'organizational universe ' + mode + ' cannot inherit access from the base universe',
    async () => {
      const f = await fixture(),
        id = await organizationalWorld(f),
        path = 'universes/' + id,
        value = f.records.get(path);
      if (['missing', 'recreated'].includes(mode)) await remove(f, path);
      if (mode === 'recreated')
        await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), value));
      if (mode === 'owner') await patch(f, path, { authorId: 'other-author' });
      if (mode === 'deleting') await patch(f, path, { deleting: true });
      const result = await f.run();
      assert.deepEqual(result.origins.organizationalUniverse, { availability: 'unavailable', id });
      assert.equal(result.origins.unavailable, 0);
      assert.ok(result.origins.available > 0);
    },
  );
test('organizational universe unavailable at export is not probed or revived later; own file remains valid', async () => {
  const f = await fixture(),
    id = await organizationalWorld(f),
    path = 'universes/' + id,
    value = f.records.get(path);
  await remove(f, path);
  await f.refresh();
  f.file = await f.makeFile();
  await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), value));
  f.metadataReads.length = 0;
  const result = await f.run();
  assert.equal(result.origins.organizationalUniverse.availability, 'unavailable');
  assert.equal(
    f.metadataReads.some((r) => r.path === path),
    false,
  );
  assert.ok(result.manifest.content.bytes > 0);
});
test('organizational link remains available when the captured adventure is no longer authorized', async () => {
  const f = await fixture(),
    id = await organizationalWorld(f);
  await patch(f, 'adventures/' + f.campaign.provenance.adventureId, { deleting: true });
  f.file = await f.makeFile();
  const result = await f.run();
  assert.equal(result.manifest.availability, 'unavailable');
  assert.deepEqual(result.origins.organizationalUniverse, { availability: 'available', id });
  assert.equal(result.origins.available, 0);
});
test('organizational universe changes between native audit passes withhold the signature and abort output', async () => {
  const f = await fixture(),
    id = await organizationalWorld(f),
    frames = [];
  let changed = false,
    aborted = 0;
  await assert.rejects(
    f.writer.writeCampaignBackupFile(
      uid,
      { campaignId: f.id },
      {
        sink: {
          write: async (b) => frames.push(Buffer.from(b)),
          commit: async () => assert.fail('changed source must not commit'),
          abort: async () => {
            aborted++;
            frames.length = 0;
          },
        },
        onProgress: async (p) => {
          if (!changed && p.pass === 'capture' && p.stage === 'base:snapshot') {
            changed = true;
            await patch(f, 'universes/' + id, { deleting: true });
          }
        },
      },
    ),
  );
  assert.equal(changed, true);
  assert.equal(aborted, 1);
  assert.equal(frames.length, 0);
});
test('organizational universe changes between authorization passes withhold final review', async () => {
  const f = await fixture(),
    id = await organizationalWorld(f);
  let changedWorld = false;
  await assert.rejects(
    f.run(temporaryIndex(), {
      onProgress: async (p) => {
        if (
          !changedWorld &&
          p.phase === 'origins' &&
          p.pass === 'capture' &&
          p.processed === p.total
        ) {
          changedWorld = true;
          await patch(f, 'universes/' + id, { deleting: true });
        }
      },
    }),
    changed,
  );
  assert.equal(changedWorld, true);
});
test('organizational legacy v1 file verifies its real signature but returns unproven without borrowing the base world', async () => {
  const f = await fixture(),
    id = await organizationalWorld(f);
  await rewriteOrganizationalFile(f, (records, header) => {
    header.provenanceVersion = 1;
    const i = records.findIndex(
      (r) => r.kind === 'witness' && JSON.parse(r.payload)[0] === 'project',
    );
    records.splice(i, 1);
  });
  f.metadataReads.length = 0;
  const proof = await validateCampaignBackupFile(uid, f.source(), {
    keys: f.keys,
    now: () => 6000,
  });
  assert.equal(proof.manifest.provenanceVersion, 1);
  const result = await f.run();
  assert.deepEqual(result.origins.organizationalUniverse, { availability: 'unproven' });
  assert.ok(result.origins.available > 0);
  assert.equal(
    f.metadataReads.some((r) => r.path === 'universes/' + id),
    false,
  );
});
for (const mode of [
  'missing',
  'duplicate',
  'foreign',
  'late',
  'v1-with-project',
  'unknown-version',
  'manifest-version',
])
  test(
    'organizational signed malformed ' + mode + ' file refuses before any origin query',
    async () => {
      const f = await fixture();
      await rewriteOrganizationalFile(
        f,
        (records, header) => {
          const i = records.findIndex(
            (r) => r.kind === 'witness' && JSON.parse(r.payload)[0] === 'project',
          );
          if (mode === 'missing') records.splice(i, 1);
          if (mode === 'duplicate')
            records.splice(i, 0, { ...records[i], payload: Buffer.from(records[i].payload) });
          if (mode === 'foreign') {
            const value = JSON.parse(records[i].payload);
            value[1] = value[3].campaignId = 'foreign-campaign';
            records[i].payload = Buffer.from(JSON.stringify(value));
          }
          if (mode === 'late') {
            const project = records.splice(i, 1)[0],
              b = records.findIndex((r) => r.kind === 'witness');
            records.splice(b + 1, 0, project);
          }
          if (mode === 'v1-with-project') header.provenanceVersion = 1;
          if (mode === 'unknown-version') header.provenanceVersion = 3;
        },
        mode === 'manifest-version'
          ? (p) => {
              p.manifest.provenanceVersion = 1;
            }
          : undefined,
      );
      f.metadataReads.length = 0;
      const index = temporaryIndex();
      await assert.rejects(f.run(index));
      assert.equal(f.metadataReads.length, 0);
      assert.equal(index.disposed, 1);
    },
  );
test('organizational universe of an independent campaign is preserved without requiring an adventure', async () => {
  const { createStudioService } = await import('../src/studio.mjs'),
    data = campaignBackupLoreDb(),
    pair = generateKeyPairSync('ed25519'),
    id = 'independent-world-campaign',
    worldId = 'independent-world',
    keys = [{ id: 'independent-world-key', state: 'active', publicKey: pair.publicKey }],
    frames = [];
  await data.db.runTransaction(async (tx) =>
    tx.create(data.db.doc('universes/' + worldId), { authorId: uid }),
  );
  await createStudioService({ db: data.db }).createCampaign(uid, {
    operationId: id,
    title: 'Own campaign',
    universeId: worldId,
  });
  await createCampaignBackupFileService({
    db: data.db,
    storage: {},
    keys,
    keyId: keys[0].id,
    privateKey: pair.privateKey,
    now: () => 1000,
  }).writeCampaignBackupFile(
    uid,
    { campaignId: id },
    {
      sink: {
        write: async (b) => frames.push(Buffer.from(b)),
        commit: async () => {},
        abort: async () => {},
      },
    },
  );
  const file = Buffer.concat(frames),
    before = structuredClone([...data.records]);
  data.metadataReads.length = 0;
  const result = await createCampaignBackupOriginReviewService({
    db: data.db,
    keys,
    now: () => 2000,
  }).reviewCampaignBackupOrigins(
    uid,
    { size: file.length, read: async (offset, length) => file.subarray(offset, offset + length) },
    { index: temporaryIndex().port },
  );
  assert.equal(result.manifest.availability, 'none');
  assert.deepEqual(result.origins.organizationalUniverse, {
    availability: 'available',
    id: worldId,
  });
  assert.equal(result.origins.none, 1);
  assert.equal(result.origins.available, 0);
  assert.equal(
    data.metadataReads.some((r) => r.path.startsWith('adventures/')),
    false,
  );
  assert.deepEqual([...data.records], before);
});

test('organizational v1 unavailable derivatives still preserve signed own content without querying the root universe', async () => {
  const f = await fixture(),
    id = await organizationalWorld(f);
  await patch(f, 'adventures/' + f.campaign.provenance.adventureId, { deleting: true });
  f.file = await f.makeFile();
  await rewriteOrganizationalFile(f, (records, header) => {
    header.provenanceVersion = 1;
    records.splice(
      records.findIndex((r) => r.kind === 'witness' && JSON.parse(r.payload)[0] === 'project'),
      1,
    );
  });
  f.keys[0].state = 'verify-only';
  f.metadataReads.length = 0;
  const result = await f.run();
  assert.equal(result.manifest.provenanceVersion, 1);
  assert.equal(result.manifest.availability, 'unavailable');
  assert.deepEqual(result.origins.organizationalUniverse, { availability: 'unproven' });
  assert.ok(result.manifest.content.bytes > 0);
  assert.equal(
    f.metadataReads.some((r) => r.path === 'universes/' + id),
    false,
  );
});
test('organizational campaign root link change during export cannot sign a mixed root and project witness', async () => {
  const f = await fixture(),
    frames = [];
  let changedLink = false,
    aborts = 0;
  await assert.rejects(
    f.writer.writeCampaignBackupFile(
      uid,
      { campaignId: f.id },
      {
        sink: {
          write: async (b) => frames.push(Buffer.from(b)),
          commit: async () => assert.fail('mixed root must not commit'),
          abort: async () => {
            aborts++;
            frames.length = 0;
          },
        },
        onProgress: async (p) => {
          if (!changedLink && p.pass === 'capture' && p.stage === 'own:campaign') {
            changedLink = true;
            await patch(f, f.path, { universeId: null });
          }
        },
      },
    ),
  );
  assert.equal(changedLink, true);
  assert.equal(aborts, 1);
  assert.equal(frames.length, 0);
});
test('organizational closed witness rejects unknown fields and malformed birth even with a trusted signature', async () => {
  for (const mode of ['extra', 'born']) {
    const f = await fixture();
    await rewriteOrganizationalFile(f, (records) => {
      const record = records.find((r) => r.kind === 'witness'),
        value = JSON.parse(record.payload);
      if (mode === 'extra') value[3].privatePath = 'secret/path';
      else value[3].universe.born.nanoseconds = 1000000000;
      record.payload = Buffer.from(JSON.stringify(value));
    });
    f.metadataReads.length = 0;
    await assert.rejects(f.run());
    assert.equal(f.metadataReads.length, 0);
  }
});
