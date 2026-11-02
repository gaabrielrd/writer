import { createHash } from 'node:crypto';
import { adventureImageInput, adventureImageUseKey } from './adventureBlockImages.mjs';
import {
  workClosed,
  workFail,
  workId,
  workLimit,
  readWorkMetadata,
  digest,
} from './workProgressContracts.mjs';
import {
  adventureBackupScope,
  adventureBackupToken as token,
  adventureBackupIdentity as identity,
  adventureBackupChanged as changed,
  readAdventureBackupSource,
} from './adventureBackupSource.mjs';

export const ADVENTURE_IMAGE_LIMITS = Object.freeze({
  imageBytes: 16 * 1024 * 1024,
  chunkBytes: 65536,
});
const signature = '89504e470d0a1a0a',
  external = ['contentStorage', 'payloadStorage', 'bodyStorage'];
const bad = () =>
  workFail(
    'failed-precondition',
    'Vínculo ou arquivo da imagem inconsistente.',
    'adventure-backup-image-inconsistent',
  );
const invalid = () => workFail('invalid-argument', 'Pedido de imagem portátil inválido.');
const changedImage = () =>
  workFail(
    'failed-precondition',
    'A imagem mudou durante a captura.',
    'adventure-backup-image-changed',
  );
const type = (value) => {
  if (!['scene', 'block'].includes(value)) invalid();
  return value;
};
const collection = (c, kind) => c.path + (kind === 'scene' ? '/scenes' : '/sceneBlocks');
const fields = (kind) => [
  'ownerId',
  'schemaVersion',
  'deleting',
  'rebalancing',
  'sceneId',
  kind === 'scene' ? 'mainBlockImage' : 'image',
  ...external,
];
function owned(snapshot, c) {
  // Imported scenes can predate activation of the root. Asset authority comes
  // from the exact typed use born after the current root, checked separately.
  if (!identity(snapshot)) bad();
  const v = snapshot.data();
  if (
    !v ||
    v.ownerId !== c.uid ||
    v.schemaVersion !== 1 ||
    v.deleting ||
    v.rebalancing ||
    external.some((k) => Object.hasOwn(v, k))
  )
    bad();
  return v;
}
function stampAfterRoot(snapshot, root) {
  const s = identity(snapshot),
    r = identity(root).created;
  if (
    !s ||
    s.created.seconds < r.seconds ||
    (s.created.seconds === r.seconds && s.created.nanoseconds < r.nanoseconds)
  )
    bad();
  return s;
}
async function item(tx, c, sourceToken, kind, snapshot, root, content = false) {
  const v = owned(snapshot, c),
    resource = { kind, id: snapshot.id };
  let ancestor = null;
  if (kind === 'block') {
    let sceneId;
    try {
      sceneId = workId(v.sceneId);
    } catch {
      bad();
    }
    ancestor = await readWorkMetadata(tx, c.db.doc(c.path + '/scenes/' + sceneId), fields('scene'));
    owned(ancestor, c);
  }
  let image;
  try {
    image = adventureImageInput((kind === 'scene' ? v.mainBlockImage : v.image) ?? null);
  } catch {
    bad();
  }
  if (image && (!image.alt.isWellFormed() || !image.caption.isWellFormed())) bad();
  let library = null,
    use = null,
    path = null,
    own = {};
  if (image) {
    const ref = c.db.doc('users/' + c.uid + '/imageLibrary/' + image.imageId);
    library = await readWorkMetadata(tx, ref, [
      'id',
      'state',
      'useCount',
      'path',
      ...(content ? ['name', 'createdAt', 'updatedAt'] : []),
    ]);
    const asset = library.data();
    if (
      !library.exists ||
      !asset ||
      asset.state !== 'active' ||
      !Number.isSafeInteger(asset.useCount) ||
      asset.useCount < 1 ||
      (Object.hasOwn(asset, 'id') && asset.id !== image.imageId) ||
      asset.path !== 'book-covers/' + c.uid + '/' + image.imageId + '.png'
    )
      bad();
    path = asset.path;
    use = await readWorkMetadata(
      tx,
      c.db.doc(ref.path + '/uses/' + adventureImageUseKey(c.adventureId, resource)),
      ['kind', 'adventureId', 'resource.kind', 'resource.id'],
    );
    stampAfterRoot(use, root);
    const usage = use.data();
    if (
      !usage ||
      usage.kind !== 'adventure-block' ||
      usage.adventureId !== c.adventureId ||
      usage.resource?.kind !== kind ||
      usage.resource.id !== snapshot.id
    )
      bad();
    if (content) {
      if (
        Object.hasOwn(asset, 'name') &&
        (typeof asset.name !== 'string' || !asset.name.isWellFormed() || asset.name.length > 300)
      )
        bad();
      for (const key of ['createdAt', 'updatedAt'])
        if (Object.hasOwn(asset, key) && (!Number.isSafeInteger(asset[key]) || asset[key] < 0))
          bad();
      own = Object.fromEntries(
        ['name', 'createdAt', 'updatedAt']
          .filter((k) => Object.hasOwn(asset, k))
          .map((k) => [k, asset[k]]),
      );
    }
  }
  return {
    image,
    path,
    own,
    bindingToken: digest({
      version: 1,
      uid: c.uid,
      adventureId: c.adventureId,
      sourceToken,
      kind,
      id: snapshot.id,
      native: identity(snapshot),
      ancestor: ancestor ? identity(ancestor) : null,
      imageId: image?.imageId ?? null,
      library: library ? identity(library) : null,
      use: use ? identity(use) : null,
    }),
  };
}
function metadata(raw) {
  if (
    !raw ||
    !/^[1-9][0-9]{0,39}$/.test(raw.generation) ||
    typeof raw.generation !== 'string' ||
    !/^[1-9][0-9]{0,39}$/.test(raw.metageneration) ||
    typeof raw.metageneration !== 'string' ||
    !Number.isSafeInteger(raw.size) ||
    raw.size < 8 ||
    raw.size > ADVENTURE_IMAGE_LIMITS.imageBytes ||
    raw.contentType !== 'image/png' ||
    raw.accepted !== true
  )
    bad();
  return {
    generation: raw.generation,
    metageneration: raw.metageneration,
    size: raw.size,
    contentType: 'image/png',
    accepted: true,
  };
}
function cursor(input, c, kind, sourceToken) {
  if (input == null) return null;
  if (typeof input !== 'string' || input.length > 16000 || !/^[A-Za-z0-9_-]+$/.test(input))
    invalid();
  let value;
  try {
    value = JSON.parse(Buffer.from(input, 'base64url').toString());
  } catch {
    invalid();
  }
  workClosed(value, ['version', 'adventureId', 'kind', 'sourceToken', 'id']);
  if (
    Buffer.from(JSON.stringify(value)).toString('base64url') !== input ||
    value.version !== 1 ||
    value.adventureId !== c.adventureId ||
    value.kind !== kind ||
    value.sourceToken !== sourceToken
  )
    invalid();
  return workId(value.id);
}
export function createAdventureBackupImageService({ db, assets }) {
  const scope = (uid, data, keys) =>
    adventureBackupScope(db, uid, data, ['kind', 'sourceToken', ...keys]);
  async function binding(c, kind, id, sourceToken, expected, content = false) {
    return db.runTransaction(async (tx) => {
      const source = await readAdventureBackupSource(tx, c, sourceToken),
        snapshot = await readWorkMetadata(tx, db.doc(collection(c, kind) + '/' + id), fields(kind)),
        value = await item(tx, c, sourceToken, kind, snapshot, source.snapshot, content);
      if (value.bindingToken !== expected) changed(true);
      return { ...value, source: source.result };
    });
  }
  async function checked(p, expected) {
    const before = await binding(p.c, p.kind, p.id, p.sourceToken, p.bindingToken, true);
    let storage = null;
    if (before.image) {
      let raw;
      try {
        raw = await assets.metadata(before.path);
      } catch {
        workFail('not-found', 'Arquivo da imagem indisponível.');
      }
      storage = metadata(raw);
      await binding(p.c, p.kind, p.id, p.sourceToken, p.bindingToken);
    }
    const imageToken = digest({ version: 1, binding: before.bindingToken, storage });
    if (expected !== undefined && expected !== imageToken) changedImage();
    return { ...before, storage, imageToken };
  }
  function parameters(uid, data, keys) {
    const c = scope(uid, data, ['id', 'bindingToken', ...keys]);
    return {
      c,
      kind: type(data.kind),
      id: workId(data.id),
      sourceToken: token(data.sourceToken),
      bindingToken: token(data.bindingToken),
    };
  }
  return {
    async listAdventureBackupImageBindings(uid, data) {
      const c = scope(uid, data, ['cursor', 'limit']),
        kind = type(data.kind),
        sourceToken = token(data.sourceToken),
        limit = workLimit(data.limit),
        after = cursor(data.cursor, c, kind, sourceToken);
      return db.runTransaction(async (tx) => {
        const current = await readAdventureBackupSource(tx, c, sourceToken);
        let query = db
          .collection(collection(c, kind))
          .orderBy('__name__')
          .limit(limit + 1)
          .select(...fields(kind));
        if (after !== null) query = query.startAfter(after);
        const page = await tx.get(query),
          selected = page.docs.slice(0, limit),
          items = [];
        for (const snapshot of selected) {
          const value = await item(tx, c, sourceToken, kind, snapshot, current.snapshot);
          items.push({
            id: snapshot.id,
            imageId: value.image?.imageId ?? null,
            bindingToken: value.bindingToken,
          });
        }
        return {
          ...current.result,
          kind,
          items,
          nextCursor:
            page.docs.length > limit
              ? Buffer.from(
                  JSON.stringify({
                    version: 1,
                    adventureId: c.adventureId,
                    kind,
                    sourceToken,
                    id: selected.at(-1).id,
                  }),
                ).toString('base64url')
              : null,
        };
      });
    },
    async getAdventureBackupImage(uid, data) {
      const p = parameters(uid, data, []),
        state = await checked(p);
      if (!state.image)
        return { ...state.source, imageToken: state.imageToken, image: { kind: 'none' } };
      let hashed;
      try {
        hashed = await assets.hashGeneration(
          state.path,
          state.storage.generation,
          ADVENTURE_IMAGE_LIMITS.imageBytes,
        );
      } catch {
        workFail('not-found', 'Não foi possível ler os bytes da imagem.');
      }
      await checked(p, state.imageToken);
      if (
        !hashed ||
        hashed.byteLength !== state.storage.size ||
        hashed.signature !== signature ||
        typeof hashed.contentHash !== 'string' ||
        !/^[a-f0-9]{64}$/.test(hashed.contentHash)
      )
        bad();
      return {
        ...state.source,
        imageToken: state.imageToken,
        image: {
          kind: 'library',
          ...state.image,
          ...state.own,
          contentType: 'image/png',
          byteLength: hashed.byteLength,
          chunkCount: Math.ceil(hashed.byteLength / ADVENTURE_IMAGE_LIMITS.chunkBytes),
          contentHash: hashed.contentHash,
        },
      };
    },
    async readAdventureBackupImageChunk(uid, data) {
      const p = parameters(uid, data, ['imageToken', 'index']),
        expected = token(data.imageToken),
        index = data.index;
      if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= ADVENTURE_IMAGE_LIMITS.imageBytes / ADVENTURE_IMAGE_LIMITS.chunkBytes
      )
        invalid();
      const state = await checked(p, expected);
      if (!state.image) bad();
      const start = index * ADVENTURE_IMAGE_LIMITS.chunkBytes,
        end = Math.min(start + ADVENTURE_IMAGE_LIMITS.chunkBytes, state.storage.size) - 1;
      if (start > end) invalid();
      let bytes;
      try {
        bytes = await assets.readRange(state.path, state.storage.generation, start, end);
      } catch {
        workFail('not-found', 'Parte da imagem indisponível.');
      }
      await checked(p, expected);
      if (!Buffer.isBuffer(bytes) || bytes.length !== end - start + 1) bad();
      return {
        ...state.source,
        imageToken: expected,
        index,
        chunkBase64: bytes.toString('base64'),
        chunkHash: createHash('sha256').update(bytes).digest('hex'),
      };
    },
    async verifyAdventureBackupImage(uid, data) {
      const p = parameters(uid, data, ['imageToken']),
        expected = token(data.imageToken),
        state = await checked(p, expected);
      return { ...state.source, imageToken: state.imageToken };
    },
  };
}
