import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { createStudioService } from '../../functions/src/studio.mjs';
import { createScenesService } from '../../functions/src/scenes.mjs';
import { createAdventureBackupSourceService } from '../../functions/src/adventureBackupSource.mjs';
import { createAdventureBackupResourceService } from '../../functions/src/adventureBackupResourceRead.mjs';
import { createNarrativePlanningService } from '../../functions/src/narrativePlanning.mjs';
import { sequenceKey } from '../../functions/src/narrativeContracts.mjs';
import { digest } from '../../functions/src/workProgressContracts.mjs';

const { Firestore } = createRequire(new URL('../../functions/package.json', import.meta.url))(
  'firebase-admin/firestore',
);
const projectId = 'demo-writer-adventure-narrative',
  uid = 'author',
  id = 'adventure-backup-sdk-0001',
  path = 'adventures/' + id;
let env, admin;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? '')) throw Error('Use only the local demo emulator.');
  const [host, port] = address.split(':');
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
});
beforeEach(async () => env.clearFirestore());
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});

const target = { kind: 'adventure', id },
  arcId = 'sdk-narrative-arc-0001',
  milestoneId = 'sdk-narrative-milestone-0001',
  sceneId = 'sdk-narrative-scene-0001',
  arcPath = path + '/arcs/' + arcId,
  milestonePath = arcPath + '/milestones/' + milestoneId;
async function fixture(count = 1) {
  await createStudioService({ db: admin, now: () => 1000 }).createAdventure(uid, {
    operationId: id,
    title: 'PRIVATE_ROOT',
    synopsis: 'PRIVATE_SYNOPSIS',
  });
  await createScenesService({ db: admin, now: () => 1100 }).createScene(uid, {
    target,
    operationId: sceneId,
    title: 'PRIVATE_SCENE',
    content: 'PRIVATE_BODY',
  });
  const narrative = createNarrativePlanningService({ db: admin, now: () => 1200 });
  await narrative.createNarrativeItem(uid, {
    target,
    resource: { kind: 'arc' },
    operationId: arcId,
    title: 'PRIVATE_ARC',
    initialState: 'PRIVATE_INITIAL',
    objective: '',
    plannedOutcome: 'PRIVATE_OUTCOME',
  });
  await narrative.createNarrativeItem(uid, {
    target,
    resource: { kind: 'milestone', arcId },
    operationId: milestoneId,
    title: 'PRIVATE_MILESTONE',
    notes: 'PRIVATE_NOTES',
  });
  for (let n = 1; n <= count; n++)
    await narrative.createNarrativeItem(uid, {
      target,
      resource: { kind: 'event' },
      operationId: 'sdk-narrative-event-' + String(n).padStart(4, '0'),
      title: 'PRIVATE_EVENT_' + n,
      dateLabel: '3º dia do inverno',
      description: 'PRIVATE_DESCRIPTION',
    });
  await narrative.setNarrativeReference(uid, {
    target,
    source: { kind: 'milestone', id: milestoneId, arcId },
    reference: { kind: 'scene', sceneId },
    expectedRevision: 1,
    operationId: 'sdk-narrative-link-0001',
  });
  const pin = await createAdventureBackupSourceService({ db: admin }).getAdventureBackupSource(
    uid,
    { adventureId: id },
  );
  return { narrative, pin, api: createAdventureBackupResourceService({ db: admin }) };
}
const list = (f, kind, parentId = null, extra = {}) =>
  f.api.listAdventureBackupResources(uid, {
    adventureId: id,
    sourceToken: f.pin.sourceToken,
    kind,
    parentId,
    ...extra,
  });
