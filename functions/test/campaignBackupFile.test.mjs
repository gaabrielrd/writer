import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { createPortableBackupContainer } from '../src/portableBackupContainer.mjs';
import {
  createCampaignBackupEncoder,
  CampaignBackupFormatError,
  encodeCampaignBackup,
  decodeCampaignBackup,
} from '../src/campaignBackupContainer.mjs';
import { createCampaignBackupFileService } from '../src/campaignBackupFile.mjs';
import { validateCampaignBackupFile } from '../src/campaignBackupFileValidation.mjs';
import { backupLoreFixture, uid, entity, patch } from './helpers/campaignBackupLore.mjs';
import { campaignBackupLoreDb } from './helpers/campaignBackupLoreDb.mjs';
import { imageStorageFixture } from './helpers/campaignBackupImage.mjs';
const bytes = (s) => Buffer.from(JSON.stringify(s)),
  json = (r) => JSON.parse(Buffer.from(r.payload).toString());
const source = (data) => ({
  size: data.length,
  async read(offset, length) {
    return data.subarray(offset, offset + length);
  },
});
function sink() {
  const f = { frames: [], commits: 0, aborts: 0 };
  f.port = {
    async write(value) {
      f.frames.push(Buffer.from(value));
    },
    async commit() {
      f.commits++;
    },
    async abort() {
      f.aborts++;
      f.frames = [];
    },
  };
  f.bytes = () => Buffer.concat(f.frames);
  return f;
}
async function collect(iterator) {
  const values = [];
  for (;;) {
    const next = await iterator.next();
    if (next.done) return { values, proof: next.value };
    values.push(next.value);
  }
}
async function fixture() {
  const media = await imageStorageFixture(),
    f = await backupLoreFixture(undefined, campaignBackupLoreDb(), media.storage),
    pair = generateKeyPairSync('ed25519');
  Object.assign(f, media);
  await f.save('file-variant', 0, entity({ details: '\ufeff  🐉á'.repeat(14000) + '\n  ' }));
  await f.refresh();
  f.keys = [{ id: 'file-test-key', state: 'active', publicKey: pair.publicKey }];
  f.service = createCampaignBackupFileService({
    db: f.db,
    storage: f.storage,
    keys: f.keys,
    keyId: 'file-test-key',
    privateKey: pair.privateKey,
    now: () => 5000,
  });
  f.write = (destination = sink(), extra = {}) =>
    f.service
      .writeCampaignBackupFile(uid, { campaignId: f.id }, { sink: destination.port, ...extra })
      .then((proof) => ({ destination, proof }));
  f.validate = (data, extra = {}) =>
    validateCampaignBackupFile(uid, source(data), { keys: f.keys, now: () => 6000, ...extra });
  return f;
}
async function recode(records) {
  return Buffer.concat((await collect(encodeCampaignBackup(records))).values);
}
test('incremental encoder is byte-identical to stream encoding and rejects bad lifecycle/concurrency', async () => {
  const records = [
      { kind: 'data', id: '0', part: 0, payload: Buffer.from('Olá 🐉') },
      { kind: 'data', id: '1', part: 0, payload: Buffer.alloc(65536, 41) },
    ],
    expected = await recode(records),
    encoder = createCampaignBackupEncoder(),
    frames = [await encoder.start()];
  for (const record of records) frames.push(await encoder.write(record));
  frames.push(await encoder.finish());
  assert.deepEqual(Buffer.concat(frames), expected);
  await assert.rejects(encoder.write(records[0]));
  const missing = createCampaignBackupEncoder();
  await assert.rejects(missing.write(records[0]));
  const concurrent = createCampaignBackupEncoder(),
    start = concurrent.start();
  await assert.rejects(concurrent.start());
  await start;
  concurrent.abort();
  await assert.rejects(concurrent.finish());
});
test('incremental encoder copies mutable payload before awaiting hash and aborts pending output', async () => {
  const encoder = createCampaignBackupEncoder(),
    payload = Buffer.from('original');
  await encoder.start();
  const promise = encoder.write({ kind: 'data', id: '0', part: 0, payload });
  payload.fill(88);
  const frames = [await promise, await encoder.finish()];
  const expected = await recode([
    { kind: 'data', id: '0', part: 0, payload: Buffer.from('original') },
  ]);
  assert.deepEqual(Buffer.concat(frames), expected.subarray(16));
  const aborted = createCampaignBackupEncoder();
  await aborted.start();
  const pending = aborted.write({ kind: 'data', id: '0', part: 0, payload });
  aborted.abort();
  await assert.rejects(pending);
});
test('rich native campaign writes full sealed file and independently validates bytes, units, witnesses and signature', async () => {
  const f = await fixture(),
    before = structuredClone([...f.records]),
    { destination, proof } = await f.write(),
    data = destination.bytes(),
    valid = await f.validate(data),
    decoded = await collect(decodeCampaignBackup(source(data)));
  assert.equal(destination.commits, 1);
  assert.equal(destination.aborts, 0);
  assert.equal(valid.validation, 'campaign-file-integrity-only');
  assert.deepEqual(valid.manifest, proof.manifest);
  assert.ok(valid.manifest.content.units > 30);
  assert.ok(valid.manifest.provenance.units > 1);
  assert.equal(data.subarray(0, 12).toString(), 'WRITER-CAMP\n');
  assert.deepEqual([...f.records], before);
  const records = decoded.values,
    units = records.filter((r) => r.kind === 'unit');
  assert.equal(records[0].kind, 'campaign');
  assert.equal(records.at(-1).kind, 'attestation');
  for (const record of records) assert.ok(record.payload.length <= 65536);
  const image = units.find((r) => json(r).section === 'image'),
    raw = Buffer.concat(
      records.filter((r) => r.kind === 'data' && r.id === image.id).map((r) => r.payload),
    );
  assert.deepEqual(raw, f.bytes);
  const variant = units.find((r) => json(r).section === 'variant'),
    value = JSON.parse(
      Buffer.concat(
        records.filter((r) => r.kind === 'data' && r.id === variant.id).map((r) => r.payload),
      ),
    );
  assert.equal(
    value.entity.details,
    entity({ details: '\ufeff  🐉á'.repeat(14000) + '\n  ' }).details,
  );
});
test('unavailable derived source still yields a valid own-data file with explicit omissions and no Storage', async () => {
  const f = await fixture();
  await patch(f, 'adventures/' + f.campaign.provenance.adventureId, { deleting: true });
  f.controls.events.length = 0;
  const { destination } = await f.write(),
    valid = await f.validate(destination.bytes());
  assert.equal(valid.manifest.availability, 'unavailable');
  assert.ok(valid.manifest.provenance.bytes > 0);
  assert.equal(f.controls.events.length, 0);
});
for (const mode of ['write', 'commit', 'abort-signal', 'capture-change'])
  test('temporary sink never commits a partial file after ' + mode, async () => {
    const f = await fixture(),
      destination = sink(),
      controller = new AbortController(),
      write = destination.port.write;
    let n = 0;
    destination.port.write = async (value) => {
      n++;
      if (mode === 'write' && n === 5) throw new Error('disk error');
      await write(value);
      if (mode === 'abort-signal' && n === 5) controller.abort();
    };
    if (mode === 'commit')
      destination.port.commit = async () => {
        throw new Error('rename error');
      };
    let changed = false;
    await assert.rejects(
      f.write(destination, {
        signal: controller.signal,
        onProgress: async (p) => {
          if (
            mode === 'capture-change' &&
            !changed &&
            p.pass === 'capture' &&
            p.stage === 'lore:probe'
          ) {
            changed = true;
            await patch(f, 'campaigns/' + f.id, { title: 'Changed' });
          }
        },
      }),
    );
    assert.equal(destination.commits, 0);
    assert.equal(destination.aborts, 1);
    assert.equal(destination.bytes().length, 0);
  });
