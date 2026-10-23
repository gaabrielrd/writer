import { assertPreparedGenerationHead } from './bookLoreEditAdoptionProofs.mjs';
import { born, bornEqual, closed, restoreHash } from './bookRestoreUploadContracts.mjs';
import { digest, readWorkMetadata } from './workProgressContracts.mjs';
import { bookContentId } from './bookBackupSchema.mjs';
import { readLoreBook, loreEntityToken } from './bookLoreReadContracts.mjs';
import { openBookLoreRecord, openBookLoreRelationPage } from './bookLoreStorageRead.mjs';
import { openBookResourcePayload } from './bookResourcePayloadRead.mjs';
import { loreGenerationStorage } from './bookLoreGenerationContracts.mjs';
import {
  inventoryScope,
  inventorySelector,
  inventoryConflict as conflict,
} from './bookLoreResourceInventoryContracts.mjs';
import {
  loadInventoryControl,
  prepareInventoryInitialization,
  prepareInventoryChange,
  inventoryReference,
  readInventoryReference,
} from './bookLoreResourceInventoryStore.mjs';
import { createBookLoreResourceInventoryCleanup } from './bookLoreResourceInventoryCleanup.mjs';
async function sourceBody(tx, c, input) {
  const book = await readLoreBook(tx, c),
    snapshot = await tx.get(c.db.doc(c.path + '/lore/' + input.loreId));
  if (!snapshot.exists || loreEntityToken(c, book, snapshot) !== input.sourceToken) conflict();
  const opened = await openBookLoreRecord(tx, c, snapshot),
    selector = inventorySelector(input.selector);
  if (opened.mode !== 'payload') conflict();
  let pointer, body;
  if (selector.section === 'relations')
    ({ pointer, body } = await openBookLoreRelationPage(tx, opened, selector.page));
  else if (selector.section === 'base') {
    pointer = opened.storage.base;
    body = opened.base;
  } else {
    pointer = opened.storage.schemaVersion === 2 ? opened.storage.fields[selector.field] : null;
    if (pointer)
      body = await openBookResourcePayload(tx, c.db, {
        uid: c.uid,
        bookId: c.bookId,
        resource: { kind: 'lore', parentId: null, id: input.loreId },
        ...pointer,
      });
  }
  if (!pointer || !body) conflict();
  const generationContext = {
    schemaVersion: 1,
    kind: 'generation',
    ownerId: c.uid,
    bookId: c.bookId,
    bookBirth: born(book.snapshot),
    loreId: input.loreId,
    generationId: opened.storage.generationId,
    sourceBirth: born(snapshot),
    sourceUpdate: born({ createTime: snapshot.updateTime }),
    storageHash: digest(opened.storage),
  };
  return { generationContext, pointer, selector, head: snapshot, storage: opened.storage };
}
export function createBookLoreResourceInventoryService({ db }) {
  return {
    async registerBookLoreSourceReference(uid, input) {
      closed(input, ['bookId', 'loreId', 'sourceToken', 'selector']);
      const c = inventoryScope(db, uid, input.bookId);
      bookContentId(input.loreId);
      restoreHash(input.sourceToken);
      inventorySelector(input.selector);
      return db.runTransaction(async (tx) => {
        const { generationContext, pointer, selector, head, storage } = await sourceBody(
            tx,
            c,
            input,
          ),
          bodyId = pointer.manifest.bodyId,
          body = await loadInventoryControl(tx, c, 'body', bodyId),
          generation = await loadInventoryControl(
            tx,
            c,
            'generation',
            generationContext.generationId,
          );
        if (
          body &&
          (body.context.loreId !== input.loreId ||
            !bornEqual(
              { createTime: body.context.bookBirth },
              { createTime: generationContext.bookBirth },
            ) ||
            digest(body.context.pointer) !== digest(pointer) ||
            ['collecting', 'collected'].includes(body.state.phase))
        )
          conflict();
        if (!generation) {
          const plan = await prepareInventoryInitialization(tx, c, generationContext);
          plan.commit();
          return { phase: 'generation-initialized', registered: false };
        }
        if (generation.state.phase !== 'active') conflict();
        if (generation.context.preparation)
          await assertPreparedGenerationHead(tx, c, generation, head, storage);
        else if (digest(generation.context) !== digest(generationContext)) conflict();
        if (!body) {
          const plan = await prepareInventoryInitialization(tx, c, {
            schemaVersion: 1,
            kind: 'body',
            ownerId: uid,
            bookId: c.bookId,
            bookBirth: generationContext.bookBirth,
            loreId: input.loreId,
            bodyId,
            pointer,
            selector,
            initialGeneration: {
              generationId: generation.at.id,
              birth: born(generation.snapshot),
              token: generation.token,
            },
          });
          plan.commit();
          return { phase: 'body-initialized', registered: false };
        }
        const ref = db.doc(body.at.controlPath + '/references/' + generation.at.id),
          existing = await tx.get(ref);
        if (existing.exists) {
          const proof = await readInventoryReference(tx, body, existing);
          if (proof.generation.token !== generation.token) conflict();
          return { phase: 'registered', registered: true };
        }
        const reference = inventoryReference(body, generation, body.state.revision + 1),
          plan = await prepareInventoryChange(
            tx,
            body,
            'register',
            {
              phase: 'live',
              referenceRevision: body.state.referenceRevision + 1,
              scanRevision: null,
              cursor: null,
              headToken: null,
              headPage: 0,
            },
            digest(reference),
          );
        tx.create(ref, reference);
        plan.commit();
        return { phase: 'registered', registered: true };
      });
    },
    async retireBookLoreInventoryGeneration(uid, input) {
      closed(input, ['bookId', 'generationId']);
      const c = inventoryScope(db, uid, input.bookId);
      restoreHash(input.generationId);
      return db.runTransaction(async (tx) => {
        const book = await readLoreBook(tx, c),
          generation = await loadInventoryControl(tx, c, 'generation', input.generationId);
        if (!generation || !bornEqual(book.snapshot, { createTime: generation.context.bookBirth }))
          conflict();
        const head = await readWorkMetadata(
          tx,
          db.doc(c.path + '/lore/' + generation.context.loreId),
          ['payloadStorage'],
        );
        if (
          head.exists &&
          Object.hasOwn(head.data(), 'payloadStorage') &&
          loreGenerationStorage(head.data().payloadStorage).generationId === generation.at.id
        )
          conflict();
        if (generation.state.phase === 'retired') return { retired: true };
        const plan = await prepareInventoryChange(tx, generation, 'retire', { phase: 'retired' });
        plan.commit();
        return { retired: true };
      });
    },
    ...createBookLoreResourceInventoryCleanup({ db }),
  };
}
