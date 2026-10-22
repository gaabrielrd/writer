import { createHash } from 'node:crypto';
import { digest, workFail } from './workProgressContracts.mjs';
import { readActiveLibraryImage } from './imageLibrary.mjs';
import {
  bookBackupScope,
  bookBackupToken,
  bookBackupIdentity,
  readBookBackupSource,
} from './bookBackupContext.mjs';
import {
  BOOK_COVER_LIMITS,
  BOOK_COVER_PNG_SIGNATURE,
  validBookCoverId,
  validateBookBackupCover,
} from './bookBackupCover.mjs';
const inconsistent = () =>
  workFail('failed-precondition', 'O vínculo ou arquivo da capa está inconsistente.');
function changed() {
  workFail(
    'failed-precondition',
    'A capa mudou durante a captura. Faça um novo backup.',
    'book-backup-cover-changed',
  );
}
function storageMetadata(value) {
  if (
    !value ||
    typeof value.generation !== 'string' ||
    !/^[1-9][0-9]{0,39}$/.test(value.generation) ||
    typeof value.metageneration !== 'string' ||
    !/^[1-9][0-9]{0,39}$/.test(value.metageneration) ||
    !Number.isSafeInteger(value.size) ||
    value.size < 8 ||
    value.size > BOOK_COVER_LIMITS.imageBytes ||
    value.contentType !== 'image/png' ||
    value.accepted !== true
  )
    inconsistent();
  return {
    generation: value.generation,
    metageneration: value.metageneration,
    size: value.size,
    contentType: value.contentType,
    accepted: true,
  };
}
export function createBookBackupCoverService({ db, assets }) {
  async function binding(context, sourceToken) {
    return db.runTransaction(async (tx) => {
      const current = await readBookBackupSource(tx, context, sourceToken),
        imageId = current.root.coverImageId ?? null;
      if (imageId === null || imageId === '') {
        if (current.root.coverUrl != null && typeof current.root.coverUrl !== 'string')
          inconsistent();
        const kind = current.root.coverUrl ? 'legacy-unavailable' : 'none';
        return {
          source: current.result,
          kind,
          key: digest({ uid: context.uid, sourceToken, kind }),
        };
      }
      if (!validBookCoverId(imageId)) inconsistent();
      const image = await readActiveLibraryImage(tx, db, context.uid, imageId),
        use = await tx.get(db.doc(image.ref.path + '/uses/' + context.target.id));
      if (
        image.value.useCount < 1 ||
        !use.exists ||
        use.data()?.bookId !== context.target.id ||
        image.value.path !== 'book-covers/' + context.uid + '/' + imageId + '.png'
      )
        inconsistent();
      const own = Object.fromEntries(
        ['name', 'createdAt', 'updatedAt']
          .filter((key) => Object.hasOwn(image.value, key))
          .map((key) => [key, image.value[key]]),
      );
      return {
        source: current.result,
        kind: 'library',
        imageId,
        own,
        path: image.value.path,
        key: digest({
          uid: context.uid,
          sourceToken,
          imageId,
          path: image.value.path,
          image: bookBackupIdentity(image.snapshot),
          use: bookBackupIdentity(use),
        }),
      };
    });
  }
  async function checked(context, sourceToken, expected) {
    const before = await binding(context, sourceToken);
    let storage = null;
    if (before.kind === 'library') {
      let raw;
      try {
        raw = await assets.metadata(before.path);
      } catch {
        workFail('not-found', 'Arquivo da capa indisponível.');
      }
      storage = storageMetadata(raw);
      const after = await binding(context, sourceToken);
      if (after.key !== before.key) changed();
    }
    const coverToken = digest({ version: 1, binding: before.key, storage });
    if (expected !== undefined && expected !== coverToken) changed();
    return { ...before, storage, coverToken };
  }
  function scope(uid, data, keys) {
    const context = bookBackupScope(db, uid, data, ['sourceToken', ...keys]);
    return { context, sourceToken: bookBackupToken(data.sourceToken) };
  }
  return {
    async getBookBackupCover(uid, data) {
      const { context, sourceToken } = scope(uid, data, []),
        state = await checked(context, sourceToken);
      if (state.kind !== 'library')
        return { ...state.source, coverToken: state.coverToken, cover: { kind: state.kind } };
      let hashed;
      try {
        hashed = await assets.hashGeneration(
          state.path,
          state.storage.generation,
          BOOK_COVER_LIMITS.imageBytes,
        );
      } catch {
        workFail('not-found', 'Não foi possível ler os bytes da capa.');
      }
      await checked(context, sourceToken, state.coverToken);
      if (
        !hashed ||
        hashed.byteLength !== state.storage.size ||
        hashed.signature !== BOOK_COVER_PNG_SIGNATURE
      )
        inconsistent();
      let cover;
      try {
        cover = validateBookBackupCover({
          kind: 'library',
          imageId: state.imageId,
          ...state.own,
          contentType: 'image/png',
          byteLength: hashed.byteLength,
          chunkCount: Math.ceil(hashed.byteLength / BOOK_COVER_LIMITS.chunkBytes),
          contentHash: hashed.contentHash,
        });
      } catch {
        inconsistent();
      }
      return { ...state.source, coverToken: state.coverToken, cover };
    },
    async readBookBackupCoverChunk(uid, data) {
      const { context, sourceToken } = scope(uid, data, ['coverToken', 'index']),
        expected = bookBackupToken(data.coverToken);
      if (
        !Number.isSafeInteger(data.index) ||
        data.index < 0 ||
        data.index >= BOOK_COVER_LIMITS.imageBytes / BOOK_COVER_LIMITS.chunkBytes
      )
        workFail('invalid-argument', 'Parte da capa inválida.');
      const state = await checked(context, sourceToken, expected);
      if (state.kind !== 'library')
        workFail('failed-precondition', 'Este livro não tem bytes de capa capturáveis.');
      const start = data.index * BOOK_COVER_LIMITS.chunkBytes,
        end = Math.min(start + BOOK_COVER_LIMITS.chunkBytes, state.storage.size) - 1;
      if (start > end) workFail('invalid-argument', 'Parte fora da capa.');
      let bytes;
      try {
        bytes = await assets.readRange(state.path, state.storage.generation, start, end);
      } catch {
        workFail('not-found', 'Parte da capa indisponível.');
      }
      await checked(context, sourceToken, expected);
      if (!Buffer.isBuffer(bytes) || bytes.length !== end - start + 1) inconsistent();
      return {
        ...state.source,
        coverToken: expected,
        index: data.index,
        chunkBase64: bytes.toString('base64'),
        chunkHash: createHash('sha256').update(bytes).digest('hex'),
      };
    },
    async verifyBookBackupCover(uid, data) {
      const { context, sourceToken } = scope(uid, data, ['coverToken']),
        expected = bookBackupToken(data.coverToken),
        state = await checked(context, sourceToken, expected);
      return { ...state.source, coverToken: state.coverToken };
    },
  };
}
export function setBookBackupCoverHeaders(method, request) {
  if (['getBookBackupCover', 'readBookBackupCoverChunk', 'verifyBookBackupCover'].includes(method))
    request.rawRequest.res.setHeader('Cache-Control', 'private, no-store');
}
