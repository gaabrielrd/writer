import { createHash } from 'node:crypto';
import { createBookBackupAssetStorage } from './bookBackupAssetStorage.mjs';
import {
  bookRestoreCoverStorageContext,
  bookRestoreStorageProof,
} from './bookRestoreCoverStorageContracts.mjs';
const fail = () => {
  throw new Error('Restored cover Storage identity conflict.');
};
const same = (a, b) => a.generation === b.generation && a.metageneration === b.metageneration;
export function createBookRestoreCoverStorage(bucket) {
  function pinned(path, generation) {
    const file = bucket().file(path, {
      generation,
      preconditionOpts: { ifGenerationMatch: generation },
    });
    // The SDK coerces constructor generation to Number. Keep the exact decimal on the wire.
    file.interceptors.push({
      request(options) {
        return { ...options, qs: { ...options.qs, generation } };
      },
    });
    return file;
  }
  const reads = createBookBackupAssetStorage(() => ({
    file(path, options) {
      return options?.generation ? pinned(path, options.generation) : bucket().file(path);
    },
  }));
  const path = (c) => 'book-covers/' + c.ownerId + '/' + c.imageId + '.png';
  const identity = (c) => ({
    writerRestoreSchema: '1',
    ownerId: c.ownerId,
    restoreId: c.restoreId,
    jobToken: c.jobToken,
    imageId: c.imageId,
    contentHash: c.contentHash,
    byteLength: String(c.byteLength),
    accepted: 'false',
  });
  function inspect(c, m) {
    const expected = identity(c),
      extra = m?.metadata;
    if (
      !m ||
      !extra ||
      Object.entries(expected).some(([k, v]) => extra[k] !== v) ||
      Object.hasOwn(extra, 'firebaseStorageDownloadTokens') ||
      m.cacheControl !== 'private, no-store'
    )
      fail();
    const proof = bookRestoreStorageProof({
      generation: String(m.generation),
      metageneration: String(m.metageneration),
    });
    if (extra.restoreState === 'prepared') {
      if (
        m.contentType !== 'image/png' ||
        Number(m.size) !== c.byteLength ||
        Object.keys(extra).length !== Object.keys(expected).length + 1
      )
        fail();
    } else if (extra.restoreState === 'fenced') {
      if (
        m.contentType !== 'application/octet-stream' ||
        Number(m.size) !== 0 ||
        Object.keys(extra).length !== Object.keys(expected).length + 3 ||
        !['replacedGeneration', 'replacedMetageneration'].every(
          (k) => extra[k] === '' || /^[1-9][0-9]{0,39}$/.test(extra[k]),
        ) ||
        (extra.replacedGeneration === '') !== (extra.replacedMetageneration === '')
      )
        fail();
    } else fail();
    return {
      proof,
      state: extra.restoreState,
      previous: extra.replacedGeneration
        ? { generation: extra.replacedGeneration, metageneration: extra.replacedMetageneration }
        : null,
    };
  }
  async function head(c) {
    try {
      const [m] = await bucket().file(path(c)).getMetadata();
      return inspect(c, m);
    } catch (error) {
      if (error.code === 404) return null;
      throw error;
    }
  }
  async function save(c, bytes, metadata, preconditions) {
    return bucket()
      .file(path(c))
      .save(bytes, {
        resumable: false,
        validation: 'crc32c',
        preconditionOpts: preconditions,
        metadata: {
          contentType: bytes.length ? 'image/png' : 'application/octet-stream',
          cacheControl: 'private, no-store',
          metadata: { ...identity(c), ...metadata },
        },
      });
  }
  return {
    async stage(input, bytes) {
      const c = bookRestoreCoverStorageContext(input);
      if (
        !Buffer.isBuffer(bytes) ||
        bytes.length !== c.byteLength ||
        createHash('sha256').update(bytes).digest('hex') !== c.contentHash
      )
        fail();
      const existing = await head(c);
      if (existing?.state === 'fenced') fail();
      // Read before creation to avoid needless writes on recovery. The conditional write still closes the race.
      if (!existing)
        try {
          await save(c, bytes, { restoreState: 'prepared' }, { ifGenerationMatch: 0 });
        } catch (error) {
          if (error.code !== 412) throw error;
        }
      const state = await head(c);
      if (!state || state.state !== 'prepared') fail();
      const hashed = await reads.hashGeneration(path(c), state.proof.generation, c.byteLength);
      if (hashed.byteLength !== c.byteLength || hashed.contentHash !== c.contentHash) fail();
      const after = await head(c);
      if (!after || after.state !== 'prepared' || !same(state.proof, after.proof)) fail();
      return state.proof;
    },
    async verify(input, proof) {
      const c = bookRestoreCoverStorageContext(input),
        expected = bookRestoreStorageProof(proof),
        state = await head(c);
      if (!state || state.state !== 'prepared' || !same(state.proof, expected)) fail();
      return state.proof;
    },
    async fence(input, expected = null) {
      const c = bookRestoreCoverStorageContext(input);
      if (expected !== null) bookRestoreStorageProof(expected);
      for (let attempt = 0; attempt < 4; attempt++) {
        const current = await head(c);
        if (current?.state === 'fenced') {
          if (expected !== null && (!current.previous || !same(current.previous, expected))) fail();
          if (current.previous) {
            // A versioned bucket may retain the payload after replacement. Pin its generation.
            const old = pinned(path(c), current.previous.generation);
            let previous;
            try {
              const [metadata] = await old.getMetadata();
              previous = inspect(c, metadata);
            } catch (error) {
              if (error.code !== 404) throw error;
            }
            if (previous) {
              if (previous.state !== 'prepared' || !same(previous.proof, current.previous)) fail();
              await old.delete({ ignoreNotFound: true });
            }
          }
          const after = await head(c);
          if (!after || after.state !== 'fenced' || !same(after.proof, current.proof)) fail();
          return current.proof;
        }
        if (expected !== null && (!current || !same(current.proof, expected))) fail();
        try {
          await save(
            c,
            Buffer.alloc(0),
            {
              restoreState: 'fenced',
              replacedGeneration: current?.proof.generation ?? '',
              replacedMetageneration: current?.proof.metageneration ?? '',
            },
            {
              ifGenerationMatch: current?.proof.generation ?? 0,
              ...(current ? { ifMetagenerationMatch: current.proof.metageneration } : {}),
            },
          );
        } catch (error) {
          if (error.code !== 412) throw error;
        }
      }
      fail();
    },
  };
}
