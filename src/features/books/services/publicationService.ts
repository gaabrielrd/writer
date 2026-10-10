import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  runTransaction,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type DocumentReference,
} from 'firebase/firestore';
import { firestore, renderRichText } from '@/shared/lib';

const MAX_DOCUMENT_BYTES = 900_000;
const WRITE_BATCH_SIZE = 400;
// Lore rules also read the original consent document (20 reads per batch limit).
const STAGING_BATCH_SIZE = 10;

function requiredText(value: unknown, field: string, limit: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > limit) {
    throw new Error(`${field} deve conter entre 1 e ${limit} caracteres.`);
  }
  return value.trim();
}

function assertDocumentSize(data: DocumentData): void {
  if (new TextEncoder().encode(JSON.stringify(data)).length > MAX_DOCUMENT_BYTES) {
    throw new Error('Um capítulo é grande demais para publicar. Divida-o em capítulos menores.');
  }
}

/**
 * Copies only deliberately public fields into an immutable revision. Staging is
 * invisible until the final transaction switches the public pointer and status.
 * Never derives the byline from the signed-in user's profile or email.
 */
export async function publishBook(bookId: string, authorName: string): Promise<void> {
  const byline = requiredText(authorName, 'O nome público do autor', 120);
  const bookRef = doc(firestore, 'books', bookId);
  const bookSnapshot = await getDocFromServer(bookRef);
  if (!bookSnapshot.exists()) throw new Error('Livro não encontrado.');
  const book = bookSnapshot.data();
  const title = requiredText(book.title, 'O título do livro', 300);
  if (book.deleting === true) throw new Error('A exclusão deste livro já foi iniciada.');
  const privacyVersion: unknown = book.publicationPrivacyVersion ?? 0;
  if (
    typeof privacyVersion !== 'number' ||
    !Number.isInteger(privacyVersion) ||
    privacyVersion < 0
  ) {
    throw new Error('A versão de privacidade do livro é inválida.');
  }

  const [chapterSnapshot, loreSnapshot] = await Promise.all([
    getDocsFromServer(collection(firestore, 'books', bookId, 'chapters')),
    getDocsFromServer(collection(firestore, 'books', bookId, 'lore')),
  ]);
  const rootRef = doc(firestore, 'publicBooks', bookId);
  const revisionRef = doc(collection(rootRef, 'revisions'));
  const writes: { ref: DocumentReference; data: DocumentData }[] = [];

  for (const chapter of chapterSnapshot.docs) {
    const data = chapter.data();
    if (typeof data.content !== 'string' || !Number.isInteger(data.order) || data.order < 0) {
      throw new Error(
        'Há um capítulo inválido. Revise seu conteúdo e sua ordem antes de publicar.',
      );
    }
    const projection = {
      title: requiredText(data.title, 'O título do capítulo', 300),
      order: data.order as number,
      content: renderRichText(data.content),
    };
    assertDocumentSize(projection);
    writes.push({ ref: doc(collection(revisionRef, 'chapters'), chapter.id), data: projection });
  }

  let publicLoreCount = 0;
  for (const entity of loreSnapshot.docs) {
    const data = entity.data();
    // Legacy/malformed documents without explicit consent remain private.
    if (data.isPublic !== true) continue;
    if (
      !['character', 'location', 'concept', 'other'].includes(data.category as string) ||
      typeof data.summary !== 'string' ||
      data.summary.length > 140 ||
      !Array.isArray(data.aliases) ||
      data.aliases.length > 20 ||
      data.aliases.some((alias: unknown) => typeof alias !== 'string' || alias.length > 200)
    ) {
      throw new Error('Há uma entidade pública inválida. Revise seu resumo e seus apelidos.');
    }
    const projection = {
      name: requiredText(data.name, 'O nome da entidade pública', 200),
      aliases: data.aliases as string[],
      category: data.category as string,
      summary: data.summary,
    };
    writes.push({ ref: doc(collection(revisionRef, 'lore'), entity.id), data: projection });
    publicLoreCount += 1;
  }

  const publishedAt = Date.now();
  writes.unshift({
    ref: revisionRef,
    data: {
      createdAt: publishedAt,
      chapterCount: chapterSnapshot.size,
      loreCount: publicLoreCount,
      privacyVersion,
    },
  });
  // Separate chapter/lore documents avoid the 1 MiB whole-book document limit.
  for (let offset = 0; offset < writes.length; offset += STAGING_BATCH_SIZE) {
    const batch = writeBatch(firestore);
    for (const write of writes.slice(offset, offset + STAGING_BATCH_SIZE)) {
      batch.set(write.ref, write.data);
    }
    await batch.commit();
  }

  await runTransaction(firestore, async (transaction) => {
    const latestBook = await transaction.get(bookRef);
    if (!latestBook.exists()) throw new Error('Livro não encontrado.');
    // Do not undo a concurrent unpublish or publish a stale manuscript.
    if (
      latestBook.data().updatedAt !== book.updatedAt ||
      latestBook.data().status !== book.status ||
      (latestBook.data().publicationPrivacyVersion ?? 0) !== privacyVersion ||
      latestBook.data().deleting === true
    ) {
      throw new Error('O livro mudou durante a publicação. Revise e tente publicar novamente.');
    }
    transaction.set(rootRef, {
      schemaVersion: 1,
      title,
      authorName: byline,
      revisionId: revisionRef.id,
      publishedAt,
    });
    transaction.update(bookRef, { status: 'published', updatedAt: publishedAt });
  });
}

/** Atomically closes all public reads, including direct revision URLs. */
export async function unpublishBook(bookId: string): Promise<void> {
  const batch = writeBatch(firestore);
  batch.update(doc(firestore, 'books', bookId), { status: 'draft', updatedAt: Date.now() });
  batch.delete(doc(firestore, 'publicBooks', bookId));
  await batch.commit();
}

export async function beginBookDeletion(bookId: string): Promise<void> {
  const batch = writeBatch(firestore);
  batch.update(doc(firestore, 'books', bookId), {
    status: 'draft',
    deleting: true,
    updatedAt: Date.now(),
  });
  batch.delete(doc(firestore, 'publicBooks', bookId));
  await batch.commit();
}

/** Retain a private ID tombstone so orphaned revisions can never be reattached. */
export async function finishBookDeletion(bookId: string): Promise<void> {
  const batch = writeBatch(firestore);
  batch.set(doc(firestore, 'deletedBooks', bookId), { deletedAt: serverTimestamp() });
  batch.delete(doc(firestore, 'books', bookId));
  await batch.commit();
}

/** Called before deleting the private parent so ownership can still be checked. */
export async function deletePublicationRevisions(bookId: string): Promise<void> {
  const revisions = await getDocsFromServer(
    collection(firestore, 'publicBooks', bookId, 'revisions'),
  );
  for (const revision of revisions.docs) {
    const [chapters, lore] = await Promise.all([
      getDocsFromServer(collection(revision.ref, 'chapters')),
      getDocsFromServer(collection(revision.ref, 'lore')),
    ]);
    const refs = [...chapters.docs, ...lore.docs, revision].map((snapshot) => snapshot.ref);
    for (let offset = 0; offset < refs.length; offset += WRITE_BATCH_SIZE) {
      const batch = writeBatch(firestore);
      for (const ref of refs.slice(offset, offset + WRITE_BATCH_SIZE)) batch.delete(ref);
      await batch.commit();
    }
  }
}