test('awaited writes provide backpressure and intent/sink methods are detached before I/O', async () => {
  const f = await fixture(),
    destination = sink(),
    request = { campaignId: f.id };
  let release, started;
  const held = new Promise((r) => {
      release = r;
    }),
    ready = new Promise((r) => {
      started = r;
    }),
    write = destination.port.write;
  destination.port.write = async (value) => {
    if (destination.frames.length === 0) {
      started();
      await held;
    }
    await write(value);
  };
  const pending = f.service.writeCampaignBackupFile(uid, request, { sink: destination.port });
  await ready;
  const count = f.metadataReads.length;
  request.campaignId = 'other';
  destination.port.write = () => {
    throw new Error('late');
  };
  await Promise.resolve();
  assert.equal(f.metadataReads.length, count);
  release();
  await pending;
  assert.equal(destination.commits, 1);
  assert.equal((await f.validate(destination.bytes())).manifest.originCampaignId, f.id);
});
for (const mutate of [
  (records) => {
    const r = records.find((r) => r.kind === 'data');
    r.payload = Buffer.from(r.payload);
    r.payload[0] ^= 1;
  },
  (records) => {
    const r = records.find((r) => r.kind === 'unit');
    r.payload = bytes({ ...json(r), contentHash: '0'.repeat(64) });
  },
  (records) => {
    const r = records.find((r) => r.kind === 'witness' && json(r)[0] === 'base');
    const v = json(r);
    v[3].adventure.born.nanoseconds++;
    r.payload = bytes(v);
  },
  (records) => {
    const i = records.findIndex((r) => r.kind === 'data');
    records.splice(i, 1);
  },
  (records) => {
    const i = records.findIndex((r) => r.kind === 'unit');
    records.splice(i, 0, structuredClone(records[i]));
  },
  (records) => {
    const r = records.find((r) => r.kind === 'data');
    r.part++;
  },
  (records) => {
    const r = records.find((r) => r.kind === 'unit');
    r.payload = bytes({ ...json(r), path: 'private' });
  },
  (records) => {
    const r = records.at(-1);
    const p = json(r);
    p.manifest.content.digest = '0'.repeat(64);
    r.payload = bytes(p);
  },
  (records) => {
    records.push(structuredClone(records.at(-1)));
  },
  (records) => {
    records.shift();
  },
])
  test(
    'rechained malicious file cannot bypass unit/root/signature/ordering checks ' +
      mutate.toString().slice(0, 45),
    async () => {
      const f = await fixture(),
        { destination } = await f.write(),
        records = (await collect(decodeCampaignBackup(source(destination.bytes())))).values;
      mutate(records);
      await assert.rejects(f.validate(await recode(records)));
    },
  );
