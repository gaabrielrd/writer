import { readWorkMetadata } from './workProgressContracts.mjs';
import {
  ADVENTURE_RESTORE_DOMAIN,
  closed,
  inconsistent,
  restoreId,
  restoreHash,
  digest,
  born,
  updated,
  bornEqual,
  nativeToken,
  compareStamp,
  restoreFail,
} from './adventureRestoreContracts.mjs';
import { restoreContext } from './adventureRestoreChunks.mjs';
export const ADVENTURE_STAGE_ARTIFACT_FIELDS = Object.freeze([
  'schemaVersion',
  'ownerId',
  'restoreId',
  'jobToken',
  'createdByOperationId',
  'updatedByOperationId',
  'address',
  'valueHash',
  'sourceToken',
]);
const mapped = (value) => typeof value === 'string' && /^restore-[a-f0-9]{64}$/.test(value);
export function adventureStageAddress(value) {
  closed(value, ['scope', 'path']);
  const path = value.path;
  if (!Array.isArray(path) || path.some((p) => typeof p !== 'string')) inconsistent();
  const valid =
    value.scope === 'job'
      ? path.length === 2 && path[0] === 'preparedRoot' && path[1] === 'current'
      : value.scope === 'adventure' &&
        ((path.length === 2 &&
          ['parts', 'scenes', 'sceneBlocks'].includes(path[0]) &&
          mapped(path[1])) ||
          (path.length === 2 &&
            ((path[0] === 'sceneControls' && path[1] === 'unassigned') ||
              (path[0] === 'workProgress' && path[1] === 'current'))) ||
          (path.length === 4 &&
            ['scenes', 'sceneBlocks'].includes(path[0]) &&
            mapped(path[1]) &&
            path[2] === 'body' &&
            path[3] === 'current'));
  if (!valid) inconsistent();
  return { scope: value.scope, path: [...path] };
}
export const adventureStageArtifactId = (address) =>
  digest([ADVENTURE_RESTORE_DOMAIN, 'staged-document', adventureStageAddress(address)]);
