import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCampaignBackupOwnReadService } from '../src/campaignBackupOwnRead.mjs';
import { serializeCampaignBackupOwnContent } from '../src/campaignBackupOwnContent.mjs';
import { createCampaignDeletionService } from '../src/campaignDeletion.mjs';
import {
  uid,
  op,
  reason,
  fixture,
  richFixture,
  refresh,
  list,
  note,
  session,
  preparation,
  link,
  reference,
} from './helpers/campaignBackup.mjs';

const itemChanged = reason('campaign-backup-item-changed'),
  contentInconsistent = reason('campaign-backup-content-inconsistent');
const controls = ['session-reference-state', 'session-preparation-state'];
function readerDb(f, transform = (snapshots) => snapshots) {
  const forbidden = () => assert.fail('Content reads must be masked, bounded and read-only');
  f.contentReads = [];
  return {
    doc: (path) => {
      assert.ok(
        path === f.path ||
          path.startsWith(f.path + '/') ||
          path === 'campaignDeletionReservations/' + f.id,
      );
      return { path, id: path.split('/').at(-1) };
    },
    collection: forbidden,
    runTransaction: (cb) =>
      f.db.runTransaction((tx) =>
        cb({
          ...tx,
          get: forbidden,
          set: forbidden,
          create: forbidden,
          update: forbidden,
          delete: forbidden,
          getAll: async (ref, options) => {
            assert.ok(options.fieldMask.length > 0);
            for (const key of [
              'keyBase64',
              'storagePath',
              'bodyStorage',
              'payloadStorage',
              'contentStorage',
              'grant',
              'receipt',
              'url',
            ])
              assert.equal(options.fieldMask.includes(key), false);
            const content = options.fieldMask.some((key) =>
              [
                'title',
                'description',
                'content',
                'summary',
                'body',
                'target.kind',
                'provenance.kind',
                'editorialState',
              ].includes(key),
            );
            if (content) f.contentReads.push({ path: ref.path, fields: options.fieldMask });
            return transform(await tx.getAll(ref, options), ref, options);
          },
        }),
      ),
  };
}
function attach(f, transform) {
  f.reader = createCampaignBackupOwnReadService({ db: readerDb(f, transform) });
  return f;
}
async function input(f, kind, id) {
  let itemToken;
  if (['campaign', 'progress'].includes(kind)) itemToken = f.sourceToken;
  else {
    const found = (await list(f, kind)).items.find((item) => item.id === id);
    assert.ok(found, 'Native inventory unit is required');
    itemToken = found.itemToken;
  }
  return { campaignId: f.id, sourceToken: f.sourceToken, kind, id, itemToken, index: 0 };
}
async function decoded(f, kind, id) {
  const request = await input(f, kind, id),
    chunks = [];
  let first;
  for (let index = 0; ; index++) {
    const part = await f.reader.readCampaignBackupOwnContent(uid, { ...request, index });
    if (part.outcome === 'omitted') return { response: part };
    assert.equal(part.outcome, 'chunk');
    assert.equal(part.index, index);
    const bytes = Buffer.from(part.chunkBase64, 'base64');
    assert.ok(bytes.length > 0 && bytes.length <= 65536);
    chunks.push(bytes);
    first ??= part;
    for (const key of ['chunkCount', 'byteLength', 'contentHash', 'itemToken', 'sourceToken'])
      assert.equal(part[key], first[key]);
    if (index + 1 === part.chunkCount) break;
    assert.ok(index < 100, 'Fixture is bounded, not a product cap');
  }
  const bytes = Buffer.concat(chunks);
  assert.equal(bytes.length, first.byteLength);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), first.contentHash);
  return {
    dto: JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)),
    response: first,
    chunks,
  };
}
const forbiddenKeys = new Set([
  'ownerId',
  'campaignId',
  'campaignToken',
  'sourceToken',
  'itemToken',
  'revision',
  'schemaRevision',
  'nextOrder',
  'cursor',
  'keyBase64',
  'activeBaseId',
  'storagePath',
  'receipt',
  'grant',
  'adventureId',
  'baseId',
]);
function noOperationalFields(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.equal(forbiddenKeys.has(key), false, 'Operational field must not enter DTO: ' + key);
    noOperationalFields(child);
  }
}

