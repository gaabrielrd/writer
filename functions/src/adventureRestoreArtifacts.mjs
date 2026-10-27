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
const actions = [
  'advanceAdventureRestoreStructure',
  'advanceAdventureRestoreResources',
  'advanceAdventureRestoreProfiles',
  'advanceAdventureRestoreHistory',
  'finalizeAdventureRestoreDraft',
];
const mapped = (v) => typeof v === 'string' && /^restore-[a-f0-9]{64}$/.test(v);
const hashId = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export function adventureStageAddress(value) {
  closed(value, ['scope', 'path']);
  const p = value.path;
  if (!Array.isArray(p) || p.some((k) => typeof k !== 'string')) inconsistent();
  const valid =
    value.scope === 'job'
      ? p.length === 2 &&
        p[0] === 'preparedRoot' &&
        (['current', 'text-state', 'universe-candidate', 'recovered-draft'].includes(p[1]) ||
          /^persona-custom-[a-f0-9]{64}$/.test(p[1]) ||
          /^binding-[a-f0-9]{64}$/.test(p[1]))
      : value.scope === 'adventure' &&
        ((p.length === 2 &&
          [
            'parts',
            'scenes',
            'sceneBlocks',
            'workChecklist',
            'arcs',
            'timelineEvents',
            'lore',
            'loreBodies',
            'workVersions',
          ].includes(p[0]) &&
          mapped(p[1])) ||
          (p.length === 2 &&
            ['narrativeLinks', 'sceneLoreLinks', 'workVersionBodies'].includes(p[0]) &&
            hashId(p[1])) ||
          (p.length === 2 &&
            p[0] === 'narrativeControls' &&
            (hashId(p[1]) || p[1] === 'entity-scenes')) ||
          (p.length === 2 &&
            ((p[0] === 'sceneControls' && p[1] === 'unassigned') ||
              (p[0] === 'workProgress' && p[1] === 'current'))) ||
          (p.length === 4 &&
            ['scenes', 'sceneBlocks'].includes(p[0]) &&
            mapped(p[1]) &&
            p[2] === 'body' &&
            p[3] === 'current') ||
          (p.length === 4 &&
            p[0] === 'scenes' &&
            mapped(p[1]) &&
            ((p[2] === 'planning' && p[3] === 'current') ||
              (p[2] === 'references' && hashId(p[3])))) ||
          (p.length === 4 &&
            p[0] === 'arcs' &&
            mapped(p[1]) &&
            p[2] === 'milestones' &&
            mapped(p[3])));
  if (!valid) inconsistent();
  return { scope: value.scope, path: [...p] };
}
export const adventureStageArtifactId = (address) => {
  const a = adventureStageAddress(address),
    h = digest([ADVENTURE_RESTORE_DOMAIN, 'staged-document', a]);
  // Newly introduced descendants sort before every legacy hexadecimal parent journal.
  return a.path.length === 4 && a.path[2] !== 'body' ? '0-' + h : h;
};
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
export async function readAdventureStageArtifact(
  store,
  tx,
  loaded,
  snapshot,
  { withValue = false } = {},
) {
  if (!loaded.job.staging || !snapshot.exists) inconsistent();
  const v = snapshot.data();
  closed(v, ADVENTURE_STAGE_ARTIFACT_FIELDS);
  if (
    v.schemaVersion !== 1 ||
    v.ownerId !== loaded.uid ||
    v.restoreId !== loaded.id ||
    v.jobToken !== loaded.view.jobToken
  )
    inconsistent();
  restoreId(v.createdByOperationId);
  restoreId(v.updatedByOperationId);
  restoreHash(v.valueHash);
  restoreHash(v.sourceToken);
  const address = adventureStageAddress(v.address),
    id = adventureStageArtifactId(address);
  if (id !== snapshot.id) inconsistent();
  const first = await tx.get(store.refs.op(loaded.uid, v.createdByOperationId)),
    last =
      first.id === v.updatedByOperationId
        ? first
        : await tx.get(store.refs.op(loaded.uid, v.updatedByOperationId));
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
    !actions.includes(a.action) ||
    !actions.includes(b.action) ||
    a.checkpoint > b.checkpoint ||
    !first.data().effects.some((e) => e.collection === 'stagingArtifacts' && e.id === id) ||
    !last
      .data()
      .effects.some(
        (e) => e.collection === 'stagingArtifacts' && e.id === id && e.hash === digest(v),
      ) ||
    !last
      .data()
      .effects.some(
        (e) => e.collection === 'staged-target' && e.id === id && e.hash === v.valueHash,
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
    if (nativeToken(full) !== nativeToken(metadata) || digest(full.data()) !== v.valueHash)
      inconsistent();
    data = full.data();
  }
  return { value: v, address, targetRef, metadata, data };
}
/** At cleanup all NEW descendants have already been removed by their ordered journal prefix. */
export async function checkAdventureStageChildren(
  store,
  tx,
  loaded,
  address,
  allowRegistered = false,
) {
  const a = adventureStageAddress(address);
  if (a.scope !== 'adventure' || a.path.length !== 2) return;
  const names =
    a.path[0] === 'scenes'
      ? ['body', 'planning', 'references']
      : a.path[0] === 'sceneBlocks'
        ? ['body']
        : a.path[0] === 'arcs'
          ? ['milestones']
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
        journal = await readWorkMetadata(
          tx,
          store.db.doc(loaded.ref.path + '/stagingArtifacts/' + id),
          ADVENTURE_STAGE_ARTIFACT_FIELDS,
        );
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
      closed(w, ['address'], ['value', 'mode', 'update']);
      const address = adventureStageAddress(w.address),
        id = adventureStageArtifactId(address),
        mode = w.mode ?? 'create';
      if (
        seen.has(id) ||
        !['create', 'ensure', 'update'].includes(mode) ||
        (mode === 'update'
          ? typeof w.update !== 'function' || Object.hasOwn(w, 'value')
          : !Object.hasOwn(w, 'value') || Object.hasOwn(w, 'update'))
      )
        inconsistent();
      seen.add(id);
      return {
        id,
        address,
        mode,
        update: w.update?.bind(w),
        value: mode === 'update' ? null : structuredClone(w.value),
        target: adventureStageTarget(store, loaded, address),
        journal: store.db.doc(loaded.ref.path + '/stagingArtifacts/' + id),
      };
    });
  for (const p of plans) {
    const [target, journal] = await Promise.all([
      readWorkMetadata(tx, p.target, ['schemaVersion', 'ownerId']),
      readWorkMetadata(tx, p.journal, ADVENTURE_STAGE_ARTIFACT_FIELDS),
    ]);
    let previous = null;
    if (p.mode === 'create') {
      if (target.exists || journal.exists) inconsistent();
    } else if (target.exists || journal.exists) {
      previous = await readAdventureStageArtifact(store, tx, loaded, journal, { withValue: true });
      if (p.mode === 'ensure') {
        if (digest(p.value) !== previous.value.valueHash) inconsistent();
        p.skip = true;
        continue;
      }
      p.value = p.update(structuredClone(previous.data));
    } else if (p.mode === 'update') inconsistent();
    const serialized = JSON.stringify(p.value);
    if (typeof serialized !== 'string' || Buffer.byteLength(serialized) > 900000)
      restoreFail('failed-precondition', 'native-compatibility');
    // Firestore may preserve updateTime for an identical replacement. Keep its proof too.
    if (previous && digest(p.value) === previous.value.valueHash) {
      p.skip = true;
      continue;
    }
    p.entry = {
      ...restoreContext(loaded, previous?.value.createdByOperationId ?? operationId),
      updatedByOperationId: operationId,
      address: p.address,
      valueHash: digest(p.value),
      sourceToken,
    };
    p.existing = Boolean(previous);
    if (!previous) await checkAdventureStageChildren(store, tx, loaded, p.address);
  }
  for (const p of plans.filter(
    (p) => !p.skip && p.address.scope === 'adventure' && p.address.path.length === 4,
  )) {
    const parent = { scope: 'adventure', path: p.address.path.slice(0, 2) },
      parentId = adventureStageArtifactId(parent);
    if (
      !plans.some(
        (candidate) => candidate.id === parentId && !candidate.skip && !candidate.existing,
      )
    ) {
      const journal = await readWorkMetadata(
        tx,
        store.db.doc(loaded.ref.path + '/stagingArtifacts/' + parentId),
        ADVENTURE_STAGE_ARTIFACT_FIELDS,
      );
      await readAdventureStageArtifact(store, tx, loaded, journal);
    }
  }
  const changed = plans.filter((p) => !p.skip);
  return {
    count: changed.filter((p) => !p.existing).length,
    effects: changed.flatMap((p) => [
      store.effect('stagingArtifacts', p.id, p.entry),
      { collection: 'staged-target', id: p.id, hash: p.entry.valueHash },
    ]),
    commit() {
      for (const p of changed) {
        if (p.existing) {
          tx.set(p.target, p.value);
          tx.set(p.journal, p.entry);
        } else {
          tx.create(p.target, p.value);
          tx.create(p.journal, p.entry);
        }
      }
    },
  };
}
