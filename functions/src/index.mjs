import { randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { defineSecret, defineString, defineInt } from 'firebase-functions/params';
import { createImageLibraryService } from './imageLibrary.mjs';
import { normalizeCover } from './normalizeCover.mjs';
import { createGenerationService, generationPrompt, GenerationError } from './generation.mjs';

initializeApp();
const key = defineSecret('BOOK_GENERATION_GEMINI_KEY');
const textModel = defineString('BOOK_SYNOPSIS_MODEL', { default: 'gemini-3.7-flash' });
const imageModel = defineString('BOOK_COVER_MODEL', { default: 'gemini-3.1-flash-image' });
const synopsisCost = defineInt('BOOK_SYNOPSIS_CREDITS', { default: 1 });
const coverCost = defineInt('BOOK_COVER_CREDITS', { default: 5 });
const db = getFirestore();
const bucket = () => getStorage().bucket();
const assets = {
  async exists(path) {
    return (await bucket().file(path).exists())[0];
  },
  async save(path, bytes) {
    const image = await normalizeCover(bytes);
    const token = randomUUID();
    await bucket()
      .file(path)
      .save(image, {
        resumable: false,
        metadata: {
          contentType: 'image/png',
          metadata: { firebaseStorageDownloadTokens: token, accepted: 'false' },
        },
      });
    return `https://firebasestorage.googleapis.com/v0/b/${bucket().name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  },
  async preview(path) {
    const [bytes] = await bucket().file(path).download();
    return `data:image/png;base64,${bytes.toString('base64')}`;
  },
  async publish(path) {
    const file = bucket().file(path);
    const [metadata] = await file.getMetadata();
    await file.setMetadata({ metadata: { ...metadata.metadata, accepted: 'true' } });
  },
  async remove(path) {
    await bucket().file(path).delete({ ignoreNotFound: true });
  },
};
async function generator(context) {
  const model = context.kind === 'cover' ? imageModel.value() : textModel.value();
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error('Modelo inválido.');
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key.value() },
      signal: AbortSignal.timeout(90000),
      body: JSON.stringify({
        contents: [{ parts: [{ text: generationPrompt(context) }] }],
        generationConfig:
          context.kind === 'cover'
            ? {
                responseModalities: ['IMAGE'],
                imageConfig: { aspectRatio: '2:3', imageSize: '1K' },
              }
            : {
                maxOutputTokens: 2048,
                temperature: 0.7,
                thinkingConfig: { thinkingLevel: 'low' },
              },
      }),
    },
  );
  if (!response.ok) throw new Error('Falha no provedor.');
  const data = await response.json();
  if (context.kind === 'synopsis' && data.candidates?.[0]?.finishReason === 'MAX_TOKENS')
    throw new Error('Sinopse interrompida pelo limite de tokens.');
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  if (context.kind === 'synopsis')
    return {
      text: parts
        .map((part) => part.text ?? '')
        .join('')
        .trim(),
    };
  const image = parts.find((part) =>
    /^image\/(png|jpeg|webp)$/.test(part.inlineData?.mimeType ?? ''),
  )?.inlineData;
  if (!image?.data || image.data.length > 16000000) throw new Error('Imagem inválida.');
  return { image: Buffer.from(image.data, 'base64') };
}
function service() {
  return createGenerationService({
    db,
    generator,
    assets,
    costs: { synopsis: synopsisCost.value(), cover: coverCost.value() },
  });
}
const callable = (method, secrets = []) =>
  onCall(
    {
      region: 'us-central1',
      enforceAppCheck: true,
      timeoutSeconds: 120,
      memory: '512MiB',
      maxInstances: 5,
      secrets,
    },
    async (request) => {
      try {
        const handler = service()[method] ? service() : createImageLibraryService({ db, assets });
        return await handler[method](request.auth?.uid, request.data);
      } catch (error) {
        if (error instanceof GenerationError) throw new HttpsError(error.code, error.message);
        throw new HttpsError(
          'unavailable',
          'Serviço temporariamente indisponível. Tente novamente.',
        );
      }
    },
  );
export const bookGenerationQuote = callable('quote');
export const generateBookAsset = callable('generate', [key]);
export const acceptBookAsset = callable('accept');
export const discardBookAsset = callable('discard');
export const createBookWithCover = callable('createWithCover');
export const listLibraryImages = callable('list');
export const renameLibraryImage = callable('rename');
export const deleteLibraryImage = callable('remove');
export const saveBookImage = callable('saveBook');
export const migrateImageLibrary = callable('migrate');
export const cleanupDeletedBookCover = onDocumentDeleted(
  { document: 'books/{bookId}', region: 'us-central1', retry: true },
  async (event) => {
    const uid = event.data?.data().authorId;
    if (!uid) return;
    const library = createImageLibraryService({ db, assets });
    const id = event.data.data().coverImageId;
    if (id) await library.detach(uid, event.params.bookId, id);
    else {
      const records = await db
        .collection(`users/${uid}/bookGenerations`)
        .where('bookId', '==', event.params.bookId)
        .get();
      for (const record of records.docs) await library.importAccepted(uid, record.id);
    }
  },
);
export const cleanupBookAssets = onSchedule(
  { schedule: 'every 60 minutes', region: 'us-central1', maxInstances: 1 },
  async () => {
    const expired = await db
      .collectionGroup('bookGenerations')
      .where('expiresAt', '<=', Date.now())
      .limit(100)
      .get();
    for (const document of expired.docs) {
      const previous = document.data();
      if (previous.kind === 'cover' && ['accepted', 'attached'].includes(previous.state)) {
        await createImageLibraryService({ db, assets }).importAccepted(
          document.ref.parent.parent.id,
          document.id,
        );
        continue;
      }
      // Claim before deleting: an accept racing cleanup must see an expired record.
      const path = await db.runTransaction(async (tx) => {
        const data = (await tx.get(document.ref)).data();
        if (
          !data ||
          data.state === 'attached' ||
          (data.kind === 'cover' && data.state === 'accepted') ||
          data.expiresAt > Date.now()
        )
          return null;
        tx.update(document.ref, { state: 'expired' });
        return data.path ?? `book-covers/${document.ref.parent.parent.id}/${document.id}.png`;
      });
      if (path) {
        await assets.remove(path);
        await document.ref.delete();
      }
    }
  },
);