test('truncated/footer/trailing corruption, wrong account and cross-domain containers refuse', async () => {
  const f = await fixture(),
    { destination } = await f.write(),
    data = destination.bytes();
  for (const invalid of [
    data.subarray(0, -1),
    data.subarray(0, 16),
    Buffer.concat([data, Buffer.from('x')]),
  ])
    await assert.rejects(f.validate(invalid));
  await assert.rejects(validateCampaignBackupFile('other', source(data), { keys: f.keys }));
  const wrong = Buffer.from(data);
  wrong.set(Buffer.from('WRITER-BOOK\n'), 0);
  await assert.rejects(f.validate(wrong));
});
test('validation checks cancellation and source size through the final seal and never grants restoration', async () => {
  const f = await fixture(),
    { destination } = await f.write(),
    data = destination.bytes(),
    controller = new AbortController();
  await assert.rejects(
    f.validate(data, { signal: controller.signal, onProgress: () => controller.abort() }),
    (e) => e.name === 'AbortError',
  );
  const input = source(data),
    size = input.size,
    read = input.read;
  input.read = async (offset, length) => {
    const bytes = await read(offset, length);
    input.size = size + 1;
    return bytes;
  };
  await assert.rejects(validateCampaignBackupFile(uid, input, { keys: f.keys }));
  const proof = await f.validate(data);
  assert.equal(proof.validation, 'campaign-file-integrity-only');
  assert.equal('authorized' in proof, false);
});
test('campaign encoder uses the shared independent framing contract with its own magic', async () => {
  const common = createPortableBackupContainer('WRITER-CAMP\n', CampaignBackupFormatError),
    e = common.createBackupEncoder();
  const bytes = [await e.start(), await e.finish()],
    decoded = await collect(decodeCampaignBackup(source(Buffer.concat(bytes))));
  assert.equal(decoded.proof.records, 0);
});

