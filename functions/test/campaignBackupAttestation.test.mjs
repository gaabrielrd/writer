import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createHash, sign } from 'node:crypto';
import {
  createCampaignBackupAttestationService as issuer,
  createCampaignBackupAttestationVerifier as verifier,
} from '../src/campaignBackupAttestation.mjs';
import { createCampaignBackupWitnessService } from '../src/campaignBackupWitness.mjs';
import { createCampaignBackupBaseReadService } from '../src/campaignBackupBaseRead.mjs';
import { validatePortableCampaignWitness } from '../src/portableCampaignProvenance.mjs';
import { CAMPAIGN_ATTESTATION_DOMAIN } from '../src/portableCampaignManifest.mjs';
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
const invalid = (e) => e.details?.reason === 'campaign-backup-invalid-attestation';
async function fixture() {
  const media = await imageStorageFixture(),
    f = await backupLoreFixture(undefined, campaignBackupLoreDb(), media.storage),
    pair = generateKeyPairSync('ed25519');
  Object.assign(f, media, {
    pair,
    registry: [{ id: 'test-key-001', state: 'active', publicKey: pair.publicKey }],
  });
  await f.save('attestation-variant', 0, entity());
  await f.refresh();
  f.witnesses = createCampaignBackupWitnessService({ db: f.db });
  f.issue = issuer({
    db: f.db,
    storage: f.storage,
    keys: () => f.registry,
    keyId: 'test-key-001',
    privateKey: pair.privateKey,
    now: () => 5000,
  }).issueCampaignBackupAttestation;
  f.verify = verifier({ keys: () => f.registry, now: () => 6000 }).verifyCampaignBackupAttestation;
  f.baseWitness = () => f.witnesses.getCampaignBackupBaseWitness(uid, f.anchor);
  f.itemWitness = (ref) =>
    f.witnesses.getCampaignBackupItemWitness(uid, {
      ...f.anchor,
      id: ref.id,
      itemToken: ref.itemToken,
    });
  f.loreWitness = (ref) =>
    f.witnesses.getCampaignBackupLoreWitness(uid, {
      ...f.anchor,
      id: ref.id,
      variantToken: ref.variantToken,
    });
  return f;
}
async function emitted(f) {
  return f.issue(uid, { campaignId: f.id });
}
test('native issuer binds complete content and provenance roots, using real Ed25519 without exposing keys or native tokens', async () => {
  const f = await fixture(),
    before = structuredClone([...f.records]),
    packet = await emitted(f),
    proof = f.verify(uid, packet);
  assert.equal(proof.validation, 'campaign-issuance-only');
  assert.ok(Object.isFrozen(proof.manifest.content));
  assert.equal(proof.manifest.kind, 'writer-campaign');
  assert.equal(proof.manifest.originCampaignId, f.id);
  assert.ok(proof.manifest.provenance.units > 1);
  assert.ok(proof.manifest.provenance.bytes > 0);
  assert.equal(packet.attestation.signature.length, 86);
  assert.deepEqual([...f.records], before);
  const json = JSON.stringify(packet);
  for (const s of [
    'privateKey',
    'publicKey',
    'sourceToken',
    'derivedToken',
    'book-covers/',
    '12345678901234567890',
    'Guardião',
  ])
    assert.equal(json.includes(s), false);
});
test('provenance root equals a bounded replay of actual native base/item/anchor witness records', async () => {
  const f = await fixture(),
    packet = await emitted(f),
    hash = createHash('sha256');
  hash.update(JSON.stringify(['writer-campaign-witnesses-v1', f.id]) + '\n');
  let units = 0,
    bytes = 0;
  const fold = (section, id, r) => {
    hash.update(JSON.stringify([section, id, r.outcome, r.content ?? null]) + '\n');
    units++;
    bytes += r.byteLength ?? 0;
  };
  fold('base', f.campaign.activeBaseId, await f.baseWitness());
  const base = createCampaignBackupBaseReadService({ db: f.db });
  let cursor = null;
  do {
    const p = await base.listCampaignBackupBaseItems(uid, { ...f.anchor, cursor });
    for (const ref of p.items) fold('item', ref.id, await f.itemWitness(ref));
    cursor = p.nextCursor;
  } while (cursor !== null);
  for (const ref of (await f.list()).items) fold('anchor', ref.id, await f.loreWitness(ref));
  assert.deepEqual(packet.manifest.provenance, { units, bytes, digest: hash.digest('hex') });
});
test('signature verifies after original campaign and all captured bases are removed; verification reads no database', async () => {
  const f = await fixture(),
    packet = await emitted(f),
    witness = (await f.baseWitness()).content;
  await f.db.recursiveDelete(f.db.doc('campaigns/' + f.id));
  for (const [path] of [...f.records])
    if (path.startsWith('users/' + uid + '/campaignBases/')) f.records.delete(path);
  const proof = f.verify(uid, packet);
  assert.equal(proof.validation, 'campaign-issuance-only');
  assert.equal(
    validatePortableCampaignWitness(witness).adventure.id,
    f.campaign.provenance.adventureId,
  );
  await assert.rejects(emitted(f));
});
test('retained legacy witness includes its old base and birth facts without requiring that base to survive verification', async () => {
  const f = await fixture(),
    oldBase = f.campaign.activeBaseId;
  await f.removeReferences();
  await f.adopt();
  const ref = (await f.list()).items.find((r) => r.id === heroKey),
    witness = (await f.loreWitness(ref)).content;
  assert.equal(witness.kind, 'anchor');
  assert.equal(witness.base.baseId, oldBase);
  assert.notEqual(witness.base.baseId, f.campaign.activeBaseId);
  const packet = await emitted(f);
  await f.db.recursiveDelete(f.db.doc('users/' + uid + '/campaignBases/' + oldBase));
  assert.equal(f.verify(uid, packet).validation, 'campaign-issuance-only');
});
test('recreated ficha never receives the old birth witness; crypto validity alone is not current access', async () => {
  const f = await fixture(),
    packet = await emitted(f),
    base = createCampaignBackupBaseReadService({ db: f.db }),
    ref = (await base.listCampaignBackupBaseItems(uid, f.anchor)).items.find(
      (r) => r.id === heroKey,
    ),
    original = (await f.itemWitness(ref)).content;
  assert.equal(original.origin.kind, 'lore');
  const path = 'universes/world/lore/hero',
    old = f.records.get(path);
  await remove(f, path);
  await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), old));
  await f.refresh();
  const nextRef = (await base.listCampaignBackupBaseItems(uid, f.anchor)).items.find(
      (r) => r.id === heroKey,
    ),
    current = (await f.itemWitness(nextRef)).content;
  assert.equal(current.availability, 'unavailable');
  assert.equal('origin' in current, false);
  assert.equal(f.verify(uid, packet).validation, 'campaign-issuance-only');
});
test('unavailable adventure still issues own-content manifest with explicit derived omissions', async () => {
  const f = await fixture();
  await patch(f, 'adventures/' + f.campaign.provenance.adventureId, { deleting: true });
  f.controls.events.length = 0;
  const packet = await emitted(f);
  assert.equal(packet.manifest.availability, 'unavailable');
  assert.ok(packet.manifest.content.unavailable > 0);
  assert.equal(packet.manifest.provenance.bytes, 0);
  assert.equal(f.controls.events.length, 0);
  assert.equal(f.verify(uid, packet).validation, 'campaign-issuance-only');
});
for (const [name, mutate] of [
  [
    'content root',
    (p) => {
      p.manifest.content.digest = '0'.repeat(64);
    },
  ],
  [
    'provenance root',
    (p) => {
      p.manifest.provenance.digest = '0'.repeat(64);
    },
  ],
  [
    'owner',
    (p) => {
      p.manifest.ownerBinding = '0'.repeat(64);
    },
  ],
  [
    'campaign',
    (p) => {
      p.manifest.originCampaignId = 'other';
    },
  ],
  [
    'availability',
    (p) => {
      p.manifest.availability = 'none';
    },
  ],
  [
    'timestamp',
    (p) => {
      p.manifest.issuedAt++;
    },
  ],
  [
    'signature',
    (p) => {
      p.attestation.signature = 'A'.repeat(86);
    },
  ],
  [
    'algorithm',
    (p) => {
      p.attestation.algorithm = 'none';
    },
  ],
  [
    'public key injection',
    (p) => {
      p.attestation.publicKey = 'attacker';
    },
  ],
  [
    'foreign domain',
    (p) => {
      p.manifest.kind = 'writer-book';
    },
  ],
  [
    'version',
    (p) => {
      p.manifest.contentVersion = 2;
    },
  ],
  [
    'extra field',
    (p) => {
      p.manifest.url = 'private';
    },
  ],
  [
    'negative count',
    (p) => {
      p.manifest.content.bytes = -1;
    },
  ],
  [
    'huge count',
    (p) => {
      p.manifest.provenance.units = Number.MAX_SAFE_INTEGER + 1;
    },
  ],
])
  test('tampering refuses: ' + name, async () => {
    const f = await fixture(),
      packet = structuredClone(await emitted(f));
    mutate(packet);
    assert.throws(() => f.verify(uid, packet), invalid);
  });