test('all nine portable kinds preserve native own data in closed DTOs without operational metadata', async () => {
  const f = attach(await richFixture()),
    before = structuredClone([...f.records]);
  const cases = [
    ['campaign', f.id],
    ['progress', 'current'],
    ['note', f.noteId],
    ['session', f.sessionId],
    ['checklist', op('checklist')],
    ['preparation-item', f.itemId],
    ['preparation-body', f.itemId],
    ['preparation-body', f.questId],
    ['session-reference', f.referenceId],
    ['session-preparation-link', f.linkId],
  ];
  for (const [kind, id] of cases) {
    const result = await decoded(f, kind, id),
      dto = result.dto;
    assert.deepEqual(Object.keys(dto).sort(), ['data', 'id', 'kind', 'present', 'schemaVersion']);
    assert.equal(dto.schemaVersion, 1);
    assert.equal(dto.kind, kind);
    assert.equal(dto.id, id);
    assert.equal(dto.present, true);
    noOperationalFields(dto);
  }
  assert.equal(
    (await decoded(f, 'note', f.noteId)).dto.data.content,
    f.records.get(f.path + '/notes/' + f.noteId).content,
  );
  assert.equal((await decoded(f, 'session', f.sessionId)).dto.data.summary, 'PRIVATE SUMMARY');
  const root = (await decoded(f, 'campaign', f.id)).dto.data;
  assert.deepEqual(root.provenance, { kind: 'original' });
  assert.equal(root.title, 'PRIVATE TABLE');
  assert.equal(root.universeId, null);
  assert.deepEqual((await decoded(f, 'progress', 'current')).dto.data, {
    editorialState: null,
    wordGoal: null,
  });
  assert.deepEqual((await decoded(f, 'preparation-body', f.itemId)).dto.data.body, {
    text: 'PRIVATE CLUE',
    condition: 'PRIVATE CONDITION',
    recipient: 'PRIVATE RECIPIENT',
  });
  assert.deepEqual((await decoded(f, 'preparation-body', f.questId)).dto.data.body, {
    description: 'PRIVATE QUEST',
    consequences: 'PRIVATE CONSEQUENCES',
  });
  const ref = (await decoded(f, 'session-reference', f.referenceId)).dto.data;
  assert.deepEqual(ref.target, { kind: 'scene', sourceKey: f.sceneKey });
  assert.equal(ref.sessionId, f.sessionId);
  const linked = (await decoded(f, 'session-preparation-link', f.linkId)).dto.data;
  assert.equal(linked.sessionId, f.sessionId);
  assert.equal(linked.itemId, f.itemId);
  assert.equal(linked.order, 1);
  assert.deepEqual([...f.records], before);
});

test('absent progress is explicit and does not invent controls or user goals', async () => {
  const f = attach(await fixture()),
    before = structuredClone([...f.records]),
    result = await decoded(f, 'progress', 'current');
  assert.equal(result.dto.present, false);
  assert.deepEqual(result.dto.data, {});
  assert.deepEqual([...f.records], before);
});

test('bounded UTF-8 chunks reconstruct exact BOM, Unicode, empty text, newlines and whitespace', async () => {
  const f = attach(await fixture()),
    id = op('unicode'),
    content = '\ufeff  ' + '🐉é漢'.repeat(30000) + '\n  ';
  await f.notes.saveCampaignNote(uid, {
    ...f.scope,
    noteId: id,
    operationId: id,
    expectedRevision: 0,
    title: 'Unicode',
    content,
  });
  await refresh(f);
  const result = await decoded(f, 'note', id);
  assert.equal(result.dto.data.content, content);
  const request = await input(f, 'note', id);
  await assert.rejects(
    f.reader.readCampaignBackupOwnContent(uid, {
      ...request,
      index: result.response.chunkCount,
    }),
    { code: 'invalid-argument' },
  );
  assert.ok(result.chunks.length >= 5);
  assert.ok(
    result.chunks.some((bytes) => {
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        return false;
      } catch {
        return true;
      }
    }),
    'At least one chunk ends inside a multi-byte character; only whole UTF-8 may be decoded',
  );
  await f.notes.saveCampaignNote(uid, {
    ...f.scope,
    noteId: id,
    operationId: op('empty-text'),
    expectedRevision: 1,
    title: 'Empty',
    content: '',
  });
  await refresh(f);
  assert.equal((await decoded(f, 'note', id)).dto.data.content, '');
});