const request = (f, kind, row, parentId = null) => ({
  adventureId: id,
  sourceToken: f.pin.sourceToken,
  kind,
  parentId,
  id: row.id,
  itemToken: row.itemToken,
  index: 0,
});
test('SDK adventure narrative real producers page metadata and preserve rebalance order, free dates and private prose', async () => {
  const f = await fixture(52);
  for (let n = 0; n < 10; n++)
    if (
      (
        await f.narrative.rebalanceNarrativeRanks(uid, {
          target,
          resource: { kind: 'event' },
          operationId: 'sdk-narrative-rebalance-0001',
          limit: 13,
        })
      ).complete
    )
      break;
  f.pin = await createAdventureBackupSourceService({ db: admin }).getAdventureBackupSource(uid, {
    adventureId: id,
  });
  let queries = 0;
  const port = {
    doc: (p) => admin.doc(p),
    collection: (p) => admin.collection(p),
    runTransaction: (op) =>
      admin.runTransaction((tx) =>
        op({
          async getAll(ref, options) {
            const snapshots = await tx.getAll(ref, options);
            for (const snapshot of snapshots)
              if (snapshot.exists)
                for (const key of ['title', 'initialState', 'description', 'notes', 'reference'])
                  if (!options.fieldMask.includes(key))
                    assert.equal(Object.hasOwn(snapshot.data(), key), false);
            return snapshots;
          },
          async get(query) {
            queries++;
            const page = await tx.get(query);
            for (const snapshot of page.docs)
              for (const key of ['title', 'initialState', 'description', 'notes', 'reference'])
                assert.equal(Object.hasOwn(snapshot.data(), key), false);
            return page;
          },
        }),
      ),
  };
  f.api = createAdventureBackupResourceService({ db: port });
  const a = await list(f, 'event', null, { limit: 50 }),
    b = await list(f, 'event', null, { limit: 50, cursor: a.nextCursor });
  assert.equal(a.items.length, 50);
  assert.equal(b.items.length, 2);
  assert.equal(b.nextCursor, null);
  assert.equal(queries, 2);
  for (const [kind, parentId] of [
    ['arc', null],
    ['event', null],
    ['milestone', arcId],
    ['arc-order', null],
    ['event-order', null],
    ['milestone-order', arcId],
    ['narrative-link', null],
  ]) {
    const page = await list(f, kind, parentId);
    assert.equal(JSON.stringify(page).includes('PRIVATE_'), false);
    const r = await f.api.readAdventureBackupResource(
        uid,
        request(f, kind, page.items[0], parentId),
      ),
      bytes = Buffer.from(r.chunkBase64, 'base64'),
      dto = JSON.parse(bytes.toString('utf8'));
    assert.equal(digest(bytes.toString('utf8')), r.contentHash);
    if (kind === 'event') assert.equal(dto.data.dateLabel, '3º dia do inverno');
    if (kind === 'event-order') assert.deepEqual(dto.data, { rankSlot: 'B' });
    if (kind === 'milestone') assert.equal(dto.data.notes, 'PRIVATE_NOTES');
    if (kind === 'narrative-link')
      assert.deepEqual(dto.data, {
        source: { kind: 'milestone', id: milestoneId, arcId },
        reference: { kind: 'scene', sceneId },
      });
  }
});

test('SDK adventure narrative checks native source ancestry, optional control birth and read-only retries', async () => {
  const f = await fixture(),
    link = (await list(f, 'narrative-link')).items[0];
  for (const dependency of [path + '/narrativeLinks/' + link.id, milestonePath, arcPath]) {
    const row = (await list(f, 'narrative-link')).items[0],
      ref = admin.doc(dependency),
      before = await ref.get();
    await ref.delete();
    await ref.create(before.data());
    assert.equal((await ref.get()).createTime.isEqual(before.createTime), false);
    await assert.rejects(
      f.api.readAdventureBackupResource(uid, request(f, 'narrative-link', row)),
      { code: 'failed-precondition' },
    );
  }
  const control = admin.doc(
    path + '/narrativeControls/' + sequenceKey({ kind: 'milestone', arcId }),
  );
  await control.delete();
  const absent = (await list(f, 'milestone-order', arcId)).items[0];
  assert.equal(absent.present, false);
  const absentRead = await f.api.readAdventureBackupResource(
    uid,
    request(f, 'milestone-order', absent, arcId),
  );
  assert.equal(JSON.parse(Buffer.from(absentRead.chunkBase64, 'base64').toString()).present, false);
  await control.create({ rankSlot: 'A' });
  await assert.rejects(
    f.api.readAdventureBackupResource(uid, request(f, 'milestone-order', absent, arcId)),
    { code: 'failed-precondition' },
  );
  const row = (await list(f, 'milestone', arcId)).items[0],
    input = request(f, 'milestone', row, arcId),
    before = await admin.doc(milestonePath).get();
  const failing = {
    doc: (p) => admin.doc(p),
    collection: (p) => admin.collection(p),
    runTransaction: (op) =>
      admin.runTransaction((tx) =>
        op({
          getAll(ref, options) {
            if (ref.path === milestonePath) throw Error('injected narrative failure');
            return tx.getAll(ref, options);
          },
        }),
      ),
  };
  await assert.rejects(
    createAdventureBackupResourceService({ db: failing }).readAdventureBackupResource(uid, input),
    /injected narrative failure/,
  );
  await f.api.readAdventureBackupResource(uid, input);
  assert.ok((await admin.doc(milestonePath).get()).updateTime.isEqual(before.updateTime));
  await assert.rejects(f.api.readAdventureBackupResource('other', input), { code: 'not-found' });
  await assertFails(getDoc(doc(env.authenticatedContext('other').firestore(), milestonePath)));
  await assertFails(
    setDoc(doc(env.authenticatedContext(uid).firestore(), milestonePath), { notes: 'bypass' }),
  );
});
