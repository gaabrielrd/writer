import { workId, workFail, digest, readWorkMetadata } from './workProgressContracts.mjs';
import {
  normalizePersonaCatalogState,
  nextPersonaCatalogState,
} from './personaCatalogProtocol.mjs';
import { DEFAULT_PERSONAS } from './personaProfile.mjs';
const presetDefinition = digest(DEFAULT_PERSONAS);
function stamp(snapshot, key) {
  const value = snapshot[key];
  if (!Number.isSafeInteger(value?.seconds) || !Number.isSafeInteger(value?.nanoseconds))
    workFail('failed-precondition', 'Versão nativa do catálogo de personas indisponível.');
  return [value.seconds, value.nanoseconds];
}
const ref = (db, uid) => db.doc('users/' + workId(uid) + '/aiPersonaCatalog/current');
export async function readPersonaCatalogFence(tx, db, uid) {
  const row = await readWorkMetadata(tx, ref(db, uid), ['schemaVersion', 'revision']);
  const state = normalizePersonaCatalogState(row.exists ? row.data() : null);
  return {
    ...state,
    presetDefinition,
    birth: row.exists ? stamp(row, 'createTime') : null,
    changed: row.exists ? stamp(row, 'updateTime') : null,
  };
}
// Prepare inside each transaction attempt, before any write; no tx object cache.
export async function preparePersonaCatalogWrite(tx, db, uid) {
  const target = ref(db, uid),
    row = await tx.get(target);
  const next = nextPersonaCatalogState(row.exists ? row.data() : null);
  let committed = false;
  return {
    revision: next.revision,
    commit() {
      if (committed) return;
      committed = true;
      tx.set(target, next);
    },
  };
}
