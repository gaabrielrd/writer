import { readWorkMetadata } from './workProgressContracts.mjs';
import {
  ADVENTURE_RESTORE_CHUNK_BYTES as chunkBytes,
  chunkId,
  inconsistent,
  nativeToken,
  digest,
  bornEqual,
} from './adventureRestoreContracts.mjs';
import { readAdventureRestoreChunk, readAdventureRestoreProof } from './adventureRestoreChunks.mjs';
import { assertAdventureValidationPin } from './adventureRestoreValidationState.mjs';
const fields = [
  'schemaVersion',
  'ownerId',
  'restoreId',
  'jobToken',
  'createdByOperationId',
  'index',
  'byteLength',
  'chunkHash',
  'previousChainHash',
  'chainHash',
];
/** Per-step private cache. No body or SHA checkpoint is returned by public progress. */
export function createAdventureValidationSource(store, initial) {
  const cache = new Map(),
    observations = new Map(),
    size = initial.job.source.byteLength;
  async function chunk(index) {
    if (cache.has(index)) return cache.get(index);
    if (cache.size >= 160) inconsistent();
    const item = await store.db.runTransaction(async (tx) => {
      const loaded = await store.load(tx, initial.uid, initial.id, initial.view.jobToken);
      assertAdventureValidationPin(loaded, initial);
      const part = await readAdventureRestoreChunk(store, tx, loaded, index),
        proof = await readAdventureRestoreProof(store, tx, loaded, index, part),
        value = part.snapshot.data();
      return {
        bytes: Buffer.from(part.bytes),
        proof: part.proof,
        observation: {
          ref: part.snapshot.ref,
          token: nativeToken(part.snapshot),
          hash: digest(value),
          metadata: Object.fromEntries(fields.map((k) => [k, value[k]])),
          proofRef: proof.snapshot.ref,
          proofToken: nativeToken(proof.snapshot),
          proofHash: digest(proof.value),
        },
      };
    });
    observations.set(index, item.observation);
    cache.set(index, item);
    return item;
  }
  return {
    source: Object.freeze({
      size,
      async read(offset, length) {
        if (
          !Number.isSafeInteger(offset) ||
          !Number.isSafeInteger(length) ||
          offset < 0 ||
          length < 0 ||
          length > 81920 ||
          offset + length > size
        )
          inconsistent();
        const out = Buffer.alloc(length);
        let used = 0;
        while (used < length) {
          const at = offset + used,
            index = Math.floor(at / chunkBytes),
            part = await chunk(index),
            begin = at % chunkBytes,
            amount = Math.min(part.bytes.length - begin, length - used);
          part.bytes.copy(out, used, begin, begin + amount);
          used += amount;
        }
        return out;
      },
    }),
    chunk,
    async verify(tx, loaded) {
      assertAdventureValidationPin(loaded, initial);
      for (const observation of observations.values()) {
        const meta = await readWorkMetadata(tx, observation.ref, fields);
        if (
          !meta.exists ||
          nativeToken(meta) !== observation.token ||
          digest(meta.data()) !== digest(observation.metadata)
        )
          inconsistent();
        const creator = await tx.get(store.refs.op(loaded.uid, meta.data().createdByOperationId));
        if (
          !creator.exists ||
          !bornEqual(creator, meta) ||
          store.operation(creator, loaded).action !== 'appendAdventureRestoreChunk' ||
          !creator
            .data()
            .effects.some(
              (e) => e.collection === 'chunks' && e.id === meta.id && e.hash === observation.hash,
            )
        )
          inconsistent();
        const proof = await tx.get(observation.proofRef);
        if (
          nativeToken(proof) !== observation.proofToken ||
          digest(await store.artifact(tx, loaded, 'integrityProofs', proof)) !==
            observation.proofHash
        )
          inconsistent();
      }
    },
  };
}
/** Membership is checked in the confirming transaction, including the lookahead and the final tail. */
export async function verifyAdventureValidationMembership(store, tx, loaded, from, end) {
  for (const name of ['chunks', 'integrityProofs']) {
    let q = store.db
      .collection(loaded.ref.path + '/' + name)
      .select('index')
      .orderBy('__name__')
      .limit(end - from + 1);
    if (from) q = q.startAfter(chunkId(from - 1));
    const page = await tx.get(q),
      expected = end - from + Number(end < loaded.job.checkedChunks);
    if (
      page.docs.length !== expected ||
      page.docs.some((s, at) => s.id !== chunkId(from + at) || s.data().index !== from + at)
    )
      inconsistent();
  }
}