test('maximum permitted S3 fields survive JSON expansion above one MiB without truncation or a new total cap', async () => {
  const f = attach(await fixture()),
    id = op('escaped-body'),
    text = '\u0001'.repeat(150000);
  await f.preparation.saveCampaignPreparationItem(uid, {
    ...f.scope,
    itemId: id,
    operationId: id,
    expectedRevision: 0,
    expectedItemCollectionRevision: 0,
    kind: 'clue',
    title: 'Escapes',
    status: 'pending',
    body: { text, condition: text, recipient: text },
  });
  await refresh(f);
  const result = await decoded(f, 'preparation-body', id);
  assert.ok(result.response.byteLength > 2 * 1024 * 1024);
  assert.ok(result.response.chunkCount > 32);
  assert.deepEqual(result.dto.data.body, { text, condition: text, recipient: text });
  for (const chunk of result.chunks.slice(0, -1)) assert.equal(chunk.length, 65536);
});

test('control records and tombstones are explicitly omitted without reading text or returning chunks', async () => {
  const f = attach(await richFixture());
  await f.notes.deleteCampaignNote(uid, {
    ...f.scope,
    noteId: f.noteId,
    operationId: op('delete-note'),
    expectedRevision: 1,
  });
  await refresh(f);
  for (const [kind, id, reason] of [
    ...controls.map((kind) => [kind, f.sessionId, 'control']),
    ['note', f.noteId, 'deleted'],
  ]) {
    const request = await input(f, kind, id);
    f.contentReads.length = 0;
    const response = await f.reader.readCampaignBackupOwnContent(uid, request);
    assert.equal(response.outcome, 'omitted');
    assert.equal(response.reason, reason);
    assert.equal(Object.hasOwn(response, 'chunkBase64'), false);
    assert.equal(f.contentReads.length, 0);
    await assert.rejects(f.reader.readCampaignBackupOwnContent(uid, { ...request, index: 1 }), {
      code: 'invalid-argument',
    });
  }
});

test('deleted session omits residual links but keeps own active catalog and bodies independently readable', async () => {
  const f = attach(await richFixture());
  await f.sessions.deleteCampaignSession(uid, {
    ...f.scope,
    sessionId: f.sessionId,
    expectedRevision: 1,
    operationId: op('delete-session'),
  });
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc('adventures/' + f.adventureId)));
  await refresh(f);
  const before = structuredClone([...f.records]);
  for (const [kind, id, reason] of [
    ['session', f.sessionId, 'deleted'],
    ['session-reference', f.referenceId, 'inactive-parent'],
    ['session-preparation-link', f.linkId, 'inactive-parent'],
  ])
    assert.equal((await decoded(f, kind, id)).response.reason, reason);
  assert.equal((await decoded(f, 'preparation-item', f.itemId)).dto.present, true);
  assert.equal((await decoded(f, 'preparation-body', f.itemId)).dto.data.body.text, 'PRIVATE CLUE');
  assert.equal((await decoded(f, 'note', f.noteId)).dto.data.content, 'PRIVATE OWN TEXT 🐉\n  ');
  assert.deepEqual([...f.records], before);
});

test('deleted item omits its still-active session link without treating the item as restorable', async () => {
  const f = attach(await richFixture());
  await f.preparation.deleteCampaignPreparationItem(uid, {
    ...f.scope,
    itemId: f.itemId,
    expectedRevision: 1,
    expectedItemCollectionRevision: 2,
    operationId: op('delete-target'),
  });
  await refresh(f);
  assert.equal((await decoded(f, 'preparation-item', f.itemId)).response.reason, 'deleted');
  assert.equal(
    (await decoded(f, 'session-preparation-link', f.linkId)).response.reason,
    'inactive-parent',
  );
  assert.equal((await decoded(f, 'session', f.sessionId)).dto.present, true);
});

test('stale per-session proof after real S2 or S3 mutation fails before reading any text', async () => {
  for (const mutate of [
    async (f, sid) => reference(f, 'proof-reference', sid),
    async (f, sid, iid) => link(f, 'proof-link', sid, iid),
  ]) {
    const f = attach(await fixture(true)),
      sid = await session(f, 'proof-session'),
      iid = await preparation(f, 'proof-clue');
    await refresh(f);
    const request = await input(f, 'session', sid),
      sourceToken = f.sourceToken;
    await mutate(f, sid, iid);
    await refresh(f);
    assert.equal(f.sourceToken, sourceToken);
    f.contentReads.length = 0;
    await assert.rejects(f.reader.readCampaignBackupOwnContent(uid, request), itemChanged);
    assert.equal(f.contentReads.length, 0);
  }
});

