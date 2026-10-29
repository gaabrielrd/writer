import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createHash, sign } from 'node:crypto';
import { createCampaignBackupOwnSemanticsService } from '../src/campaignBackupOwnSemantics.mjs';
import { parseCampaignBackupOwnContent } from '../src/campaignBackupOwnContent.mjs';
import { createCampaignBackupFileService } from '../src/campaignBackupFile.mjs';
import { validateCampaignBackupFile } from '../src/campaignBackupFileValidation.mjs';
import { decodeCampaignBackup, encodeCampaignBackup } from '../src/campaignBackupContainer.mjs';
import { CAMPAIGN_ATTESTATION_DOMAIN } from '../src/portableCampaignManifest.mjs';
import { createCampaignNotesService } from '../src/campaignNotes.mjs';
import { createCampaignSessionsService } from '../src/campaignSessions.mjs';
import { createCampaignPreparationService } from '../src/campaignPreparation.mjs';
import { createCampaignSessionReferencesService } from '../src/campaignSessionReferences.mjs';
import { createWorkProgressService } from '../src/workProgress.mjs';
import { createStudioService } from '../src/studio.mjs';
import { baseSourceKey } from '../src/campaignBaseContracts.mjs';
import { backupLoreFixture, uid, patch } from './helpers/campaignBackupLore.mjs';
import { campaignBackupLoreDb } from './helpers/campaignBackupLoreDb.mjs';
import { note, session, preparation, link, reference } from './helpers/campaignBackup.mjs';
import { imageStorageFixture } from './helpers/campaignBackupImage.mjs';
const invalid = (e) => e.details?.reason === 'campaign-backup-own-semantics-invalid';
function temporaryIndex() {
  const f = {
    rows: new Map(),
    byKey: new Map(),
    reads: [],
    lookups: [],
    hooks: {},
    disposed: 0,
    sealed: 0,
  };
  f.port = {
    async write(row) {
      const copy = { ...row, payload: Buffer.from(row.payload) };
      f.rows.set(row.index, copy);
      f.byKey.set(JSON.stringify([row.family, row.id]), row.index);
      await f.hooks.write?.(copy);
    },
    async seal() {
      f.sealed++;
      await f.hooks.seal?.();
    },
    async read(start, limit) {
      f.reads.push([start, limit]);
      await f.hooks.read?.(start);
      return Array.from({ length: limit }, (_, i) => f.rows.get(start + i));
    },
    async lookup(family, id) {
      f.lookups.push([family, id]);
      await f.hooks.lookup?.(family, id);
      return f.rows.get(f.byKey.get(JSON.stringify([family, id])));
    },
    async dispose() {
      f.disposed++;
      await f.hooks.dispose?.();
      f.rows.clear();
      f.byKey.clear();
    },
  };
  return f;
}
async function fixture(rich = true) {
  const media = await imageStorageFixture(),
    data = campaignBackupLoreDb();
  let f;
  if (rich) {
    f = await backupLoreFixture(undefined, data, media.storage);
    Object.assign(f, {
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
    });
    f.noteId = await note(f, 'semantic-note');
    f.sessionId = await session(f, 'semantic-session');
    f.itemId = await preparation(f, 'semantic-clue');
    f.questId = await preparation(f, 'semantic-quest', 'quest');
    await link(f, 'semantic-link', f.sessionId, f.itemId);
    await reference(f, 'semantic-reference', f.sessionId);
    await f.progress.createWorkChecklistItem(uid, {
      target: { kind: 'campaign', id: f.id },
      operationId: 'semantic-checklist',
      title: 'Private checklist',
    });
  } else {
    f = { ...data, id: 'semantic-independent' };
    f.path = 'campaigns/' + f.id;
    await createStudioService({ db: f.db }).createCampaign(uid, {
      operationId: f.id,
      title: 'Empty private campaign',
    });
  }
  Object.assign(f, media);
  f.pair = generateKeyPairSync('ed25519');
  f.keys = [{ id: 'semantic-test-key', state: 'active', publicKey: f.pair.publicKey }];
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
  f.source = () => ({
    size: f.file.length,
    read: async (offset, length) => f.file.subarray(offset, offset + length),
  });
  f.api = createCampaignBackupOwnSemanticsService({ keys: f.keys, now: () => 6000 });
  f.run = (index = temporaryIndex(), options = {}) =>
    f.api.reviewCampaignBackupOwnContent(uid, f.source(), { index: index.port, ...options });
  return f;
}
async function rewrite(f, mutate) {
  const records = [];
  for await (const r of decodeCampaignBackup(f.source())) records.push(r);
  const groups = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (r.kind !== 'unit')
      groups.push({ kind: r.kind, value: JSON.parse(Buffer.from(r.payload).toString()) });
    else {
      const descriptor = JSON.parse(Buffer.from(r.payload).toString()),
        chunks = [];
      while (records[i + 1]?.kind === 'data') chunks.push(Buffer.from(records[++i].payload));
      groups.push({
        kind: 'unit',
        descriptor,
        payload: chunks.length ? Buffer.concat(chunks) : null,
      });
    }
  }
  mutate(groups);
  const header = groups[0].value,
    packet = groups.at(-1).value,
    out = [],
    content = createHash('sha256'),
    provenance = createHash('sha256');
  const fold = (h, v) => h.update(JSON.stringify(v) + '\n');
  fold(content, ['writer-campaign-logical-units-v1', header.originCampaignId, header.availability]);
  fold(provenance, [
    'writer-campaign-witnesses-v' + header.provenanceVersion,
    header.originCampaignId,
  ]);
  const totals = { units: 0, bytes: 0, chunks: 0, omitted: 0, unavailable: 0 };
  let witnesses = 0,
    witnessBytes = 0;
  for (const g of groups.slice(0, -1)) {
    if (g.kind === 'campaign')
      out.push({
        kind: 'campaign',
        id: 'header',
        part: 0,
        payload: Buffer.from(JSON.stringify(header)),
      });
    else if (g.kind === 'witness') {
      fold(provenance, g.value);
      witnessBytes += g.value[3] === null ? 0 : Buffer.byteLength(JSON.stringify(g.value[3]));
      out.push({
        kind: 'witness',
        id: String(witnesses++),
        part: 0,
        payload: Buffer.from(JSON.stringify(g.value)),
      });
    } else {
      const d = g.descriptor,
        id = String(totals.units++);
      if (d.outcome === 'available')
        Object.assign(d, {
          byteLength: g.payload.length,
          chunkCount: Math.max(1, Math.ceil(g.payload.length / 65536)),
          contentHash: createHash('sha256').update(g.payload).digest('hex'),
        });
      fold(content, d);
      totals.bytes += d.byteLength ?? 0;
      totals.chunks += d.chunkCount ?? 0;
      if (d.outcome === 'omitted') totals.omitted++;
      if (d.outcome === 'unavailable') totals.unavailable++;
      out.push({ kind: 'unit', id, part: 0, payload: Buffer.from(JSON.stringify(d)) });
      if (d.outcome === 'available')
        for (let i = 0; i < d.chunkCount; i++)
          out.push({
            kind: 'data',
            id,
            part: i,
            payload: g.payload.subarray(i * 65536, (i + 1) * 65536),
          });
    }
  }
  packet.manifest.content = { ...totals, digest: content.digest('hex') };
  packet.manifest.provenanceVersion = header.provenanceVersion;
  packet.manifest.provenance = {
    units: witnesses,
    bytes: witnessBytes,
    digest: provenance.digest('hex'),
  };
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
  out.push({
    kind: 'attestation',
    id: 'manifest',
    part: 0,
    payload: Buffer.from(JSON.stringify(packet)),
  });
  const frames = [];
  for await (const frame of encodeCampaignBackup(out)) frames.push(Buffer.from(frame));
  f.file = Buffer.concat(frames);
}
const unit = (groups, family) =>
  groups.find((g) => g.kind === 'unit' && g.descriptor.section === 'own:' + family);
