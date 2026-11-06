import { BOOK_EDITORIAL_HISTORY_METHODS, invokeBookEditorialHistoryCallable } from './bookEditorialHistoryCallable.mjs';
import { LORE_ANALYSIS_INSTRUCTION } from './loreAnalysisInstruction.mjs';
import { cleanupExpiredPersonaGenerations } from './personaGeneration.mjs';
import { createSectorServices } from './domainServices.mjs';
import { logger } from 'firebase-functions';
import { FUNCTION_DOMAINS } from './functionDomains.mjs';
import { createDomainHandler } from './domainCallable.mjs';
import {
  createUniverseLoreImportService,
  projectUniverseLoreImportTerminal,
} from './universeLoreImport.mjs';
import {
  ADVENTURE_RESTORE_METHODS,
  invokeAdventureRestoreCallable,
  setAdventureRestoreHeaders,
} from './adventureRestoreCallable.mjs';
import {
  ADVENTURE_BACKUP_METHODS,
  invokeAdventureBackupCallable,
  setAdventureBackupHeaders,
} from './adventureBackupCallable.mjs';
import {
  ADVENTURE_DELETION_METHODS,
  invokeAdventureDeletionCallable,
  setAdventureDeletionHeaders,
} from './adventureDeletionCallable.mjs';
import { createAdventureDeletionService } from './adventureDeletion.mjs';
import { createAdventureBackupService } from './adventureBackupService.mjs';
import { createAdventureRestoreTransferService } from './adventureRestoreTransfer.mjs';
import { createRestoredImageStorage } from './restoredImageStorage.mjs';
import { createEditorChatService } from './editorChat.mjs';
import { BOOK_RESTORE_METHODS } from './bookRestoreUploadContracts.mjs';
import { invokeBookRestoreCallable } from './bookRestoreCallable.mjs';
import { BOOK_RESTORE_RUNTIME } from './bookRestoreRuntime.mjs';
import { EditorChatContractError } from './editorChatContracts.mjs';
import { createAdventureImportService } from './adventureImport.mjs';
import {
  createBookRestoreUploadService,
  createBookRestoreRecoveryHandler,
  setBookRestoreHeaders,
} from './bookRestoreUpload.mjs';
import { createAdventureRestoreRecoveryHandler } from './adventureRestoreRecoveryHttp.mjs';
import { createAdventureImportRecoveryHandler } from './adventureImportRecovery.mjs';
import { getAuth } from 'firebase-admin/auth';
import { getAppCheck } from 'firebase-admin/app-check';
import { randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { createLiteraryAutocompleteCleanup } from './literaryAutocomplete.mjs';
import { onDocumentDeleted, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { createBookChapterCleanupHandler } from './bookChapterCleanup.mjs';
import { createAccountChatCleanupTrigger } from './accountChatCleanup.mjs';
import { defineSecret, defineString, defineInt } from 'firebase-functions/params';
import { createImageLibraryService } from './imageLibrary.mjs';
import { createUniverseService } from './universes.mjs';
import { setCampaignVariantRecoveryHeaders } from './campaignVariantRecoveryHttp.mjs';
import { setCampaignMediaHeaders } from './campaignCaptureHttp.mjs';
import { setBookBackupCoverHeaders } from './bookBackupCoverRead.mjs';
import { createBookBackupAssetStorage } from './bookBackupAssetStorage.mjs';
import { createBookRestoreCoverStorage } from './bookRestoreCoverStorage.mjs';
import { setBookLoreReadHeaders } from './bookLoreRead.mjs';
import {
  createBookPublicationService,
  setBookPublicationHeaders,
  BOOK_PUBLICATION_METHODS,
} from './bookLorePublication.mjs';
import {
  createBookLoreWriteRecoveryService,
  setBookLoreWriteRecoveryHeaders,
  BOOK_LORE_RECOVERY_METHODS,
} from './bookLoreWriteRecovery.mjs';
import { createBookLoreWriteRecoveryHandler } from './bookLoreWriteRecoveryHttp.mjs';
import {
  createBookLoreEditTransportService,
  setBookLoreEditHeaders,
} from './bookLoreEditTransport.mjs';
import {
  createBookLoreRemovalTransportService,
  setBookLoreRemovalHeaders,
} from './bookLoreRemovalTransport.mjs';
import {
  createBookLoreEditOutcomeService,
  setBookLoreEditOutcomeHeaders,
} from './bookLoreEditOutcome.mjs';
import { assistedInstruction } from './assistedBook.mjs';
import { normalizeCover } from './normalizeCover.mjs';
import { createChapterChatService } from './chapterChat.mjs';
import { geminiTextGenerationOptions } from './chatGeneration.mjs';
import { generatePlatformChat } from './chapterChatProvider.mjs';
import { createGenerationService, generationPrompt, GenerationError } from './generation.mjs';

initializeApp();
const key = defineSecret('BOOK_GENERATION_GEMINI_KEY');
const textModel = defineString('BOOK_SYNOPSIS_MODEL', { default: 'gemini-3.8-flash' });
const imageModel = defineString('BOOK_COVER_MODEL', { default: 'gemini-3.1-flash-image' });
const synopsisCost = defineInt('BOOK_SYNOPSIS_CREDITS', { default: 1 });
const coverCost = defineInt('BOOK_COVER_CREDITS', { default: 5 });
const assistedCost = defineInt('BOOK_ASSISTED_CREDITS', { default: 2 });
const db = getFirestore();
async function chapterChatGenerator(input, onChunk, signal) {
  return generatePlatformChat(input, onChunk, { apiKey: key.value(), signal });
}
export const chapterChat = onCall(
  {
    region: 'us-central1',
    enforceAppCheck: true,
    timeoutSeconds: 120,
    maxInstances: 5,
    memory: '512MiB',
    secrets: [key],
  },
  async (request, response) => {
    try {
      return await createChapterChatService({
        db,
        platformModel: textModel.value(),
        generator: (input, chunk) => chapterChatGenerator(input, chunk, response?.signal),
      }).chapterChat(
        request.auth?.uid,
        request.data,
        response ? (text) => response.sendChunk({ text }) : undefined,
      );
    } catch (error) {
      if (error instanceof GenerationError) throw new HttpsError(error.code, error.message);
      throw new HttpsError('unavailable', 'Não foi possível concluir a conversa. Tente novamente.');
    }
  },
);
export const editorChat = onCall(
  {
    region: 'us-central1',
    enforceAppCheck: true,
    timeoutSeconds: 120,
    maxInstances: 5,
    memory: '512MiB',
    secrets: [key],
  },
  async (request, response) => {
    try {
      return await createEditorChatService({
        db,
        platformModel: textModel.value(),
        generator: (input, chunk, { signal }) =>
          generatePlatformChat({ ...input, text: input.prompt }, chunk, {
            apiKey: key.value(),
            signal,
          }),
      }).dispatch(request.auth?.uid, request.data, {
        signal: response?.signal,
        stream: response ? (event) => response.sendChunk(event) : undefined,
      });
    } catch (error) {
      if (error instanceof EditorChatContractError)
        throw new HttpsError(error.code, error.message, error.details);
      throw new HttpsError(
        'unavailable',
        'Não foi possível concluir o pedido de chat. Tente novamente.',
      );
    }
  },
);
export const collectUnusedBookChapterText = onDocumentUpdated(
  {
    document: 'books/{bookId}/bookTextBodies/{bodyId}',
    region: 'us-central1',
    retry: true,
    maxInstances: 3,
    concurrency: 1,
    memory: '256MiB',
  },
  createBookChapterCleanupHandler({ db }),
);
export const cleanupDeletedChapterChat = onDocumentDeleted(
  { document: 'books/{bookId}/chapters/{chapterId}', region: 'us-central1', retry: true },
  async (event) => {
    const book = (await db.doc(`books/${event.params.bookId}`).get()).data();
    if (book?.authorId)
      await db.recursiveDelete(
        db.doc(
          `users/${book.authorId}/chapterChats/${event.params.bookId}/chapters/${event.params.chapterId}`,
        ),
      );
  },
);
export const cleanupDeletedUserChat = onDocumentDeleted(
  { document: 'users/{uid}', region: 'us-central1', retry: true },
  async (event) => {
    await db.recursiveDelete(db.collection(`users/${event.params.uid}/chapterChats`));
    await db.recursiveDelete(db.collection(`users/${event.params.uid}/chapterChatLimits`));
  },
);
// A new name allows deploying gen 2 before retiring the existing gen 1 trigger.
export const cleanupDeletedAccountChatV2 = createAccountChatCleanupTrigger({ db });
async function assistedGenerator(context) {
  if (context.mode === 'cover') return generator(context);
  const model = context.generation.effective.model;
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error('Modelo inválido.');
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key.value() },
      signal: AbortSignal.timeout(90000),
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text:
                context.mode === 'literary'
                  ? context.systemInstruction
                  : assistedInstruction(context.mode),
            },
          ],
        },
        contents: [{ parts: [{ text: JSON.stringify(context) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          ...geminiTextGenerationOptions(
            context.generation,
            context.operation === 'autocomplete'
              ? 1024
              : context.mode === 'proposal'
                ? 24000
                : context.mode === 'literary'
                  ? 12000
                  : 8000,
          ),
        },
      }),
    },
  );
  if (!response.ok) throw new Error('Falha no provedor.');
  const result = await response.json();
  if (result.candidates?.[0]?.finishReason !== 'STOP') throw new Error('Geração incompleta.');
  return JSON.parse(
    (result.candidates[0].content?.parts ?? [])
      .filter((part) => !part.thought)
      .map((part) => part.text ?? '')
      .join(''),
  );
}
async function loreGenerator(context) {
  const model = context.generation.effective.model;
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error('Modelo inválido.');
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key.value() },
      signal: AbortSignal.timeout(90000),
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: LORE_ANALYSIS_INSTRUCTION,
            },
          ],
        },
        contents: [{ parts: [{ text: JSON.stringify(context) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          ...geminiTextGenerationOptions(context.generation, 12000),
        },
      }),
    },
  );
  if (!response.ok) throw new Error('Falha no provedor.');
  const data = await response.json();
  if (data.candidates?.[0]?.finishReason !== 'STOP') throw new Error('Análise incompleta.');
  return (data.candidates[0].content?.parts ?? [])
    .filter((part) => !part.thought)
    .map((part) => part.text ?? '')
    .join('');
}
const bucket = () => getStorage().bucket();
const backupStorage = createBookBackupAssetStorage(bucket);
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
  async read(path) {
    return (await bucket().file(path).download())[0];
  },
  async metadata(path) {
    const [value] = await bucket().file(path).getMetadata();
    return { generation: String(value.generation), size: Number(value.size) };
  },
  async readGeneration(path, generation) {
    return (await bucket().file(path, { generation }).download())[0];
  },
  async publish(path) {
    const file = bucket().file(path);
    const [metadata] = await file.getMetadata();
    await file.setMetadata({ metadata: { ...metadata.metadata, accepted: 'true' } });
  },
  async retireRestoreImage(context, proof, publishedProof) {
    return createBookRestoreCoverStorage(bucket).retire(context, proof, publishedProof);
  },
  async remove(path) {
    await bucket().file(path).delete({ ignoreNotFound: true });
  },
};
async function generator(context) {
  const model = context.kind === 'cover' ? imageModel.value() : context.generation.effective.model;
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
                ...geminiTextGenerationOptions(context.generation, 2048),
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
        .filter((part) => !part.thought)
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
async function invokeCallable(method, request, domain) {
  if (method.includes('Literary')) {
    request.rawRequest?.res?.setHeader('Cache-Control', 'private, no-store');
    request.rawRequest?.res?.setHeader('Vary', 'Authorization');
  }
  setCampaignMediaHeaders(method, request);
  setBookBackupCoverHeaders(method, request);
  setBookRestoreHeaders(method, request);
  setAdventureRestoreHeaders(method, request);
  setAdventureBackupHeaders(method, request);
  setAdventureDeletionHeaders(method, request);
  setBookLoreReadHeaders(method, request);
  setBookPublicationHeaders(method, request);
  setBookLoreEditHeaders(method, request);
  setBookLoreEditOutcomeHeaders(method, request);
  setBookLoreRemovalHeaders(method, request);
  setBookLoreWriteRecoveryHeaders(method, request);
  if (['readLegacyChapterText', 'listOrphanScenes', 'recoverOrphanScene'].includes(method)) {
    request.rawRequest?.res?.setHeader('Cache-Control', 'private, no-store');
    request.rawRequest?.res?.setHeader('Vary', 'Authorization');
  }
  setCampaignVariantRecoveryHeaders(method, request);
  try {
    if (ADVENTURE_DELETION_METHODS.includes(method))
      return await invokeAdventureDeletionCallable(
        () => createAdventureDeletionService({ db, assets: createRestoredImageStorage(bucket) }),
        method,
        request,
      );
    if (ADVENTURE_BACKUP_METHODS.includes(method))
      return await invokeAdventureBackupCallable(
        createAdventureBackupService({ db, assets: backupStorage }),
        method,
        request.auth?.uid,
        request.data,
      );
    if (ADVENTURE_RESTORE_METHODS.includes(method))
      return await invokeAdventureRestoreCallable(
        createAdventureRestoreTransferService({
          db,
          assets: createRestoredImageStorage(bucket),
        }),
        method,
        request.auth?.uid,
        request.data,
      );
    if (BOOK_RESTORE_METHODS.includes(method) || BOOK_EDITORIAL_HISTORY_METHODS.includes(method))
      return await (BOOK_RESTORE_METHODS.includes(method) ? invokeBookRestoreCallable : invokeBookEditorialHistoryCallable)(
        createBookRestoreUploadService({
          ...BOOK_RESTORE_RUNTIME,
          db,
          restoreAssets: createBookRestoreCoverStorage(bucket),
        }),
        method,
        request.auth?.uid,
        request.data,
      );
    if (BOOK_PUBLICATION_METHODS.includes(method))
      return await createBookPublicationService({ db })[method](request.auth?.uid, request.data);
    if (BOOK_LORE_RECOVERY_METHODS.includes(method))
      return await createBookLoreWriteRecoveryService({ db })[method](
        request.auth?.uid,
        request.data,
      );
    if (method === 'bookLoreEdit')
      return await createBookLoreEditTransportService({ db }).bookLoreEdit(
        request.auth?.uid,
        request.data,
      );
    if (method === 'bookLoreEditOutcome')
      return await createBookLoreEditOutcomeService({ db }).bookLoreEditOutcome(
        request.auth?.uid,
        request.data,
      );
    if (method === 'bookLoreRemoval')
      return await createBookLoreRemovalTransportService({ db }).bookLoreRemoval(
        request.auth?.uid,
        request.data,
      );
    for (const handler of sectorServices(domain)) {
      if (Object.hasOwn(handler, method) && typeof handler[method] === 'function')
        return await handler[method](request.auth?.uid, request.data);
    }
    throw new GenerationError('invalid-argument', 'Ação indisponível neste setor.');
  } catch (error) {
    if (error instanceof GenerationError)
      throw new HttpsError(error.code, error.message, error.details);
    throw new HttpsError('unavailable', 'Serviço temporariamente indisponível. Tente novamente.');
  }
}

export const getBookLoreEditRecoveryKey = onRequest(
  { region: 'us-central1', cors: false, memory: '512MiB', maxInstances: 5, timeoutSeconds: 120 },
  createBookLoreWriteRecoveryHandler({
    service: createBookLoreWriteRecoveryService({ db }),
    verifyIdToken: (token) => getAuth().verifyIdToken(token),
    verifyAppCheck: (token) => getAppCheck().verifyToken(token),
  }),
);
export const cleanupAssistedSessions = onSchedule(
  { schedule: 'every 60 minutes', region: 'us-central1', maxInstances: 1 },
  async () => {
    const expired = await db
      .collectionGroup('assistedSessions')
      .where('expiresAt', '<=', Date.now())
      .limit(100)
      .get();
    for (const session of expired.docs) await db.recursiveDelete(session.ref);
    await createLiteraryAutocompleteCleanup({ db })();
  },
);
export const cleanupDeletedBookCover = onDocumentDeleted(
  { document: 'books/{bookId}', region: 'us-central1', retry: true },
  async (event) => {
    const uid = event.data?.data().authorId;
    if (!uid) return;
    await db.recursiveDelete(db.doc(`users/${uid}/chapterChats/${event.params.bookId}`));
    if (event.data.data().universeId)
      await createUniverseService({ db }).detachUniverse(
        uid,
        event.data.data().universeId,
        event.params.bookId,
      );
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
    await cleanupExpiredPersonaGenerations(db);
  },
);
export const getAdventureImportRecoveryKey = onRequest(
  { region: 'us-central1', cors: false, memory: '512MiB', maxInstances: 5, timeoutSeconds: 120 },
  createAdventureImportRecoveryHandler({
    service: createAdventureImportService({ db }),
    verifyIdToken: (token) => getAuth().verifyIdToken(token),
    verifyAppCheck: (token) => getAppCheck().verifyToken(token),
  }),
);
export const getBookRestoreRecoveryKey = onRequest(
  { region: 'us-central1', cors: false, memory: '512MiB', maxInstances: 5, timeoutSeconds: 120 },
  createBookRestoreRecoveryHandler({
    service: createBookRestoreUploadService({
      ...BOOK_RESTORE_RUNTIME,
      db,
      restoreAssets: createBookRestoreCoverStorage(bucket),
    }),
    verifyIdToken: (token) => getAuth().verifyIdToken(token),
    verifyAppCheck: (token) => getAppCheck().verifyToken(token),
  }),
);

export const getAdventureRestoreRecoveryKey = onRequest(
  { region: 'us-central1', cors: false, memory: '512MiB', maxInstances: 5, timeoutSeconds: 120 },
  createAdventureRestoreRecoveryHandler({
    service: createAdventureRestoreTransferService({
      db,
      assets: createRestoredImageStorage(bucket),
    }),
    verifyIdToken: (token) => getAuth().verifyIdToken(token),
    verifyAppCheck: (token) => getAppCheck().verifyToken(token),
  }),
);
async function invokeUniverseImport(method, request) {
  request.rawRequest?.res?.setHeader('Cache-Control', 'private, no-store');
  request.rawRequest?.res?.setHeader('Vary', 'Authorization');
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  try {
    const service = createUniverseLoreImportService({ db, generator: loreGenerator });
    return await service[method](request.auth.uid, request.data);
  } catch (error) {
    if (error instanceof GenerationError) throw new HttpsError(error.code, error.message);
    throw new HttpsError('unavailable', 'Não foi possível concluir a importação. Tente novamente.');
  }
}

export const cleanupUniverseLoreImports = onSchedule(
  { schedule: 'every 60 minutes', region: 'us-central1', maxInstances: 1 },
  async () => {
    const expired = await db
      .collectionGroup('universeLoreImports')
      .where('expiresAt', '<=', Date.now())
      .limit(25)
      .get();
    for (const document of expired.docs) {
      // Fence first. Retain the permanent session ID and receipts after removing private bodies.
      await db.runTransaction(async (tx) => {
        const current = (await tx.get(document.ref)).data();
        if (!current || current.expiresAt > Date.now()) return;
        tx.update(document.ref, {
          state: current.state === 'applied' ? 'applied' : 'cancelled',
          expiresAt: 0,
        });
      });
      for (const family of ['importUploads', 'importSources', 'importCandidates', 'importReview'])
        await db.recursiveDelete(document.ref.collection(family));
      await db.runTransaction(async (tx) => {
        const current = (await tx.get(document.ref)).data();
        if (!current || current.expiresAt !== 0) return;
        tx.set(document.ref, projectUniverseLoreImportTerminal(current));
      });
    }
  },
);

const sectorServices = createSectorServices({
  db,
  assets,
  backupStorage,
  loreGenerator,
  assistedGenerator,
  assistedCost,
  coverCost,
  generationFactory: service,
  personaGenerator: (input) => generatePlatformChat(input, () => {}, { apiKey: key.value() }),
});

function domainCallable(name) {
  const domain = FUNCTION_DOMAINS[name];
  const dispatch = createDomainHandler({
    domain,
    name,
    invoke: (method, request) =>
      domain.sourceFactory === 'universeLoreImportCallable'
        ? invokeUniverseImport(method, request)
        : invokeCallable(method, request, name),
    observe: (entry) => logger.info('domain-call', entry),
  });
  return onCall(
    { ...domain.options, secrets: domain.requiresGenerationKey ? [key] : [] },
    async (request) => {
      request.rawRequest?.res?.setHeader('Cache-Control', 'private, no-store');
      request.rawRequest?.res?.setHeader('Vary', 'Authorization, X-Firebase-AppCheck');
      try {
        return await dispatch(request);
      } catch (error) {
        if (error instanceof HttpsError) throw error;
        if (error instanceof GenerationError)
          throw new HttpsError(error.code, error.message, error.details);
        throw new HttpsError(
          'unavailable',
          'Serviço temporariamente indisponível. Tente novamente.',
        );
      }
    },
  );
}
export const adventurePortabilityApi = domainCallable('adventurePortabilityApi');
export const adventureRestoreValidationApi = domainCallable('adventureRestoreValidationApi');
export const adventuresApi = domainCallable('adventuresApi');
export const bookPortabilityApi = domainCallable('bookPortabilityApi');
export const bookRestoreValidationApi = domainCallable('bookRestoreValidationApi');
export const booksApi = domainCallable('booksApi');
export const campaignSyncApi = domainCallable('campaignSyncApi');
export const campaignsApi = domainCallable('campaignsApi');
export const generationApi = domainCallable('generationApi');
export const loreAnalysisApi = domainCallable('loreAnalysisApi');
export const loreApi = domainCallable('loreApi');
export const mediaApi = domainCallable('mediaApi');
export const planningApi = domainCallable('planningApi');
export const universeImportAnalysisApi = domainCallable('universeImportAnalysisApi');
export const universeImportApi = domainCallable('universeImportApi');
export const workApi = domainCallable('workApi');