test('old body proof and missing/recreated units cannot expose replacement text', async () => {
  const f = attach(await richFixture()),
    request = await input(f, 'preparation-body', f.itemId),
    ref = f.db.doc(f.path + '/preparationBodies/' + f.itemId),
    original = structuredClone(f.records.get(ref.path));
  await f.db.runTransaction(async (tx) =>
    tx.set(ref, {
      ...original,
      body: {
        text: 'REPLACEMENT',
        condition: '',
        recipient: '',
      },
    }),
  );
  f.contentReads.length = 0;
  await assert.rejects(f.reader.readCampaignBackupOwnContent(uid, request), itemChanged);
  assert.equal(f.contentReads.length, 0);
  await f.db.runTransaction(async (tx) => tx.delete(ref));
  await assert.rejects(f.reader.readCampaignBackupOwnContent(uid, request), itemChanged);
  await f.db.runTransaction(async (tx) => tx.set(ref, original));
  await assert.rejects(f.reader.readCampaignBackupOwnContent(uid, request), itemChanged);
});

test('own note edit during chunk iteration invalidates the next chunk instead of mixing revisions', async () => {
  const f = attach(await fixture()),
    id = op('during-chunks');
  await f.notes.saveCampaignNote(uid, {
    ...f.scope,
    noteId: id,
    operationId: id,
    expectedRevision: 0,
    title: 'Long',
    content: 'x'.repeat(150000),
  });
  await refresh(f);
  const request = await input(f, 'note', id),
    first = await f.reader.readCampaignBackupOwnContent(uid, request);
  assert.ok(first.chunkCount > 1);
  await f.notes.saveCampaignNote(uid, {
    ...f.scope,
    noteId: id,
    operationId: op('edit-during'),
    expectedRevision: 1,
    title: 'New',
    content: 'NEW TEXT',
  });
  f.contentReads.length = 0;
  await assert.rejects(
    f.reader.readCampaignBackupOwnContent(uid, { ...request, index: 1 }),
    reason('campaign-backup-source-changed'),
  );
  assert.equal(f.contentReads.length, 0);
});

test('wrong owner, C4 and unsupported caller fail before text, including historical unit proofs', async () => {
  const f = attach(await richFixture()),
    request = await input(f, 'note', f.noteId);
  f.contentReads.length = 0;
  await assert.rejects(f.reader.readCampaignBackupOwnContent('other', request), {
    code: 'not-found',
  });
  assert.equal(f.contentReads.length, 0);
  const deletion = createCampaignDeletionService({ db: f.db, now: () => 500 }),
    source = await deletion.getCampaignDeletionSource(uid, { campaignId: f.id });
  await deletion.startCampaignDeletion(uid, {
    ...f.scope,
    expectedRevision: source.revision,
    operationId: op('delete-campaign'),
  });
  await assert.rejects(
    f.reader.readCampaignBackupOwnContent(uid, request),
    reason('campaign-deleting'),
  );
  assert.equal(f.contentReads.length, 0);
});

test('closed input, singleton IDs and unsafe indices fail before database construction or reads', async () => {
  let calls = 0;
  const fail = () => {
      calls++;
      assert.fail('Invalid request reached database');
    },
    api = createCampaignBackupOwnReadService({
      db: { doc: fail, collection: fail, runTransaction: fail },
    }),
    base = {
      campaignId: op('campaign'),
      kind: 'note',
      id: op('note'),
      sourceToken: 'a'.repeat(64),
      itemToken: 'b'.repeat(64),
      index: 0,
    };
  for (const patch of [
    { kind: '__proto__' },
    { kind: 'unknown' },
    { id: '../bad' },
    { index: -1 },
    { index: 0.5 },
    { index: undefined },
    { index: Number.MAX_SAFE_INTEGER + 1 },
    { itemToken: undefined },
    { extra: true },
    { kind: 'campaign' },
    { kind: 'progress' },
    { kind: 'campaign', id: base.campaignId, itemToken: base.itemToken },
    { kind: 'progress', id: 'current', itemToken: base.itemToken },
  ])
    await assert.rejects(api.readCampaignBackupOwnContent(uid, { ...base, ...patch }), {
      code: 'invalid-argument',
    });
  for (const actor of [null, '', 42, {}])
    await assert.rejects(api.readCampaignBackupOwnContent(actor, base), {
      code: 'unauthenticated',
    });
  assert.equal(calls, 0);
});