const change = (groups, family, fn) => {
  const row = unit(groups, family),
    v = JSON.parse(row.payload.toString());
  fn(v);
  row.payload = Buffer.from(JSON.stringify(v));
};
test('rich signed campaign validates all own families and joins using only temporary metadata, preserving native records', async () => {
  const f = await fixture(),
    index = temporaryIndex(),
    before = structuredClone([...f.records]),
    decisions = [];
  index.hooks.seal = () => {
    const json = JSON.stringify([...index.rows.values()].map((r) => JSON.parse(r.payload)));
    for (const text of [
      'PRIVATE OWN TEXT',
      'PRIVATE SUMMARY',
      'PRIVATE CLUE',
      'PRIVATE QUEST',
      'Private checklist',
    ])
      assert.equal(json.includes(text), false);
  };
  const result = await f.run(index, { onDecision: (d) => decisions.push(d) });
  assert.equal(result.validation, 'campaign-own-semantics-only');
  assert.equal(result.own.notes, 1);
  assert.equal(result.own.sessions, 1);
  assert.equal(result.own.preparationItems, 2);
  assert.equal(result.own.preparationBodies, 2);
  assert.equal(result.own.sessionReferences, 1);
  assert.equal(result.own.sessionLinks, 1);
  assert.equal(result.own.checklist, 1);
  assert.equal(result.own.organizationalUniverse, 'matched');
  assert.equal(result.own.units, result.own.active + result.own.omitted);
  assert.equal(decisions.length, result.own.units);
  assert.equal(index.disposed, 1);
  assert.deepEqual([...f.records], before);
  assert.ok(Object.isFrozen(result.own));
});
test('empty independent campaign retains absent progress and no derived declaration is promoted', async () => {
  const f = await fixture(false),
    index = temporaryIndex(),
    result = await f.run(index);
  assert.equal(result.manifest.availability, 'none');
  assert.equal(result.own.units, 2);
  assert.equal(result.own.active, 2);
  assert.equal(result.own.nextSessionOrder, 1);
  assert.equal(index.lookups.length, 0);
});
const malformed = {
  'unknown own field': (g) =>
    change(g, 'note', (v) => {
      v.data.origin = 'forged';
    }),
  'unknown nested target': (g) =>
    change(g, 'session-reference', (v) => {
      v.data.target.grant = true;
    }),
  'wrong embedded id': (g) =>
    change(g, 'note', (v) => {
      v.id = 'foreign-id';
    }),
  'wrong embedded kind': (g) =>
    change(g, 'note', (v) => {
      v.kind = 'session';
    }),
  'missing progress': (g) => g.splice(g.indexOf(unit(g, 'progress')), 1),
  'missing root': (g) => g.splice(g.indexOf(unit(g, 'campaign')), 1),
  'duplicate note': (g) => {
    const n = unit(g, 'note');
    g.splice(g.indexOf(n), 0, { ...n });
  },
  'missing session': (g) => g.splice(g.indexOf(unit(g, 'session')), 1),
  'missing preparation item': (g) => g.splice(g.indexOf(unit(g, 'preparation-item')), 1),
  'missing preparation body': (g) => g.splice(g.indexOf(unit(g, 'preparation-body')), 1),
  'mismatched body kind': (g) =>
    change(g, 'preparation-body', (v) => {
      v.data = { kind: 'quest', body: { description: '', consequences: '' } };
    }),
  'missing session reference control': (g) =>
    g.splice(g.indexOf(unit(g, 'session-reference-state')), 1),
  'missing session preparation control': (g) =>
    g.splice(g.indexOf(unit(g, 'session-preparation-state')), 1),
  'unknown linked item': (g) =>
    change(g, 'session-preparation-link', (v) => {
      v.data.itemId = 'unknown-item';
    }),
  'unknown reference session': (g) =>
    change(g, 'session-reference', (v) => {
      v.data.sessionId = 'unknown-session';
    }),
  'organizational mismatch': (g) =>
    change(g, 'campaign', (v) => {
      v.data.universeId = 'different-world';
    }),
  'provenance mismatch': (g) =>
    change(g, 'campaign', (v) => {
      v.data.provenance.kind = 'independent';
    }),
  'counter overflow': (g) =>
    change(g, 'session', (v) => {
      v.data.order = Number.MAX_SAFE_INTEGER;
    }),
  'link counter overflow': (g) =>
    change(g, 'session-preparation-link', (v) => {
      v.data.order = Number.MAX_SAFE_INTEGER;
    }),
  'invalid quest status': (g) =>
    change(g, 'preparation-item', (v) => {
      v.data.status = 'forged';
    }),
  'invalid UTF8 own JSON': (g) => {
    unit(g, 'note').payload[0] = 255;
  },
};
for (const [name, mutate] of Object.entries(malformed))
  test('real re-signed file refuses own semantic violation: ' + name, async () => {
    const f = await fixture();
    await rewrite(f, mutate);
    await validateCampaignBackupFile(uid, f.source(), { keys: f.keys, now: () => 6000 });
    const index = temporaryIndex();
    await assert.rejects(f.run(index), invalid);
    assert.equal(index.disposed, 1);
  });