test('all own families survive the native file, including controls omitted from data and S3 session links', async () => {
  const f = await fixture(),
    { createCampaignNotesService } = await import('../src/campaignNotes.mjs'),
    { createCampaignSessionsService } = await import('../src/campaignSessions.mjs'),
    { createCampaignPreparationService } = await import('../src/campaignPreparation.mjs'),
    { createCampaignSessionReferencesService } =
      await import('../src/campaignSessionReferences.mjs'),
    { createWorkProgressService } = await import('../src/workProgress.mjs'),
    { baseSourceKey } = await import('../src/campaignBaseContracts.mjs'),
    { note, session, preparation, link, reference } = await import('./helpers/campaignBackup.mjs'),
    g = {
      ...f,
      scope: { campaignId: f.id, campaignToken: f.campaignToken },
      notes: createCampaignNotesService({ db: f.db }),
      sessions: createCampaignSessionsService({ db: f.db }),
      preparation: createCampaignPreparationService({ db: f.db }),
      references: createCampaignSessionReferencesService({ db: f.db }),
      sceneKey: baseSourceKey({
        kind: 'scene',
        adventureId: f.campaign.provenance.adventureId,
        id: f.scene.id,
      }),
    };
  await note(g, 'file-own-note');
  const sessionId = await session(g, 'file-own-session'),
    itemId = await preparation(g, 'file-own-clue');
  await preparation(g, 'file-own-quest', 'quest');
  await link(g, 'file-own-link', sessionId, itemId);
  await reference(g, 'file-own-ref', sessionId);
  await createWorkProgressService({ db: f.db }).createWorkChecklistItem(uid, {
    target: { kind: 'campaign', id: f.id },
    operationId: 'file-own-checklist',
    title: 'Prepare clues',
  });
  const { destination } = await f.write(),
    data = destination.bytes(),
    proof = await f.validate(data),
    records = (await collect(decodeCampaignBackup(source(data)))).values,
    units = records.filter((r) => r.kind === 'unit').map(json);
  for (const family of [
    'note',
    'session',
    'checklist',
    'preparation-item',
    'preparation-body',
    'session-reference',
    'session-preparation-link',
  ])
    assert.ok(
      units.some((u) => u.section === 'own:' + family && u.outcome === 'available'),
      family,
    );
  assert.ok(proof.manifest.content.omitted >= 2);
  const body = units.find((u) => u.section === 'own:preparation-body'),
    record = records.find(
      (r) => r.kind === 'unit' && json(r).id === body.id && json(r).section === body.section,
    ),
    value = JSON.parse(
      Buffer.concat(
        records.filter((r) => r.kind === 'data' && r.id === record.id).map((r) => r.payload),
      ),
    );
  assert.ok(JSON.stringify(value).includes('PRIVATE CLUE'));
});
test('retained legacy and its old frozen text remain in the file; integrity survives source/base deletion', async () => {
  const f = await fixture(),
    oldBase = f.campaign.activeBaseId;
  await f.removeReferences();
  await f.adopt();
  const { destination } = await f.write(),
    data = destination.bytes(),
    records = (await collect(decodeCampaignBackup(source(data)))).values,
    witness = records
      .filter((r) => r.kind === 'witness')
      .map(json)
      .find((v) => v[0] === 'anchor');
  assert.equal(witness[3].base.baseId, oldBase);
  assert.notEqual(oldBase, f.campaign.activeBaseId);
  await f.db.recursiveDelete(f.db.doc('campaigns/' + f.id));
  for (const [path] of [...f.records])
    if (path.startsWith('users/' + uid + '/campaignBases/')) f.records.delete(path);
  await f.db.recursiveDelete(f.db.doc('adventures/' + f.campaign.provenance.adventureId));
  assert.equal((await f.validate(data)).validation, 'campaign-file-integrity-only');
});
test('independent empty campaign has a complete sealed file without a derived base or Storage calls', async () => {
  const { createStudioService } = await import('../src/studio.mjs'),
    data = campaignBackupLoreDb(),
    id = 'empty-campaign-file-operation',
    pair = generateKeyPairSync('ed25519'),
    keys = [{ id: 'empty-key', state: 'active', publicKey: pair.publicKey }];
  await createStudioService({ db: data.db }).createCampaign(uid, {
    operationId: id,
    title: 'Empty',
  });
  const service = createCampaignBackupFileService({
      db: data.db,
      storage: {},
      keys,
      keyId: 'empty-key',
      privateKey: pair.privateKey,
      now: () => 1000,
    }),
    destination = sink();
  await service.writeCampaignBackupFile(uid, { campaignId: id }, { sink: destination.port });
  const proof = await validateCampaignBackupFile(uid, source(destination.bytes()), {
    keys,
    now: () => 2000,
  });
  assert.equal(proof.manifest.availability, 'none');
  assert.equal(proof.manifest.content.units, 3);
  assert.ok(proof.manifest.provenance.bytes > 0);
  assert.equal(destination.commits, 1);
});