test('stored invalid own data fail instead of silent truncation, coercion or leaking extra nested fields', async () => {
  const cases = [
    ['note', 'notes/', { content: 'x'.repeat(150001) }],
    ['session', 'sessions/', { status: 'unknown' }],
    ['checklist', 'workChecklist/', { title: '\ud800' }],
    ['preparation-item', 'preparationItems/', { status: 'unknown' }],
    [
      'preparation-body',
      'preparationBodies/',
      { body: { text: 'Own', condition: '', recipient: '', keyBase64: 'PRIVATE KEY' } },
    ],
    [
      'session-reference',
      'sessionReferences/',
      { target: { kind: 'unsafe', sourceKey: 'a'.repeat(64) } },
    ],
  ];
  for (const [kind, relative, patch] of cases) {
    const f = attach(await richFixture()),
      row = [...f.records.keys()].find((key) => key.startsWith(f.path + '/' + relative));
    Object.assign(f.records.get(row), patch);
    const before = structuredClone([...f.records]),
      id = row.split('/').at(-1),
      request = await input(f, kind, id);
    await assert.rejects(f.reader.readCampaignBackupOwnContent(uid, request), contentInconsistent);
    assert.deepEqual([...f.records], before);
  }
});

test('native mismatch between metadata proof and content read refuses changed bytes before serialization', async () => {
  const f = await richFixture();
  attach(f, (snapshots, ref, options) =>
    options.fieldMask.includes('content')
      ? [
          {
            ...snapshots[0],
            updateTime: { seconds: 9999, nanoseconds: 0 },
          },
        ]
      : snapshots,
  );
  const request = await input(f, 'note', f.noteId);
  await assert.rejects(f.reader.readCampaignBackupOwnContent(uid, request), itemChanged);
});

test('pure projection strips arbitrary top-level and nested operational metadata but preserves literal own text', () => {
  const own = 'Texto com URL escrita por mim: https://example.invalid/?token=literal\n  ',
    result = serializeCampaignBackupOwnContent('note', op('pure'), {
      title: 'Nota',
      content: own,
      createdAt: 1,
      updatedAt: 2,
      ownerId: 'SECRET OWNER',
      keyBase64: 'PRIVATE KEY',
      storagePath: 'PRIVATE PATH',
      revision: 7,
    });
  const dto = JSON.parse(result.json);
  assert.equal(dto.data.content, own);
  noOperationalFields(dto);
  const root = JSON.parse(
    serializeCampaignBackupOwnContent('campaign', op('root'), {
      title: 'Mesa',
      description: '',
      status: 'planning',
      createdAt: 1,
      updatedAt: 2,
      universeId: null,
      provenance: {
        kind: 'original',
        baseId: 'PRIVATE BASE',
        adventureId: 'PRIVATE ORIGIN',
        grant: 'PRIVATE',
      },
    }).json,
  );
  assert.deepEqual(root.data.provenance, { kind: 'original' });
  noOperationalFields(root);
  assert.throws(
    () =>
      serializeCampaignBackupOwnContent('note', op('bad'), {
        title: 'N',
        content: '\ud800',
        createdAt: 1,
        updatedAt: 1,
      }),
    TypeError,
  );
});

test('request values stay frozen during a paused transaction and retry, with no mutation or duplicate effect', async () => {
  const f = attach(await fixture()),
    id = await note(f, 'freeze');
  await refresh(f);
  const db = readerDb(f);
  let release;
  const gate = new Promise((resolve) => {
      release = resolve;
    }),
    api = createCampaignBackupOwnReadService({
      db: {
        ...db,
        runTransaction: async (cb) => {
          await gate;
          const first = await db.runTransaction(cb),
            replay = await db.runTransaction(cb);
          assert.deepEqual(first, replay);
          return replay;
        },
      },
    }),
    request = await input(f, 'note', id),
    before = structuredClone([...f.records]),
    pending = api.readCampaignBackupOwnContent(uid, request);
  request.id = 'foreign';
  request.kind = 'campaign';
  request.index = 999;
  request.sourceToken = 'f'.repeat(64);
  release();
  const result = await pending;
  assert.equal(result.kind, 'note');
  assert.equal(result.index, 0);
  assert.equal(result.id, id);
  assert.deepEqual([...f.records], before);
});