test('legacy v1 is still readable and its organizational declaration remains unproven', async () => {
  const f = await fixture();
  await rewrite(f, (g) => {
    g[0].value.provenanceVersion = 1;
    g.splice(
      g.findIndex((r) => r.kind === 'witness' && r.value[0] === 'project'),
      1,
    );
  });
  assert.equal((await f.run()).own.organizationalUniverse, 'unproven');
});
for (const phase of ['integrity', 'own'])
  test('abort in ' + phase + ' always disposes the index and produces no own proof', async () => {
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
  });
for (const mode of ['payload', 'missing', 'wrong-ordinal', 'lookup', 'sparse', 'iterator'])
  test('metadata index ' + mode + ' cannot hide or redirect signed own units', async () => {
    const f = await fixture(),
      index = temporaryIndex();
    index.hooks.seal = () => {
      if (mode === 'payload') index.rows.get(0).payload[0] ^= 1;
      if (mode === 'missing') index.rows.delete(0);
      if (mode === 'wrong-ordinal') index.rows.get(0).index = 1;
      if (mode === 'lookup') index.byKey.set(JSON.stringify(['preparation-body', f.itemId]), 0);
    };
    if (mode === 'sparse') index.port.read = async (start, limit) => new Array(limit);
    if (mode === 'iterator')
      index.port.read = async (start, limit) => {
        const rows = Array.from({ length: limit }, (_, i) => index.rows.get(start + i));
        rows[Symbol.iterator] = function* () {};
        return rows;
      };
    if (mode === 'iterator') assert.equal((await f.run(index)).own.units, 13);
    else await assert.rejects(f.run(index), invalid);
    assert.equal(index.disposed, 1);
  });
