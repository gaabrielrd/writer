import { doc, runTransaction } from 'firebase/firestore';
import { nextPersonaCatalogState } from '../../../functions/src/personaCatalogProtocol.mjs';
async function mutate(db, reference, value, update) {
  const uid = reference.path.split('/')[1];
  const catalog = doc(db, 'users', uid, 'aiPersonaCatalog', 'current');
  return runTransaction(db, async (tx) => {
    const previous = await tx.get(catalog);
    const next = nextPersonaCatalogState(previous.exists() ? previous.data() : null);
    if (update) tx.update(reference, value);
    else tx.set(reference, value);
    tx.set(catalog, next);
  });
}
export const setPersonaWithCatalog = (db, reference, value) => mutate(db, reference, value, false);
export const updatePersonaWithCatalog = (db, reference, value) =>
  mutate(db, reference, value, true);
