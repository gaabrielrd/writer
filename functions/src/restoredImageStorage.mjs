import { createHash, randomUUID } from 'node:crypto';
import { createBookBackupAssetStorage } from './bookBackupAssetStorage.mjs';
import {
  bookRestoreCoverStorageContext,
  bookRestoreStorageProof,
} from './bookRestoreCoverStorageContracts.mjs';
const fail = () => {
  throw new Error('Restored cover Storage identity conflict.');
};
const same = (a, b) => a.generation === b.generation && a.metageneration === b.metageneration;
export function createRestoredImageStorage(bucket) {
  function pinned(path, generation, metageneration = null) {
    const file = bucket().file(path, {
      generation,
      preconditionOpts: {
        ifGenerationMatch: generation,
        ...(metageneration === null ? {} : { ifMetagenerationMatch: metageneration }),
      },
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
    } else if (extra.restoreState === 'retired') {
      if (
        m.contentType !== 'application/octet-stream' ||
        Number(m.size) !== 0 ||
        Object.keys(extra).length !== Object.keys(expected).length + 5
      )
        fail();
      const prepared = bookRestoreStorageProof({
          generation: extra.preparedGeneration,
          metageneration: extra.preparedMetageneration,
        }),
        replaced = bookRestoreStorageProof({
          generation: extra.replacedGeneration,
          metageneration: extra.replacedMetageneration,
        });
      if (
        replaced.generation !== prepared.generation ||
        ![prepared.metageneration, String(BigInt(prepared.metageneration) + 1n)].includes(
          replaced.metageneration,
        )
      )
        fail();
      return { proof, state: 'retired', previous: replaced, prepared };
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
  function accepted(c, expected, metadata) {
    const extra = metadata?.metadata,
      base = { ...identity(c), accepted: 'true' },
      token = extra?.firebaseStorageDownloadTokens,
      name = bucket().name;
    if (
      !extra ||
      Object.entries(base).some(([key, value]) => extra[key] !== value) ||
      Object.keys(extra).length !== Object.keys(base).length + 3 ||
      extra.restoreState !== 'active' ||
      extra.preparedMetageneration !== expected.metageneration ||
      typeof token !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(token) ||
      metadata.cacheControl !== 'private, no-store' ||
      metadata.contentType !== 'image/png' ||
      Number(metadata.size) !== c.byteLength ||
      typeof name !== 'string' ||
      !name
    )
      fail();
    const proof = bookRestoreStorageProof({
      generation: String(metadata.generation),
      metageneration: String(metadata.metageneration),
    });
    if (
      proof.generation !== expected.generation ||
      proof.metageneration !== String(BigInt(expected.metageneration) + 1n)
    )
      fail();
    return {
      proof,
      url:
        'https://firebasestorage.googleapis.com/v0/b/' +
        encodeURIComponent(name) +
        '/o/' +
        encodeURIComponent(path(c)) +
        '?alt=media&token=' +
        token,
    };
  }
  function original(c, prepared, metadata) {
    if (metadata?.metadata?.restoreState === 'active')
      return { proof: accepted(c, prepared, metadata).proof, state: 'active' };
    const state = inspect(c, metadata);
    if (state.state !== 'prepared' || !same(state.proof, prepared)) fail();
    return state;
  }
  async function metadata(c, generation = null) {
    try {
      const [value] = await (
        generation === null ? bucket().file(path(c)) : pinned(path(c), generation)
      ).getMetadata();
      return value;
    } catch (error) {
      if (error.code === 404) return null;
      throw error;
    }
  }
  return {
    async retire(input, proof, publishedProof = null) {
      const c = bookRestoreCoverStorageContext(input),
        prepared = bookRestoreStorageProof(proof),
        published = publishedProof === null ? null : bookRestoreStorageProof(publishedProof);
      if (
        published !== null &&
        (published.generation !== prepared.generation ||
          published.metageneration !== String(BigInt(prepared.metageneration) + 1n))
      )
        fail();
      for (let attempt = 0; attempt < 4; attempt++) {
        const currentMetadata = await metadata(c);
        if (currentMetadata?.metadata?.restoreState === 'retired') {
          const marker = inspect(c, currentMetadata);
          if (!same(marker.prepared, prepared)) fail();
          const previousMetadata = await metadata(c, marker.previous.generation);
          if (previousMetadata !== null) {
            const previous = original(c, prepared, previousMetadata);
            if (published !== null && !same(previous.proof, published)) fail();
            // A prepared version may have completed its one authorized PATCH while retired.
            await pinned(path(c), previous.proof.generation, previous.proof.metageneration).delete({
              ignoreNotFound: true,
            });
          }
          const afterMetadata = await metadata(c);
          if (afterMetadata === null) fail();
          const after = inspect(c, afterMetadata);
          if (
            after.state !== 'retired' ||
            !same(after.proof, marker.proof) ||
            !same(after.prepared, prepared)
          )
            fail();
          return marker.proof;
        }
        const current = currentMetadata === null ? null : original(c, prepared, currentMetadata);
        if (published !== null && current !== null && !same(current.proof, published)) fail();
        try {
          await save(
            c,
            Buffer.alloc(0),
            {
              restoreState: 'retired',
              preparedGeneration: prepared.generation,
              preparedMetageneration: prepared.metageneration,
              replacedGeneration: current?.proof.generation ?? prepared.generation,
              replacedMetageneration: current?.proof.metageneration ?? prepared.metageneration,
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
    async accept(input, proof) {
      const c = bookRestoreCoverStorageContext(input),
        expected = bookRestoreStorageProof(proof);
      const [metadata] = await bucket().file(path(c)).getMetadata();
      if (metadata?.metadata?.restoreState === 'active') return accepted(c, expected, metadata);
      const current = inspect(c, metadata);
      if (current.state !== 'prepared' || !same(current.proof, expected)) fail();
      if (typeof bucket().name !== 'string' || !bucket().name) fail();
      try {
        await pinned(path(c), expected.generation, expected.metageneration).setMetadata({
          metadata: {
            ...identity(c),
            accepted: 'true',
            restoreState: 'active',
            preparedMetageneration: expected.metageneration,
            firebaseStorageDownloadTokens: randomUUID(),
          },
        });
      } catch (error) {
        if (error.code !== 412) throw error;
      }
      const [after] = await bucket().file(path(c)).getMetadata();
      return accepted(c, expected, after);
    },
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
        if (current?.state === 'retired') fail();
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