test('invalid signing context never seals or reads the staged metadata index', async () => {
  const f = await fixture(),
    index = temporaryIndex();
  f.keys[0].state = 'revoked';
  await assert.rejects(f.run(index));
  assert.equal(index.sealed, 0);
  assert.equal(index.reads.length, 0);
  assert.equal(index.disposed, 1);
});
test('literal own text and expanded clue JSON over 2 MiB survive native export and bounded single-unit parsing', async () => {
  const f = await fixture(),
    text = '\ufeff  🐉á\n\u0000  '.repeat(1200),
    part = '\u0000'.repeat(150000);
  await patch(f, f.path + '/notes/' + f.noteId, { content: text });
  await patch(f, f.path + '/preparationBodies/' + f.itemId, {
    body: { text: part, condition: part, recipient: part },
  });
  f.file = await f.makeFile();
  let large = false,
    exact = false;
  await validateCampaignBackupFile(uid, f.source(), {
    keys: f.keys,
    now: () => 6000,
    onOwnUnit: ({ unit: u, payload }) => {
      if (u.outcome !== 'available') return;
      const v = parseCampaignBackupOwnContent(u.section.slice(4), u.id, payload);
      if (v.kind === 'note') {
        assert.equal(v.data.content, text);
        exact = true;
      }
      if (v.kind === 'preparation-body' && u.id === f.itemId) {
        large = payload.length > 2 * 1024 * 1024;
        assert.equal(v.data.body.recipient, part);
      }
    },
  });
  assert.equal(exact, true);
  assert.equal(large, true);
  assert.equal((await f.run()).own.preparationBodies, 2);
});

