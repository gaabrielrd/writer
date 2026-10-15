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
import { actName, groupChapters } from '../model/act';
import { listActs } from './chapterOrganizationService';
import { preferredLoreTerms, universeEntityId } from '@/features/lore';
import { resolveChapterContent } from './chapterCompositionService';
import type { Chapter } from '../model/chapter';

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
  const sceneMetadata = book.hasSceneResources
    ? { sourceSceneRevision: (book.sceneRevision ?? 0) as number }
    : {};
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
  const acts = await listActs(bookId);
  const universeId = book.universeId as string | undefined;
  const universeRef = universeId ? doc(firestore, 'universes', universeId) : null;
  const universe = universeRef ? (await getDocFromServer(universeRef)).data() : null;
  if (
    universeRef &&
    (!universe ||
      universe.authorId !== book.authorId ||
      universe.deleting ||
      !Number.isInteger(universe.privacyVersion) ||
      !Number.isInteger(universe.loreVersion))
  )
    throw new Error('Universo indisponível para publicação.');
  const globalLore = universeId
    ? await getDocsFromServer(collection(firestore, 'universes', universeId, 'lore'))
    : null;
  const universeMetadata =
    universeId && universe
      ? { universeId, universePrivacyVersion: universe.privacyVersion as number }
      : {};
  const sources = [
    ...loreSnapshot.docs.map((entity) => ({
      id: entity.id,
      sourceEntityId: undefined as string | undefined,
      universeId: undefined as string | undefined,
      data: entity.data(),
    })),
    ...(globalLore?.docs ?? []).map((entity) => ({
      id: universeEntityId(universeId!, entity.id),
      sourceEntityId: entity.id,
      universeId,
      data: entity.data(),
    })),
  ];
  const winners = preferredLoreTerms(
    sources.map((source) => ({
      ...source,
      name: typeof source.data.name === 'string' ? source.data.name : '',
      aliases: Array.isArray(source.data.aliases)
        ? source.data.aliases.filter((alias: unknown): alias is string => typeof alias === 'string')
        : [],
    })),
  );
  const rootRef = doc(firestore, 'publicBooks', bookId);
  const revisionRef = doc(collection(rootRef, 'revisions'));
  const writes: { ref: DocumentReference; data: DocumentData }[] = [];

  const sourceChapters = chapterSnapshot.docs.map((snapshot) => ({
    id: snapshot.id,
    order: snapshot.data().order as number,
    actId: snapshot.data().actId as string | undefined,
    snapshot,
  }));
  if (
    sourceChapters.some((chapter) => chapter.actId && !acts.some((act) => act.id === chapter.actId))
  )
    throw new Error('Há um capítulo vinculado a um ato inexistente.');
  const publicGroups = groupChapters(sourceChapters, acts).filter(
    (group) => group.chapters.length > 0,
  );
  const publicActs = publicGroups.flatMap((group) => (group.act ? [group.act] : []));
  for (const act of publicActs) {
    writes.push({
      ref: doc(collection(revisionRef, 'acts'), act.id),
      data: { name: requiredText(actName(act), 'O nome do ato', 300), order: act.order },
    });
  }
  let readingOrder = 0;
  for (const chapterEntry of publicGroups.flatMap((group) => group.chapters)) {
    const chapter = chapterEntry.snapshot;
    const data = chapter.data();
    if (
      data.deleting ||
      typeof data.content !== 'string' ||
      !Number.isInteger(data.order) ||
      data.order < 0
    ) {
      throw new Error(
        'Há um capítulo inválido. Revise seu conteúdo e sua ordem antes de publicar.',
      );
    }
    const canonical = await resolveChapterContent(bookId, {
      ...data,
      id: chapter.id,
      bookId,
    } as Chapter);
    if (
      data.contentMode === 'scenes' &&
      new TextEncoder().encode(canonical.content).length > 800_000
    )
      throw new Error(
        'Um capítulo reúne texto demais para publicar. Divida as cenas em capítulos menores.',
      );
    const projection = {
      title: requiredText(data.title, 'O título do capítulo', 300),
      order: ++readingOrder,
      ...(data.actId ? { actId: data.actId as string } : {}),
      content: renderRichText(canonical.content),
    };
    assertDocumentSize(projection);
    writes.push({ ref: doc(collection(revisionRef, 'chapters'), chapter.id), data: projection });
  }

  let publicLoreCount = 0;
  for (const entity of sources) {
    const data = entity.data;
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
    const name = requiredText(data.name, 'O nome da entidade pública', 200);
    // Never publish a global fallback for a term owned by private local lore.
    if (winners.get(name.toLocaleLowerCase())?.id !== entity.id) continue;
    const projection = {
      name,
      aliases: (data.aliases as string[]).filter(
        (alias) => winners.get(alias.trim().toLocaleLowerCase())?.id === entity.id,
      ),
      category: data.category as string,
      summary: data.summary,
      ...(entity.sourceEntityId ? { sourceEntityId: entity.sourceEntityId } : {}),
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
      ...(publicActs.length ? { actCount: publicActs.length } : {}),
      loreCount: publicLoreCount,
      privacyVersion,
      ...sceneMetadata,
      ...universeMetadata,
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
    const latestUniverse = universeRef ? (await transaction.get(universeRef)).data() : null;
    if (!latestBook.exists()) throw new Error('Livro não encontrado.');
    // Do not undo a concurrent unpublish or publish a stale manuscript.
    if (
      latestBook.data().updatedAt !== book.updatedAt ||
      (latestBook.data().sceneRevision ?? 0) !== (book.sceneRevision ?? 0) ||
      (latestBook.data().universeId ?? null) !== (universeId ?? null) ||
      (universe &&
        (!latestUniverse ||
          latestUniverse.deleting ||
          latestUniverse.privacyVersion !== universe.privacyVersion ||
          latestUniverse.loreVersion !== universe.loreVersion)) ||
      latestBook.data().status !== book.status ||
      (latestBook.data().publicationPrivacyVersion ?? 0) !== privacyVersion ||
      latestBook.data().deleting === true
    ) {
      throw new Error('O livro mudou durante a publicação. Revise e tente publicar novamente.');
    }
    transaction.set(rootRef, {
      schemaVersion: universeId ? 2 : 1,
      ...(publicActs.length ? { hasActs: true } : {}),
      title,
      authorName: byline,
      revisionId: revisionRef.id,
      publishedAt,
      ...universeMetadata,
      ...sceneMetadata,
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
  const parent = await getDocFromServer(doc(firestore, 'books', bookId));
  if (
    parent.exists() &&
    (parent.data().hasSceneResources ||
      parent.data().hasNarrativeResources ||
      parent.data().hasProgressResources)
  )
    throw new Error('Conclua a limpeza dos recursos do projeto no servidor.');
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
    const [chapters, lore, acts] = await Promise.all([
      getDocsFromServer(collection(revision.ref, 'chapters')),
      getDocsFromServer(collection(revision.ref, 'lore')),
      getDocsFromServer(collection(revision.ref, 'acts')),
    ]);
    const refs = [...chapters.docs, ...lore.docs, ...acts.docs, revision].map(
      (snapshot) => snapshot.ref,
    );
    for (let offset = 0; offset < refs.length; offset += WRITE_BATCH_SIZE) {
      const batch = writeBatch(firestore);
      for (const ref of refs.slice(offset, offset + WRITE_BATCH_SIZE)) batch.delete(ref);
      await batch.commit();
    }
  }
}