test('wrong account, unknown key, noncanonical base64url and future issuance refuse', async () => {
  const f = await fixture(),
    packet = await emitted(f);
  assert.throws(() => f.verify('other', packet), invalid);
  for (const keyId of ['unknown', '../key'])
    assert.throws(
      () => f.verify(uid, { ...packet, attestation: { ...packet.attestation, keyId } }),
      invalid,
    );
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
    s = packet.attestation.signature,
    last = alphabet.indexOf(s.at(-1)),
    signature = s.slice(0, -1) + alphabet[last + 1];
  assert.throws(
    () => f.verify(uid, { ...packet, attestation: { ...packet.attestation, signature } }),
    invalid,
  );
  assert.throws(
    () =>
      verifier({ keys: () => f.registry, now: () => 0 }).verifyCampaignBackupAttestation(uid, {
        ...packet,
        manifest: { ...packet.manifest, issuedAt: 400000 },
      }),
    invalid,
  );
});
test('key rotation preserves verification, retired keys cannot sign, and revoked keys cannot verify', async () => {
  const f = await fixture(),
    packet = await emitted(f);
  f.registry[0].state = 'verify-only';
  assert.equal(f.verify(uid, packet).validation, 'campaign-issuance-only');
  await assert.rejects(emitted(f), TypeError);
  const next = generateKeyPairSync('ed25519');
  f.registry.push({ id: 'test-key-002', state: 'active', publicKey: next.publicKey });
  const second = issuer({
    db: f.db,
    storage: f.storage,
    keys: () => f.registry,
    keyId: 'test-key-002',
    privateKey: next.privateKey,
    now: () => 7000,
  });
  assert.equal(
    f.verify(uid, await second.issueCampaignBackupAttestation(uid, { campaignId: f.id }))
      .validation,
    'campaign-issuance-only',
  );
  f.registry[0].state = 'revoked';
  assert.throws(() => f.verify(uid, packet), invalid);
});
test('key id is covered by the signature even when a configured alias has the same public key', async () => {
  const f = await fixture(),
    packet = await emitted(f);
  f.registry.push({ id: 'alias', state: 'active', publicKey: f.pair.publicKey });
  assert.throws(
    () => f.verify(uid, { ...packet, attestation: { ...packet.attestation, keyId: 'alias' } }),
    invalid,
  );
});
test('self-signed packet with an untrusted key or wrong domain cannot pass the configured verifier', async () => {
  const f = await fixture(),
    packet = await emitted(f),
    other = generateKeyPairSync('ed25519');
  const body = Buffer.from(
      CAMPAIGN_ATTESTATION_DOMAIN +
        '\0' +
        JSON.stringify({
          schemaVersion: 1,
          algorithm: 'Ed25519',
          keyId: packet.attestation.keyId,
          manifest: packet.manifest,
        }),
    ),
    signature = sign(null, body, other.privateKey).toString('base64url');
  assert.throws(
    () => f.verify(uid, { ...packet, attestation: { ...packet.attestation, signature } }),
    invalid,
  );
  const wrong = sign(null, Buffer.from('writer-book-backup\0' + body), f.pair.privateKey).toString(
    'base64url',
  );
  assert.throws(
    () => f.verify(uid, { ...packet, attestation: { ...packet.attestation, signature: wrong } }),
    invalid,
  );
});
test('manifest projection is canonical across property order and older valid attestations do not expire automatically', async () => {
  const f = await fixture(),
    packet = await emitted(f),
    reversed = Object.fromEntries(Object.entries(packet.manifest).reverse());
  assert.equal(
    f.verify(uid, { ...packet, manifest: reversed }).validation,
    'campaign-issuance-only',
  );
  assert.equal(
    verifier({ keys: () => f.registry, now: () => 1000000000000 }).verifyCampaignBackupAttestation(
      uid,
      packet,
    ).validation,
    'campaign-issuance-only',
  );
});
test('issuer rejects caller roots, wrong key types/pairs, and key revocation during audit', async () => {
  const f = await fixture();
  await assert.rejects(f.issue(uid, { campaignId: f.id, contentHash: '0'.repeat(64) }));
  const other = generateKeyPairSync('ed25519'),
    common = { db: f.db, storage: f.storage, keys: () => f.registry, keyId: 'test-key-001' };
  assert.throws(() => issuer({ ...common, privateKey: other.privateKey }), TypeError);
  assert.throws(() => issuer({ ...common, privateKey: f.pair.publicKey }), TypeError);
  let changed = false;
  await assert.rejects(
    f.issue(
      uid,
      { campaignId: f.id },
      {
        onProgress: (p) => {
          if (!changed && p.pass === 'capture') {
            changed = true;
            f.registry[0].state = 'revoked';
          }
        },
      },
    ),
    TypeError,
  );
});
test('abort after provisional progress never returns an attestation or persists any state', async () => {
  const f = await fixture(),
    controller = new AbortController(),
    before = structuredClone([...f.records]);
  await assert.rejects(
    f.issue(
      uid,
      { campaignId: f.id },
      { signal: controller.signal, onProgress: () => controller.abort() },
    ),
    (e) => e.name === 'AbortError',
  );
  assert.deepEqual([...f.records], before);
});
test('witness projection rejects extra fields, malformed births and mismatched anchor/base, and deep freezes facts', async () => {
  const f = await fixture(),
    base = (await f.baseWitness()).content,
    ref = (await f.list()).items[0],
    anchor = (await f.loreWitness(ref)).content;
  assert.ok(Object.isFrozen(base.adventure.born));
  assert.equal(
    validatePortableCampaignWitness({
      ...base,
      adventure: { ...base.adventure, id: '🐉'.repeat(375) },
    }).adventure.id,
    '🐉'.repeat(375),
  );
  for (const id of ['x'.repeat(1501), '🐉'.repeat(376), '../other', String.fromCharCode(0xd800)])
    assert.throws(
      () => validatePortableCampaignWitness({ ...base, adventure: { ...base.adventure, id } }),
      TypeError,
    );
  assert.ok(Object.isFrozen(anchor.item.origin));
  for (const v of [
    { ...base, url: 'private' },
    { ...base, adventure: { ...base.adventure, born: { seconds: 0, nanoseconds: 1e9 } } },
    { ...anchor, base: { ...anchor.base, baseId: '0'.repeat(64) } },
    {
      ...anchor,
      item: { ...anchor.item, origin: { kind: 'adventure', adventureId: base.adventure.id } },
    },
    {
      ...anchor,
      item: { ...anchor.item, origin: { ...anchor.item.origin, scopeId: 'other-world' } },
    },
  ])
    assert.throws(() => validatePortableCampaignWitness(v), TypeError);
  await assert.rejects(
    f.witnesses.getCampaignBackupBaseWitness(uid, { ...f.anchor, path: 'arbitrary' }),
  );
  await assert.rejects(
    f.witnesses.getCampaignBackupItemWitness(uid, {
      ...f.anchor,
      id: heroKey,
      itemToken: '0'.repeat(64),
    }),
  );
});

