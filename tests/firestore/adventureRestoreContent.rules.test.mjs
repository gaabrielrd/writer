import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { createAdventureRestoreTransferService } from '../../functions/src/adventureRestoreTransfer.mjs';
import { createVerifiedAdventureRestoreContent } from '../../functions/src/adventureRestoreContentRead.mjs';
import { historyAdventureArchive } from '../../functions/test/helpers/adventureRestoreHistoryArchiveFixture.mjs';
import {
  uid,
  id,
  request,
  mutation,
  chunkRequest,
  hash,
} from '../../functions/test/helpers/adventureRestoreTransferFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-adventure-consumption',
  jobPath = 'users/' + uid + '/adventureRestores/' + id;
let env, admin, api;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? '')) throw Error('Use only the local demo emulator');
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
  api = createAdventureRestoreTransferService({ db: admin });
});
beforeEach(async () => {
  await env.clearFirestore();
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
async function ready() {
  const bytes = await historyAdventureArchive();
  let p = (await api.startAdventureRestore(uid, request(bytes))).progress;
  for (let n = 0; n < Math.ceil(bytes.length / 65536); n++)
    p = (await api.appendAdventureRestoreChunk(uid, chunkRequest(p, bytes, n))).progress;
  p = (
    await api.advanceAdventureRestoreIntegrity(
      uid,
      mutation(p, 'consume-integrity-0001', { limit: 16 }),
    )
  ).progress;
  let n = 0;
  while (['bytes-verified', 'validating'].includes(p.state)) {
    assert.ok(++n < 100);
    p = (
      await api.advanceAdventureRestoreValidation(
        uid,
        mutation(p, 'consume-validation-' + String(n).padStart(6, '0')),
      )
    ).progress;
  }
  assert.equal(p.state, 'content-verified');
  return {
    p,
    reader: await createVerifiedAdventureRestoreContent({
      db: admin,
      uid,
      restoreId: p.restoreId,
      jobToken: p.jobToken,
    }),
  };
}
async function rawUnit(reader) {
  for (let at = 0; at < reader.itemCount; at++) {
    const unit = await reader.readItem(at);
    if (unit.record.kind === 'adventure-version-body')
      return { unit, raw: await reader.openMappedRaw(at) };
  }
  throw Error('Missing history unit');
}
test('SDK consumes authenticated JSON and resumed raw before atomic test writes while leaving the reserved adventure private', async () => {
  const { p, reader } = await ready(),
    unit = await reader.readMappedItem(0);
  await admin.runTransaction(async (tx) => {
    await unit.verify(tx);
    tx.create(admin.doc('testConsumed/head'), { id: unit.record.id });
  });
  const { raw } = await rawUnit(reader),
    first = await raw.readStep();
  const checkpointRef = admin.doc('testPrivateRaw/checkpoint');
  await checkpointRef.set({ checkpoint: first.checkpoint });
  const saved = (await checkpointRef.get()).data().checkpoint;
  const last = await raw.readStep(saved);
  assert.equal(first.done, false);
  assert.equal(first.checkpoint.utf8.needed, 3);
  assert.equal(last.done, true);
  assert.equal(hash(Buffer.concat([first.bytes, last.bytes])), raw.manifest.contentHash);
  await admin.runTransaction(async (tx) => {
    await last.verify(tx);
    tx.create(admin.doc('testConsumed/body'), { hash: raw.manifest.contentHash });
  });
  assert.equal((await admin.doc('testConsumed/body').get()).data().hash, raw.manifest.contentHash);
  assert.equal(
    Object.hasOwn((await admin.doc('adventures/' + p.adventureId).get()).data(), 'ownerId'),
    false,
  );
  await assertFails(
    getDoc(doc(env.authenticatedContext(uid).firestore(), jobPath + '/validationState/current')),
  );
});
test('SDK source, proof, snapshot and indexed-item changes block held consumption proofs without partial target writes', async () => {
  for (const mode of ['source', 'proof', 'state', 'item']) {
    await env.clearFirestore();
    const { reader } = await ready(),
      unit = await reader.readItem(0),
      paths = {
        source: jobPath + '/chunks/000000000000000',
        proof: jobPath + '/integrityProofs/000000000000000',
        state: jobPath + '/validationState/current',
        item: jobPath + '/validationItems/000000000000000',
      },
      ref = admin.doc(paths[mode]),
      value = (await ref.get()).data();
    if (mode === 'source' || mode === 'item') {
      await ref.delete();
      await ref.set(value);
    } else await ref.update(mode === 'proof' ? { chunkHash: 'f'.repeat(64) } : { stateJSON: '{}' });
    await assert.rejects(() =>
      admin.runTransaction(async (tx) => {
        await unit.verify(tx);
        tx.create(admin.doc('testConsumed/blocked'), { yes: true });
      }),
    );
    assert.equal((await admin.doc('testConsumed/blocked').get()).exists, false);
  }
});
test('SDK raw proof is checked inside the consuming transaction and cannot outlive cancellation or an aborted write', async () => {
  const { p, reader } = await ready(),
    { raw } = await rawUnit(reader),
    part = await raw.readStep();
  await assert.rejects(
    () =>
      admin.runTransaction(async (tx) => {
        await part.verify(tx);
        tx.create(admin.doc('testConsumed/rollback'), { bytes: part.bytes.length });
        throw Error('after proof');
      }),
    /after proof/,
  );
  assert.equal((await admin.doc('testConsumed/rollback').get()).exists, false);
  await api.cancelAdventureRestore(uid, mutation(p, 'consume-cancel-0001'));
  await assert.rejects(() =>
    admin.runTransaction(async (tx) => {
      await part.verify(tx);
      tx.create(admin.doc('testConsumed/stale'), { yes: true });
    }),
  );
  assert.equal((await admin.doc('testConsumed/stale').get()).exists, false);
  await assert.rejects(() => raw.readStep(part.checkpoint));
});