test('native quest/clue/session states and preparation completion remain exact across content capture', async () => {
  const f = attach(await richFixture());
  for (const status of ['available', 'active', 'completed', 'failed', 'abandoned']) {
    const value = f.records.get(f.path + '/preparationItems/' + f.questId);
    await f.preparation.saveCampaignPreparationItem(uid, {
      ...f.scope,
      itemId: f.questId,
      operationId: op('quest-state-' + status),
      expectedRevision: value.revision,
      expectedItemCollectionRevision: f.records.get(f.path + '/preparationState/current').revision,
      kind: 'quest',
      title: value.title,
      status,
      body: f.records.get(f.path + '/preparationBodies/' + f.questId).body,
    });
    await refresh(f);
    const dto = (await decoded(f, 'preparation-item', f.questId)).dto;
    assert.equal(dto.data.status, status);
    assert.equal(dto.data.order, value.order);
  }
  const clue = f.records.get(f.path + '/preparationItems/' + f.itemId);
  await f.preparation.saveCampaignPreparationItem(uid, {
    ...f.scope,
    itemId: f.itemId,
    operationId: op('clue-handled'),
    expectedRevision: clue.revision,
    expectedItemCollectionRevision: f.records.get(f.path + '/preparationState/current').revision,
    kind: 'clue',
    title: clue.title,
    status: 'handled',
    body: f.records.get(f.path + '/preparationBodies/' + f.itemId).body,
  });
  for (const status of ['planned', 'running', 'completed']) {
    const value = f.records.get(f.path + '/sessions/' + f.sessionId);
    await f.sessions.saveCampaignSession(uid, {
      ...f.scope,
      sessionId: f.sessionId,
      operationId: op('session-state-' + status),
      expectedRevision: value.revision,
      title: value.title,
      summary: value.summary,
      status,
      scheduledDate: '2000-02-29',
    });
    await refresh(f);
    const dto = (await decoded(f, 'session', f.sessionId)).dto;
    assert.equal(dto.data.status, status);
    assert.equal(dto.data.scheduledDate, '2000-02-29');
    assert.equal(dto.data.order, value.order);
  }
  await f.progress.updateWorkChecklistItem(uid, {
    target: { kind: 'campaign', id: f.id },
    id: op('checklist'),
    operationId: op('checklist-complete'),
    expectedRevision: 1,
    patch: { completed: true },
  });
  await refresh(f);
  assert.equal((await decoded(f, 'checklist', op('checklist'))).dto.data.completed, true);
  assert.equal((await decoded(f, 'preparation-item', f.itemId)).dto.data.status, 'handled');
});

test('nested map key order cannot change content hashes between chunks of the same native body', async () => {
  const f = await fixture(),
    id = op('map-order'),
    text = '\u0001'.repeat(30000);
  await f.preparation.saveCampaignPreparationItem(uid, {
    ...f.scope,
    itemId: id,
    operationId: id,
    expectedRevision: 0,
    expectedItemCollectionRevision: 0,
    kind: 'clue',
    title: 'Order',
    status: 'pending',
    body: { text, condition: text, recipient: text },
  });
  await refresh(f);
  let reads = 0;
  attach(f, (snapshots, ref, options) => {
    if (!options.fieldMask.includes('body')) return snapshots;
    const snapshot = snapshots[0],
      value = snapshot.data(),
      entries = Object.entries(value.body);
    if (++reads % 2) entries.reverse();
    return [{ ...snapshot, data: () => ({ ...value, body: Object.fromEntries(entries) }) }];
  });
  const result = await decoded(f, 'preparation-body', id);
  assert.ok(reads > 2);
  assert.equal(result.dto.data.body.text, text);
  assert.deepEqual(Object.keys(result.dto.data.body), ['text', 'condition', 'recipient']);
});

test('singleton metadata ownership is rechecked before the content mask is requested', async () => {
  const f = await fixture();
  attach(f, (snapshots, ref, options) => {
    if (ref.path !== f.path || options.fieldMask.length !== 1 || options.fieldMask[0] !== 'ownerId')
      return snapshots;
    return [{ ...snapshots[0], data: () => ({ ownerId: 'other' }) }];
  });
  const request = await input(f, 'campaign', f.id);
  await assert.rejects(f.reader.readCampaignBackupOwnContent(uid, request), itemChanged);
  assert.equal(f.contentReads.length, 0);
});