test('signed future timestamp is rejected while PEM server injection and key type checks work', async () => {
  const f = await fixture(),
    privatePem = f.pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicPem = f.pair.publicKey.export({ type: 'spki', format: 'pem' }),
    keys = [{ id: 'pem-key', state: 'active', publicKey: publicPem }],
    service = issuer({
      db: f.db,
      storage: f.storage,
      keys,
      keyId: 'pem-key',
      privateKey: privatePem,
      now: () => 400000,
    }),
    packet = await service.issueCampaignBackupAttestation(uid, { campaignId: f.id });
  assert.equal(
    verifier({ keys, now: () => 400001 }).verifyCampaignBackupAttestation(uid, packet).validation,
    'campaign-issuance-only',
  );
  assert.throws(
    () => verifier({ keys, now: () => 0 }).verifyCampaignBackupAttestation(uid, packet),
    invalid,
  );
  const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  assert.throws(
    () =>
      verifier({
        keys: [{ id: 'pem-key', state: 'active', publicKey: ec.publicKey }],
      }).verifyCampaignBackupAttestation(uid, packet),
    TypeError,
  );
});
test('last asynchronous progress cannot revoke the campaign and still obtain a signature', async () => {
  const f = await fixture();
  let changed = false;
  await assert.rejects(
    f.issue(
      uid,
      { campaignId: f.id },
      {
        onProgress: async (p) => {
          if (!changed && p.pass === 'recheck' && p.stage === 'lore:probe') {
            changed = true;
            await patch(f, 'campaigns/' + f.id, { deleting: true });
          }
        },
      },
    ),
  );
  assert.equal(changed, true);
});
test('native local lore birth and absent/unavailable universe facts have closed portable projections', async () => {
  const { baseFixture, row } = await import('./helpers/campaignBackupBase.mjs'),
    { createAdventureLoreService } = await import('../src/adventureLore.mjs'),
    localId = 'witness-local-ficha';
  const f = await baseFixture(async ({ db, scenes, scene }) => {
    const api = createAdventureLoreService({ db }),
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
      operationId: 'witness-local-reference',
      expectedRevision: (await scenes.getScene(uid, { target, sceneId: scene.id })).revision,
      reference: { kind: 'adventure', scopeId: adventureId, entityId: localId },
    });
  });
  const native = createCampaignBackupWitnessService({ db: f.db }),
    lore = f.stored('lore', (v) => v.origin.kind === 'adventure-lore'),
    ref = await row(f, lore),
    result = await native.getCampaignBackupItemWitness(uid, {
      ...f.anchor,
      id: ref.id,
      itemToken: ref.itemToken,
    });
  assert.equal(result.content.origin.kind, 'adventure-lore');
  assert.equal(result.content.origin.entityId, localId);
  const baseOrigin = (await native.getCampaignBackupBaseWitness(uid, f.anchor)).content,
    { digest } = await import('../src/campaignBaseContracts.mjs'),
    localAnchor = {
      kind: 'anchor',
      anchorKey: digest({ capturedBaseId: baseOrigin.baseId, sourceKey: ref.id }),
      base: baseOrigin,
      item: result.content,
    };
  assert.equal(validatePortableCampaignWitness(localAnchor).item.origin.kind, 'adventure-lore');
  assert.throws(
    () =>
      validatePortableCampaignWitness({
        ...localAnchor,
        item: { ...localAnchor.item, origin: { ...localAnchor.item.origin, adventureId: 'other' } },
      }),
    TypeError,
  );
  assert.ok(Number.isInteger(result.content.origin.born.nanoseconds));
  const base = (await native.getCampaignBackupBaseWitness(uid, f.anchor)).content;
  assert.equal(
    validatePortableCampaignWitness({ ...base, universe: { kind: 'none' } }).universe.kind,
    'none',
  );
  await remove(f, 'universes/world');
  const own = await f.own.getCampaignBackupSource(uid, { campaignId: f.id }),
    derived = await f.derived.getCampaignBackupDerivedSource(uid, {
      campaignId: f.id,
      sourceToken: own.sourceToken,
    }),
    unavailable = (
      await native.getCampaignBackupBaseWitness(uid, {
        campaignId: f.id,
        sourceToken: derived.sourceToken,
        derivedToken: derived.derivedToken,
      })
    ).content;
  assert.deepEqual(unavailable.universe, { kind: 'unavailable', id: 'world' });
});