for (const kind of ['note', 'session', 'item'])
  test(
    'real deleted ' + kind + ' preserves legitimate omissions without losing unrelated preparation',
    async () => {
      const f = await fixture();
      if (kind === 'note')
        await f.notes.deleteCampaignNote(uid, {
          ...f.scope,
          noteId: f.noteId,
          expectedRevision: 1,
          operationId: 'semantic-delete-note',
        });
      if (kind === 'session')
        await f.sessions.deleteCampaignSession(uid, {
          ...f.scope,
          sessionId: f.sessionId,
          expectedRevision: 1,
          operationId: 'semantic-delete-session',
        });
      if (kind === 'item')
        await f.preparation.deleteCampaignPreparationItem(uid, {
          ...f.scope,
          itemId: f.itemId,
          expectedRevision: 1,
          expectedItemCollectionRevision: 2,
          operationId: 'semantic-delete-item',
        });
      f.file = await f.makeFile();
      const result = await f.run();
      assert.ok(result.own.omitted > 2);
      assert.equal(result.own.preparationItems, kind === 'item' ? 1 : 2);
      assert.equal(result.own.preparationBodies, kind === 'item' ? 1 : 2);
      assert.equal(result.own.notes, kind === 'note' ? 0 : 1);
      if (kind === 'session') {
        assert.equal(result.own.sessions, 0);
        assert.equal(result.own.sessionReferences, 0);
        assert.equal(result.own.sessionLinks, 0);
      }
    },
  );
test('metadata pagination visits all 25-row pages and gives a stable semantic digest across new ephemeral MAC keys', async () => {
  const f = await fixture();
  for (let i = 0; i < 28; i++) await note(f, 'semantic-page-' + String(i).padStart(2, '0'));
  f.file = await f.makeFile();
  const index = temporaryIndex(),
    a = await f.run(index),
    b = await f.run();
  assert.equal(a.own.notes, 29);
  assert.ok(index.reads.length > 1);
  assert.ok(index.reads.every(([, limit]) => limit <= 25));
  assert.equal(a.own.units, 41);
  assert.equal(a.own.digest, b.own.digest);
});
for (const mode of [
  'cross-run',
  'full-page-before-callback',
  'write-failure',
  'seal-failure',
  'read-failure',
  'lookup-failure',
])
  test('own metadata cleanup and isolation: ' + mode, async () => {
    const f = await fixture(),
      index = temporaryIndex();
    if (mode === 'cross-run') {
      let foreign;
      const previous = temporaryIndex();
      previous.hooks.dispose = () => {
        foreign = structuredClone(previous.rows.get(0));
      };
      await f.run(previous);
      index.hooks.seal = () => index.rows.set(0, foreign);
    } else if (mode === 'full-page-before-callback')
      index.hooks.seal = () => {
        index.rows.get(10).tag = '0'.repeat(64);
      };
    else
      index.hooks[mode.split('-')[0]] = () => {
        throw new Error('temporary index failure');
      };
    let decisions = 0;
    await assert.rejects(
      f.run(index, {
        onDecision: () => {
          decisions++;
        },
      }),
    );
    if (mode === 'full-page-before-callback') {
      assert.equal(decisions, 0);
      assert.equal(index.lookups.length, 0);
    }
    assert.equal(index.disposed, 1);
  });
test('own review rechecks signing registry after temporary review callbacks', async () => {
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
test('invalid onOwnUnit callback is rejected before reading any file bytes', async () => {
  const f = await fixture(false);
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
      { keys: f.keys, onOwnUnit: true },
    ),
  );
  assert.equal(reads, 0);
});

test('maximum escaped source IDs fit bounded metadata without reducing the portable ID contract', async () => {
  const f = await fixture(),
    longId = '\u0000'.repeat(1500),
    index = temporaryIndex();
  await rewrite(f, (groups) => {
    for (const g of groups) {
      if (g.kind !== 'unit' || !g.descriptor.section.startsWith('own:')) continue;
      const family = g.descriptor.section.slice(4);
      if (
        ['session', 'session-reference-state', 'session-preparation-state'].includes(family) ||
        (['preparation-item', 'preparation-body'].includes(family) && g.descriptor.id === f.itemId)
      )
        g.descriptor.id = longId;
      if (!g.payload) continue;
      const value = JSON.parse(g.payload);
      value.id = g.descriptor.id;
      if (value.data.sessionId) value.data.sessionId = longId;
      if (value.data.itemId === f.itemId) value.data.itemId = longId;
      g.payload = Buffer.from(JSON.stringify(value));
    }
  });
  let maximum = 0;
  index.hooks.write = (row) => {
    maximum = Math.max(maximum, row.payload.length);
  };
  const result = await f.run(index);
  assert.equal(result.own.sessionLinks, 1);
  assert.ok(maximum > 16384 && maximum <= 32768);
});