export function adventureStageTarget(store, loaded, address) {
  const a = adventureStageAddress(address);
  return store.db.doc(
    (a.scope === 'job' ? loaded.ref.path : 'adventures/' + loaded.job.adventureId) +
      '/' +
      a.path.join('/'),
  );
}
export async function assertAdventureStagingEmpty(store, tx, loaded) {
  for (const name of ['stagingArtifacts', 'preparedRoot'])
    if (
      (
        await tx.get(
          store.db
            .collection(loaded.ref.path + '/' + name)
            .select('schemaVersion')
            .limit(1),
        )
      ).docs.length
    )
      inconsistent();
  await store.emptyRoot(tx, loaded.job.adventureId);
}
/** Prove current native target from its creator/updater effects without reading large body bytes. */
export async function readAdventureStageArtifact(
  store,
  tx,
  loaded,
  snapshot,
  { withValue = false } = {},
) {
  if (!loaded.job.staging || !snapshot.exists) inconsistent();
  const value = snapshot.data();
  closed(value, [
    'schemaVersion',
    'ownerId',
    'restoreId',
    'jobToken',
    'createdByOperationId',
    'updatedByOperationId',
    'address',
    'valueHash',
    'sourceToken',
  ]);
  if (
    value.schemaVersion !== 1 ||
    value.ownerId !== loaded.uid ||
    value.restoreId !== loaded.id ||
    value.jobToken !== loaded.view.jobToken
  )
    inconsistent();
  restoreId(value.createdByOperationId);
  restoreId(value.updatedByOperationId);
  restoreHash(value.valueHash);
  restoreHash(value.sourceToken);
  const address = adventureStageAddress(value.address),
    id = adventureStageArtifactId(address);
  if (id !== snapshot.id) inconsistent();
  const first = await tx.get(store.refs.op(loaded.uid, value.createdByOperationId)),
    last =
      first.id === value.updatedByOperationId
        ? first
        : await tx.get(store.refs.op(loaded.uid, value.updatedByOperationId));
  if (
    !first.exists ||
    !last.exists ||
    !bornEqual(first, snapshot) ||
    digest(updated(snapshot)) !== digest(born(last)) ||
    compareStamp(born(first), born(last)) > 0
  )
    inconsistent();
  const a = store.operation(first, loaded),
    b = store.operation(last, loaded);
  if (
    a.action !== 'advanceAdventureRestoreStructure' ||
    b.action !== a.action ||
    a.checkpoint > b.checkpoint ||
    !first.data().effects.some((e) => e.collection === 'stagingArtifacts' && e.id === id) ||
    !last
      .data()
      .effects.some(
        (e) => e.collection === 'stagingArtifacts' && e.id === id && e.hash === digest(value),
      ) ||
    !last
      .data()
      .effects.some(
        (e) => e.collection === 'staged-target' && e.id === id && e.hash === value.valueHash,
      )
  )
    inconsistent();
  const targetRef = adventureStageTarget(store, loaded, address),
    metadata = await readWorkMetadata(tx, targetRef, ['schemaVersion', 'ownerId', 'revision']);
  if (
    !metadata.exists ||
    !bornEqual(first, metadata) ||
    digest(updated(metadata)) !== digest(born(last))
  )
    inconsistent();
  let data;
  if (withValue) {
    const full = await tx.get(targetRef);
    if (nativeToken(full) !== nativeToken(metadata) || digest(full.data()) !== value.valueHash)
      inconsistent();
    data = full.data();
  }
  return { value, address, targetRef, metadata, data };
}
/** Known descendant namespaces must be empty at creation and wholly journaled before deleting a head. */
export async function checkAdventureStageChildren(
  store,
  tx,
  loaded,
  address,
  allowRegistered = false,
) {
  const a = adventureStageAddress(address);
  if (
    a.scope !== 'adventure' ||
    a.path.length !== 2 ||
    !['parts', 'scenes', 'sceneBlocks'].includes(a.path[0])
  )
    return;
  const names =
    a.path[0] === 'scenes'
      ? ['body', 'planning', 'references']
      : a.path[0] === 'sceneBlocks'
        ? ['body']
        : [];
  for (const name of names) {
    const page = await tx.get(
      store.db
        .collection(adventureStageTarget(store, loaded, a).path + '/' + name)
        .select('schemaVersion')
        .limit(2),
    );
    if (
      page.docs.length &&
      (!allowRegistered ||
        name !== 'body' ||
        page.docs.length !== 1 ||
        page.docs[0].id !== 'current')
    )
      inconsistent();
    if (page.docs.length) {
      const child = { scope: 'adventure', path: [...a.path, name, 'current'] },
        id = adventureStageArtifactId(child),
        journal = await tx.get(store.db.doc(loaded.ref.path + '/stagingArtifacts/' + id));
      await readAdventureStageArtifact(store, tx, loaded, journal);
    }
  }
}
export async function prepareAdventureStageArtifacts(
  store,
  tx,
  loaded,
  operationId,
  writes,
  sourceToken,
) {
  restoreId(operationId);
  restoreHash(sourceToken);
  if (!Array.isArray(writes) || writes.length > 8) inconsistent();
  const seen = new Set(),
    plans = writes.map((w) => {
      closed(w, ['address', 'value']);
      const address = adventureStageAddress(w.address),
        value = structuredClone(w.value),
        id = adventureStageArtifactId(address);
      if (seen.has(id)) inconsistent();
      seen.add(id);
      const text = JSON.stringify(value);
      if (typeof text !== 'string' || Buffer.byteLength(text) > 900000)
        restoreFail('failed-precondition', 'native-compatibility');
      return {
        id,
        address,
        value,
        target: adventureStageTarget(store, loaded, address),
        journal: store.db.doc(loaded.ref.path + '/stagingArtifacts/' + id),
        entry: {
          ...restoreContext(loaded, operationId),
          updatedByOperationId: operationId,
          address,
          valueHash: digest(value),
          sourceToken,
        },
      };
    });
  for (const plan of plans) {
    const [target, journal] = await Promise.all([
      readWorkMetadata(tx, plan.target, ['schemaVersion', 'ownerId']),
      readWorkMetadata(tx, plan.journal, ADVENTURE_STAGE_ARTIFACT_FIELDS),
    ]);
    if (target.exists || journal.exists) inconsistent();
    await checkAdventureStageChildren(store, tx, loaded, plan.address);
  }
  return {
    count: plans.length,
    effects: plans.flatMap((p) => [
      store.effect('stagingArtifacts', p.id, p.entry),
      { collection: 'staged-target', id: p.id, hash: p.entry.valueHash },
    ]),
    commit() {
      for (const p of plans) {
        tx.create(p.target, p.value);
        tx.create(p.journal, p.entry);
      }
    },
  };
}
