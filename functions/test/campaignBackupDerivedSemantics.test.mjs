import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { rewriteCampaignBackupTestFile as rewrite } from './helpers/campaignBackupRewrite.mjs';
import { createCampaignBackupFileService } from '../src/campaignBackupFile.mjs';
import { createCampaignBackupDerivedSemanticsService } from '../src/campaignBackupDerivedSemantics.mjs';
import { createCampaignBackupReviewService } from '../src/campaignBackupReview.mjs';
import { validateCampaignBackupFile } from '../src/campaignBackupFileValidation.mjs';
import { digest } from '../src/workProgressContracts.mjs';
import { createStudioService } from '../src/studio.mjs';
import { backupLoreFixture, uid, entity, patch } from './helpers/campaignBackupLore.mjs';
import { campaignBackupLoreDb } from './helpers/campaignBackupLoreDb.mjs';
import { imageStorageFixture } from './helpers/campaignBackupImage.mjs';
const invalid = (e) => e.details?.reason === 'campaign-backup-derived-invalid';
const json = (r) => JSON.parse(Buffer.from(r.payload).toString()),
  bytes = (v) => Buffer.from(JSON.stringify(v));
function temporaryIndex() {
  const f = {
    rows: new Map(),
    hooks: {},
    reads: [],
    lookups: 0,
    reverseCalls: 0,
    disposed: 0,
    sealed: 0,
  };
  f.port = {
    write: async (r) => {
      f.rows.set(r.index, { ...r, payload: Buffer.from(r.payload) });
      await f.hooks.write?.(r);
    },
    seal: async () => {
      f.sealed++;
      await f.hooks.seal?.();
    },
    read: async (start, n) => {
      f.reads.push([start, n]);
      await f.hooks.read?.();
      return Array.from({ length: n }, (_, i) => f.rows.get(start + i));
    },
    lookup: async (section, key) => {
      f.lookups++;
      await f.hooks.lookup?.(section, key);
      const rows = [...f.rows.values()]
          .filter((r) => r.section === section)
          .sort((a, b) => a.position - b.position),
        found = rows.find((r) => r.key === key);
      if (found) return found;
      return {
        before: rows.filter((r) => r.key < key).at(-1) ?? null,
        after: rows.find((r) => r.key > key) ?? null,
      };
    },
    reverse: async (kind, key) => {
      f.reverseCalls++;
      await f.hooks.reverse?.();
      return [...f.rows.values()].find((r) => {
        const v = json({ payload: r.payload });
        return kind === 'image'
          ? r.section === 'base:item' && v.meta?.image === key
          : kind === 'ledger'
            ? r.section === 'base:loreReferences' && v.meta?.targetKey === key
            : r.section === 'base:links' && v.meta?.target?.sourceKey === key;
      });
    },
    dispose: async () => {
      f.disposed++;
      await f.hooks.dispose?.();
      f.rows.clear();
    },
  };
  return f;
}
async function fixture({ empty = false, long = false, related = false } = {}) {
  const media = await imageStorageFixture(),
    data = campaignBackupLoreDb();
  let f;
  if (empty) {
    f = { ...data, id: 'derived-independent-campaign' };
    f.path = 'campaigns/' + f.id;
    await createStudioService({ db: f.db }).createCampaign(uid, {
      operationId: f.id,
      title: 'Empty',
    });
  } else {
    f = await backupLoreFixture(
      long || related
        ? async (f) => {
            const target = { kind: 'adventure', id: 'comparison-adventure-001' };
            if (long) {
              const v = await f.scenes.getScene(uid, { target, sceneId: f.scene.id });
              await f.scenes.updateScene(uid, {
                target,
                sceneId: f.scene.id,
                operationId: 'derived-long-scene-operation',
                expectedRevision: v.revision,
                patch: { content: '\ufeff  ' + '🐉á'.repeat(15000) + '\n' },
              });
            }
            if (related) {
              const input = {
                name: 'Aliada',
                aliases: [],
                category: 'character',
                summary: 'Resumo',
                details: 'Ficha',
                structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
                relations: [],
                isPublic: false,
              };
              await f.universe.saveUniverseLore(uid, {
                universeId: 'world',
                id: 'ally',
                create: true,
                input,
              });
              await f.universe.saveUniverseLore(uid, {
                universeId: 'world',
                id: 'hero',
                input: {
                  ...input,
                  name: 'Heroína',
                  relations: [
                    {
                      targetEntityId: 'universe:world:ally',
                      relationType: 'ally',
                      description: '',
                    },
                  ],
                },
              });
              const v = await f.scenes.getScene(uid, { target, sceneId: f.scene.id });
              await f.scenes.setSceneReference(uid, {
                target,
                sceneId: f.scene.id,
                operationId: 'derived-related-scene-reference',
                expectedRevision: v.revision,
                reference: { kind: 'universe', scopeId: 'world', entityId: 'ally' },
              });
            }
          }
        : undefined,
      data,
      media.storage,
    );
    await f.save(
      'derived-variant-operation',
      0,
      entity(
        related
          ? {
              relations: [
                {
                  targetKey: digest({ kind: 'lore', scopeId: 'world', id: 'ally' }),
                  relationType: 'ally',
                  description: '',
                },
              ],
            }
          : {},
      ),
    );
  }
  Object.assign(f, media);
  f.pair = generateKeyPairSync('ed25519');
  f.keys = [{ id: 'derived-test-key', state: 'active', publicKey: f.pair.publicKey }];
  f.writer = createCampaignBackupFileService({
    db: f.db,
    storage: f.storage,
    keys: f.keys,
    keyId: f.keys[0].id,
    privateKey: f.pair.privateKey,
    now: () => 5000,
  });
  f.makeFile = async () => {
    const frames = [];
    await f.writer.writeCampaignBackupFile(
      uid,
      { campaignId: f.id },
      {
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
  f.source = () => ({ size: f.file.length, read: async (o, n) => f.file.subarray(o, o + n) });
  f.run = (index = temporaryIndex(), options = {}) =>
    createCampaignBackupDerivedSemanticsService({
      keys: f.keys,
      now: () => 6000,
    }).reviewCampaignBackupDerivedContent(uid, f.source(), { index: index.port, ...options });
  return f;
}
const unit = (g, s, p = () => true) =>
  g.find((r) => r.kind === 'unit' && r.unit.section === s && p(r));
const change = (g, s, fn, p) => {
  const r = unit(g, s, p),
    v = JSON.parse(Buffer.concat(r.chunks));
  fn(v);
  const b = bytes(v);
  r.chunks = [];
  for (let i = 0; i < b.length; i += 65536) r.chunks.push(b.subarray(i, i + 65536));
};
const remove = (g, s, p) => g.splice(g.indexOf(unit(g, s, p)), 1);
test('rich native campaign validates all derived joins, references, physical bodies and image ownership without native writes', async () => {
  const f = await fixture(),
    index = temporaryIndex(),
    before = structuredClone([...f.records]);
  index.hooks.seal = () => {
    const text = [...index.rows.values()].map((r) => r.payload.toString()).join();
    for (const prose of ['Heroína', 'Aventura', 'Guardião da mesa', 'Sinopse', 'Texto próprio'])
      assert.equal(text.includes(prose), false);
  };
  const a = await f.run(index),
    b = await f.run();
  assert.equal(a.validation, 'campaign-derived-semantics-only');
  assert.ok(a.derived.items >= 7);
  assert.ok(a.derived.fields >= 17);
  assert.equal(a.derived.images, 1);
  assert.equal(a.derived.variants, 1);
  assert.equal(a.derived.anchors, 1);
  assert.equal(a.derived.digest, b.derived.digest);
  assert.ok(index.reads.length > 1);
  assert.ok(index.reads.every(([, n]) => n <= 25));
  assert.equal(index.disposed, 1);
  assert.deepEqual([...f.records], before);
});
test('empty independent file proves no frozen base or derivative grant', async () => {
  const f = await fixture({ empty: true }),
    r = await f.run();
  assert.equal(r.manifest.availability, 'none');
  assert.equal(r.derived.items, 0);
});
test('long native UTF8 fields traverse semantic validation without collecting the project text', async () => {
  const f = await fixture({ long: true });
  assert.ok((await f.run()).derived.fields > 0);
});
test('revoked source preserves own file and explicit unavailable derivatives', async () => {
  const f = await fixture();
  await patch(f, 'adventures/' + f.campaign.provenance.adventureId, { deleting: true });
  f.file = await f.makeFile();
  const r = await f.run();
  assert.equal(r.manifest.availability, 'unavailable');
  assert.ok(r.derived.unavailable > 0);
});
test('retained legacy uses inline source and birth witnesses after adoption and old-base removal', async () => {
  const f = await fixture(),
    old = f.campaign.activeBaseId;
  await f.removeReferences();
  await f.adopt();
  f.file = await f.makeFile();
  await f.db.recursiveDelete(f.db.doc('users/' + uid + '/campaignBases/' + old));
  assert.equal((await f.run()).derived.anchors, 1);
});
const cases = {
  'extra snapshot field': (g) =>
    change(g, 'base', (v) => {
      v.grant = true;
    }),
  'snapshot source mismatch': (g) =>
    change(g, 'base', (v) => {
      v.adventureId = 'different-adventure';
    }),
  'capturedAt mismatch': (g) =>
    change(g, 'base', (v) => {
      v.capturedAt++;
    }),
  'item unknown field': (g) =>
    change(g, 'base:item', (v) => {
      v.secretPath = 'private';
    }),
  'field manifest hash': (g) =>
    change(g, 'base:item', (v) => {
      v.fields[0].sha256 = '0'.repeat(64);
    }),
  'missing logical field': (g) => remove(g, 'base:field'),
  'extra logical field': (g) => {
    const u = unit(g, 'base:field');
    g.splice(g.indexOf(u), 0, { ...u });
  },
  'missing physical body': (g) => remove(g, 'base:bodies'),
  'orphan physical body': (g) =>
    change(g, 'base:bodies', (v) => {
      v.sourceKey = '0'.repeat(64);
    }),
  'physical body index': (g) =>
    change(g, 'base:bodies', (v) => {
      v.index = 999;
    }),
  'wrong parent kind': (g) =>
    change(
      g,
      'base:item',
      (v) => {
        v.parentKey = v.sourceKey;
      },
      (r) => json({ payload: Buffer.concat(r.chunks) }).kind === 'block',
    ),
  'borrowed nonprincipal body': (g) =>
    change(
      g,
      'base:item',
      (v) => {
        v.fields[0].bodySourceKey = '0'.repeat(64);
      },
      (r) => json({ payload: Buffer.concat(r.chunks) }).kind === 'lore',
    ),
  'missing item witness': (g) =>
    g.splice(
      g.findIndex((r) => r.kind === 'witness' && r.value[0] === 'item'),
      1,
    ),
  'wrong witness origin': (g) => {
    const w = g.find(
      (r) =>
        r.kind === 'witness' && r.value[0] === 'item' && r.value[3].origin?.kind === 'adventure',
    );
    w.value[3].origin.adventureId = 'wrong-adventure';
  },
  'missing image': (g) => remove(g, 'image'),
  'missing ledger': (g) => remove(g, 'base:loreReferences'),
  'missing all lore links': (g) => {
    for (let i = g.length - 1; i >= 0; i--)
      if (g[i].kind === 'unit' && g[i].unit.section === 'base:links') g.splice(i, 1);
  },
  'link owner missing': (g) =>
    change(g, 'base:links', (v) => {
      v.sourceKey = '0'.repeat(64);
    }),
  'link target missing': (g) =>
    change(g, 'base:links', (v) => {
      v.target.sourceKey = '0'.repeat(64);
    }),
  'ledger target missing': (g) =>
    change(g, 'base:loreReferences', (v) => {
      v.targetKey = '0'.repeat(64);
    }),
  'variant anchor key mismatch': (g) =>
    change(g, 'variant', (v) => {
      v.anchorKey = '0'.repeat(64);
    }),
  'variant entity name mismatch': (g) =>
    change(g, 'variant', (v) => {
      v.entity.name = 'Changed';
    }),
  'variant unknown nested field': (g) =>
    change(g, 'variant', (v) => {
      v.entity.hidden = true;
    }),
  'missing anchor': (g) => remove(g, 'anchor'),
  'missing anchor field': (g) => remove(g, 'anchor:field'),
  'anchor source mismatch': (g) =>
    change(g, 'anchor', (v) => {
      v.source.capturedAt++;
    }),
  'anchor borrowed field': (g) =>
    change(g, 'anchor', (v) => {
      v.item.fields[0].bodySourceKey = '0'.repeat(64);
    }),
  'duplicate item': (g) => {
    const r = unit(g, 'base:item');
    g.splice(g.indexOf(r), 0, { ...r });
  },
};
for (const [name, mutate] of Object.entries(cases))
  test('re-signed derived violation refuses: ' + name, async () => {
    const f = await fixture();
    await rewrite(f, mutate);
    await validateCampaignBackupFile(uid, f.source(), { keys: f.keys, now: () => 6000 });
    const index = temporaryIndex();
    await assert.rejects(f.run(index), invalid);
    assert.equal(index.disposed, 1);
  });
for (const mode of [
  'payload',
  'ordinal',
  'missing',
  'false-absence',
  'foreign-gap',
  'coerced-section',
  'write',
  'seal',
  'read',
  'lookup',
  'reverse',
])
  test('temporary derived index cannot forge membership or escape cleanup: ' + mode, async () => {
    const f = await fixture(),
      index = temporaryIndex();
    if (['write', 'seal', 'read', 'lookup', 'reverse'].includes(mode))
      index.hooks[mode] = () => {
        throw new Error('index failure');
      };
    else if (mode === 'false-absence')
      index.port.lookup = async () => ({ before: null, after: null });
    else if (mode === 'foreign-gap')
      index.port.lookup = async () => ({ before: [...index.rows.values()][0], after: null });
    else
      index.hooks.seal = () => {
        if (mode === 'missing') index.rows.delete(0);
        if (mode === 'payload') index.rows.get(0).payload[0] ^= 1;
        if (mode === 'ordinal') index.rows.get(0).index = 1;
        if (mode === 'coerced-section') {
          const row = index.rows.get(0),
            section = row.section;
          row.section = { toString: () => section, toJSON: () => section, startsWith: () => false };
        }
      };
    await assert.rejects(f.run(index));
    assert.equal(index.disposed, 1);
  });
for (const phase of ['integrity', 'derived'])
  test('abort during ' + phase + ' disposes temporary derived index', async () => {
    const f = await fixture(),
      index = temporaryIndex(),
      c = new AbortController();
    await assert.rejects(
      f.run(index, {
        signal: c.signal,
        onProgress: (p) => {
          if (p.phase === phase) c.abort();
        },
      }),
      (e) => e.name === 'AbortError',
    );
    assert.equal(index.disposed, 1);
  });
test('final key registry revocation withholds derived proof', async () => {
  const f = await fixture();
  await assert.rejects(
    f.run(temporaryIndex(), {
      onDecision: () => {
        f.keys[0].state = 'revoked';
      },
    }),
    (e) => e.details?.reason === 'campaign-backup-invalid-attestation',
  );
});
test('actual signed legacy content/provenance v1 still traverses derived joins', async () => {
  const f = await fixture();
  await rewrite(f, (g) => {
    g[0].value.contentVersion = 1;
    g[0].value.provenanceVersion = 1;
    g.splice(
      g.findIndex((r) => r.kind === 'witness' && r.value[0] === 'project'),
      1,
    );
  });
  const r = await f.run();
  assert.equal(r.manifest.contentVersion, 1);
  assert.equal(r.manifest.provenanceVersion, 1);
  assert.equal(r.derived.variants, 1);
});

test('native base and variant relationships to a referenced ficha validate both namespaces', async () => {
  const f = await fixture({ related: true });
  const r = await f.run();
  assert.ok(r.derived.items > 7);
  assert.equal(r.derived.externalAnchorTargets, 0);
});
test('native ficha revocation keeps unavailable metadata and adapted relationship placeholders', async () => {
  const f = await fixture({ related: true });
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc('universes/world/lore/ally')));
  f.file = await f.makeFile();
  assert.ok((await f.run()).derived.unavailable > 0);
});
test('authenticated genuine absence preserves an unavailable narrative target without granting a replacement', async () => {
  const f = await fixture();
  await rewrite(f, (g) =>
    change(g, 'base:links', (v) => {
      v.target = { kind: 'scene', sourceKey: '0'.repeat(64), available: false };
    }),
  );
  assert.equal((await f.run()).derived.links, 2);
});
test('forged optional absence cannot hide an existing available target behind nonadjacent authenticated neighbors', async () => {
  const f = await fixture(),
    index = temporaryIndex();
  let hidden;
  await rewrite(f, (g) =>
    change(g, 'base:links', (v) => {
      hidden = v.target.sourceKey;
      v.target.available = false;
    }),
  );
  const lookup = index.port.lookup;
  index.port.lookup = async (s, key) => {
    if (s === 'base:item' && key === JSON.stringify([hidden, null])) {
      const rows = [...index.rows.values()]
        .filter((r) => r.section === s)
        .sort((a, b) => a.position - b.position);
      return { before: null, after: rows[1] };
    }
    return lookup(s, key);
  };
  await assert.rejects(f.run(index), invalid);
  assert.equal(index.disposed, 1);
});
test('legacy anchor relations outside the archive are counted as unresolved rather than new access', async () => {
  const f = await fixture({ related: true });
  await f.save('derived-clear-own-relation', 1, entity());
  await f.removeReferences();
  const target = { kind: 'adventure', id: f.campaign.provenance.adventureId },
    current = await f.scenes.getScene(uid, { target, sceneId: f.scene.id });
  await f.scenes.setSceneReference(uid, {
    target,
    sceneId: f.scene.id,
    expectedRevision: current.revision,
    operationId: 'derived-remove-ally-reference',
    reference: { kind: 'universe', scopeId: 'world', entityId: 'ally' },
    remove: true,
  });
  await f.adopt();
  f.file = await f.makeFile();
  const r = await f.run();
  assert.equal(r.derived.anchors, 1);
  assert.ok(r.derived.externalAnchorTargets > 0);
});
test('all metadata MACs in a page are checked before any decision or lookup', async () => {
  const f = await fixture(),
    index = temporaryIndex();
  let decisions = 0;
  index.hooks.seal = () => {
    index.rows.get(20).tag = '0'.repeat(64);
  };
  await assert.rejects(
    f.run(index, {
      onDecision: () => {
        decisions++;
      },
    }),
    invalid,
  );
  assert.equal(decisions, 0);
  assert.equal(index.lookups, 0);
  assert.equal(index.reverseCalls, 0);
});
test('derived metadata from another run cannot be replayed with its old MAC', async () => {
  const f = await fixture(),
    old = temporaryIndex(),
    current = temporaryIndex();
  let row;
  old.hooks.dispose = () => {
    row = structuredClone(old.rows.get(0));
  };
  await f.run(old);
  current.hooks.seal = () => {
    current.rows.set(0, row);
  };
  await assert.rejects(f.run(current), invalid);
  assert.equal(current.disposed, 1);
});
test('invalid derived callback is rejected before source IO', async () => {
  const f = await fixture({ empty: true });
  let reads = 0;
  await assert.rejects(
    validateCampaignBackupFile(
      uid,
      {
        size: f.file.length,
        read: async () => {
          reads++;
          assert.fail('must not read');
        },
      },
      { keys: f.keys, onDerivedUnit: true },
    ),
  );
  assert.equal(reads, 0);
});

function fullFactory(opened, hook) {
  return async (stage) => {
    await hook?.(stage);
    const port = temporaryIndex();
    if (stage === 'own')
      port.port.lookup = async (family, id) =>
        [...port.rows.values()].find((r) => r.family === family && r.id === id);
    opened.push({ stage, index: port });
    return port.port;
  };
}
test('complete review composes own, derived and current origin proofs for the exact same archive', async () => {
  const f = await fixture(),
    opened = [],
    stages = new Set();
  const r = await createCampaignBackupReviewService({
    db: f.db,
    keys: f.keys,
    now: () => 6000,
    createIndex: fullFactory(opened),
  }).reviewCampaignBackup(uid, f.source(), { onProgress: (p) => stages.add(p.stage) });
  assert.equal(r.validation, 'campaign-backup-review-only');
  assert.ok(r.derived.items > 0);
  assert.equal(r.origins.unavailable, 0);
  assert.deepEqual(
    opened.map((x) => x.stage),
    ['own', 'derived', 'origins'],
  );
  assert.deepEqual([...stages], ['own', 'derived', 'origins']);
  assert.ok(opened.every((x) => x.index.disposed === 1));
  assert.ok(Object.isFrozen(r));
  assert.equal(r.own.organizationalUniverse, 'matched');
});
test('complete review rejects mixing valid archives between own and derived stages', async () => {
  const f = await fixture(),
    opened = [],
    size = f.file.length;
  const api = createCampaignBackupReviewService({
    db: f.db,
    keys: f.keys,
    now: () => 6000,
    createIndex: fullFactory(opened, async (stage) => {
      if (stage === 'derived') {
        await patch(f, f.path, { title: 'MESA' });
        f.file = await f.makeFile();
        assert.equal(f.file.length, size);
      }
    }),
  });
  await assert.rejects(
    api.reviewCampaignBackup(uid, f.source()),
    (e) => e.details?.reason === 'campaign-backup-review-file-changed',
  );
  assert.deepEqual(
    opened.map((x) => x.stage),
    ['own', 'derived'],
  );
  assert.ok(opened.every((x) => x.index.disposed === 1));
});
test('cancellation while the factory creates an index still disposes that returned port', async () => {
  const f = await fixture({ empty: true }),
    opened = [],
    c = new AbortController();
  const api = createCampaignBackupReviewService({
    db: f.db,
    keys: f.keys,
    now: () => 6000,
    createIndex: fullFactory(opened, (stage) => {
      if (stage === 'own') c.abort();
    }),
  });
  await assert.rejects(
    api.reviewCampaignBackup(uid, f.source(), { signal: c.signal }),
    (e) => e.name === 'AbortError',
  );
  assert.equal(opened.length, 1);
  assert.equal(opened[0].index.disposed, 1);
});
test('failed later index creation preserves disposal of earlier stages', async () => {
  const f = await fixture({ empty: true }),
    opened = [];
  const api = createCampaignBackupReviewService({
    db: f.db,
    keys: f.keys,
    now: () => 6000,
    createIndex: fullFactory(opened, (stage) => {
      if (stage === 'derived') throw new Error('factory failed');
    }),
  });
  await assert.rejects(api.reviewCampaignBackup(uid, f.source()), /factory failed/);
  assert.equal(opened.length, 1);
  assert.equal(opened[0].index.disposed, 1);
});
test('invalid factory port is disposed before any stage consumes it', async () => {
  const f = await fixture({ empty: true });
  let disposed = 0;
  const api = createCampaignBackupReviewService({
    db: f.db,
    keys: f.keys,
    now: () => 6000,
    createIndex: async () => ({
      dispose: async () => {
        disposed++;
      },
    }),
  });
  await assert.rejects(api.reviewCampaignBackup(uid, f.source()), /Índice temporário inválido/);
  assert.equal(disposed, 1);
});
test('complete review captures source reader once before asynchronous stage factories', async () => {
  const f = await fixture({ empty: true }),
    opened = [],
    source = f.source();
  const api = createCampaignBackupReviewService({
    db: f.db,
    keys: f.keys,
    now: () => 6000,
    createIndex: fullFactory(opened, (stage) => {
      if (stage === 'derived')
        source.read = async () => assert.fail('replaced source reader must not be used');
    }),
  });
  assert.equal(
    (await api.reviewCampaignBackup(uid, source)).validation,
    'campaign-backup-review-only',
  );
});
