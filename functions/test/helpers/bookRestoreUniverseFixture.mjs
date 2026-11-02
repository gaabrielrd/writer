import {
  personasRestoreFixture,
  readyRestorePersonas,
  finishRestorePersonas,
} from './bookRestorePersonasFixture.mjs';
import { record } from './bookContentFixture.mjs';
export function universeRestoreFixture(origin = { kind: 'none' }) {
  const records = personasRestoreFixture().records;
  const meta = records.findIndex((r) => r.kind === 'book-metadata'),
    value = JSON.parse(new TextDecoder().decode(records[meta].payload));
  value.book.universeId = origin.kind === 'none' ? null : origin.id;
  records[meta] = record('book-metadata', 'book', value);
  const at = records.findIndex((r) => r.kind === 'book-universe');
  records[at] = record('book-universe', 'book', { schemaVersion: 1, origin });
  return records;
}
export async function readyRestoreUniverse(factory, uid, id, origin = { kind: 'none' }) {
  const p = await readyRestorePersonas(factory, uid, id, universeRestoreFixture(origin));
  return finishRestorePersonas(factory, uid, id, p);
}
export async function loadUniversePlanItem(api, uid, id, p) {
  const reader = await api.openVerifiedBookRestoreContent(uid, {
    restoreId: id,
    jobToken: p.jobToken,
  });
  return reader.readMappedItem(p.preparation.universe.itemIndex);
}
export async function loadedRestore(db, tx, uid, id, p) {
  const ref = db.doc('users/' + uid + '/bookRestores/' + id),
    snapshot = await tx.get(ref);
  return { ref, snapshot, job: snapshot.data(), view: { jobToken: p.jobToken } };
}