test('invalid intent and missing account are rejected before touching source or temporary sink', async () => {
  const f = await fixture(),
    destination = sink();
  let reads = 0;
  await assert.rejects(
    f.service.writeCampaignBackupFile(
      uid,
      { campaignId: f.id, hash: '0'.repeat(64) },
      { sink: destination.port },
    ),
  );
  assert.equal(destination.frames.length, 0);
  assert.equal(destination.commits, 0);
  assert.equal(destination.aborts, 0);
  const input = {
    size: 100,
    read: async () => {
      reads++;
      throw new Error('unexpected read');
    },
  };
  await assert.rejects(
    validateCampaignBackupFile('', input, { keys: f.keys }),
    (e) => e.code === 'unauthenticated',
  );
  await assert.rejects(
    validateCampaignBackupFile(uid, input, { keys: f.keys, onProgress: 1 }),
    TypeError,
  );
  assert.equal(reads, 0);
});
for (const section of ['content', 'provenance'])
  test(
    'attacker recomputing unit hashes, roots and frame chain still cannot forge ' + section,
    async () => {
      const f = await fixture(),
        { destination } = await f.write(),
        records = (await collect(decodeCampaignBackup(source(destination.bytes())))).values,
        header = json(records[0]),
        packet = json(records.at(-1));
      if (section === 'content') {
        const data = records.find((r) => r.kind === 'data'),
          before = Buffer.from(data.payload).toString(),
          after = before.replace('Mesa', 'MESA');
        assert.notEqual(after, before);
        data.payload = Buffer.from(after);
        const unit = records.find((r) => r.kind === 'unit' && r.id === data.id),
          descriptor = json(unit);
        descriptor.contentHash = createHash('sha256').update(data.payload).digest('hex');
        unit.payload = bytes(descriptor);
        const hash = createHash('sha256');
        hash.update(
          JSON.stringify([
            'writer-campaign-logical-units-v1',
            header.originCampaignId,
            header.availability,
          ]) + '\n',
        );
        for (const r of records.filter((r) => r.kind === 'unit'))
          hash.update(JSON.stringify(json(r)) + '\n');
        packet.manifest.content.digest = hash.digest('hex');
      } else {
        const witness = records.find((r) => r.kind === 'witness' && json(r)[0] === 'base'),
          value = json(witness);
        value[3].adventure.born.nanoseconds++;
        witness.payload = bytes(value);
        const hash = createHash('sha256');
        let total = 0;
        hash.update(
          JSON.stringify(['writer-campaign-witnesses-v2', header.originCampaignId]) + '\n',
        );
        for (const r of records.filter((r) => r.kind === 'witness')) {
          const v = json(r);
          hash.update(JSON.stringify(v) + '\n');
          total += v[3] === null ? 0 : bytes(v[3]).length;
        }
        packet.manifest.provenance.digest = hash.digest('hex');
        packet.manifest.provenance.bytes = total;
      }
      records.at(-1).payload = bytes(packet);
      await assert.rejects(
        f.validate(await recode(records)),
        (e) => e.details?.reason === 'campaign-backup-invalid-attestation',
      );
    },
  );
test('validly rechained noncanonical descriptor JSON remains invalid', async () => {
  const f = await fixture(),
    { destination } = await f.write(),
    records = (await collect(decodeCampaignBackup(source(destination.bytes())))).values,
    unit = records.find((r) => r.kind === 'unit');
  unit.payload = Buffer.concat([Buffer.from(' '), unit.payload]);
  await assert.rejects(f.validate(await recode(records)), (e) => e.code === 'invalid-campaign');
});
