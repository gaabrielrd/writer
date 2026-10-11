import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  runTransaction,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { firestore } from '@/shared/lib';
import { countWords, type Chapter, type CreateChapterInput } from '../model/chapter';
import { type Act, groupChapters } from '../model/act';

export const MAX_CHAPTER_SELECTION = 200;

function editableBook(snapshot: DocumentSnapshot) {
  if (!snapshot.exists() || snapshot.data().deleting === true)
    throw new Error('Livro indisponível para alterações.');
  return snapshot.data();
}
function nextTimestamp(previous: number): number {
  return Math.max(Date.now(), previous + 1);
}
function selectionIds(bookId: string, selected: readonly Chapter[]): Set<string> {
  if (!selected.length) throw new Error('Selecione pelo menos um capítulo.');
  if (selected.length > MAX_CHAPTER_SELECTION)
    throw new Error('Selecione no máximo ' + MAX_CHAPTER_SELECTION + ' capítulos por operação.');
  const ids = new Set(selected.map((chapter) => chapter.id));
  if (ids.size !== selected.length || selected.some((chapter) => chapter.bookId !== bookId))
    throw new Error('Seleção de capítulos inválida.');
  return ids;
}

export async function listActs(bookId: string): Promise<Act[]> {
  const snapshot = await getDocsFromServer(collection(firestore, 'books', bookId, 'acts'));
  return snapshot.docs
    .map((item) => {
      const data = item.data();
      if (
        (data.name !== null && (typeof data.name !== 'string' || data.name.length > 300)) ||
        !Number.isSafeInteger(data.order) ||
        data.order < 1 ||
        data.order > 3999 ||
        !Number.isSafeInteger(data.createdAt) ||
        data.createdAt < 0 ||
        !Number.isSafeInteger(data.updatedAt) ||
        data.updatedAt < data.createdAt
      )
        throw new Error('Há um ato inválido neste livro.');
      return {
        id: item.id,
        name: data.name as string | null,
        order: data.order as number,
        createdAt: data.createdAt as number,
        updatedAt: data.updatedAt as number,
      };
    })
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export async function createAct(bookId: string, name: string): Promise<Act> {
  const normalized = name.trim() || null;
  if (normalized && normalized.length > 300)
    throw new Error('O nome do ato deve ter até 300 caracteres.');
  const bookRef = doc(firestore, 'books', bookId);
  const ref = doc(collection(bookRef, 'acts'));
  return runTransaction(firestore, async (transaction) => {
    const book = editableBook(await transaction.get(bookRef));
    const order = ((book.actCount as number | undefined) ?? 0) + 1;
    if (!Number.isSafeInteger(order) || order < 1 || order > 3999)
      throw new Error('O livro atingiu o limite de 3999 atos.');
    const now = nextTimestamp(book.updatedAt as number);
    const act: Act = { id: ref.id, name: normalized, order, createdAt: now, updatedAt: now };
    transaction.set(ref, { name: act.name, order, createdAt: now, updatedAt: now });
    transaction.update(bookRef, { actCount: order, updatedAt: now });
    return act;
  });
}

/** Capture book version before queries and validate it inside the atomic operation. */
async function organizationSnapshot(bookId: string) {
  const bookRef = doc(firestore, 'books', bookId);
  const book = editableBook(await getDocFromServer(bookRef));
  const snapshot = await getDocsFromServer(collection(bookRef, 'chapters'));
  const chapters = snapshot.docs.map(
    (item) => ({ ...item.data(), id: item.id, bookId }) as Chapter,
  );
  return { bookRef, book, chapters };
}
function assertUnchanged(current: Record<string, unknown>, original: Record<string, unknown>) {
  if (current.updatedAt !== original.updatedAt)
    throw new Error('O livro mudou. Atualize a lista antes de tentar novamente.');
}

export async function createOrganizedChapter(
  bookId: string,
  input: CreateChapterInput,
): Promise<Chapter> {
  const { bookRef, book, chapters } = await organizationSnapshot(bookId);
  const actId = input.actId || null;
  const siblings = chapters.filter((chapter) => (chapter.actId ?? null) === actId);
  const order = input.order ?? Math.max(0, ...siblings.map((chapter) => chapter.order)) + 1;
  if (!Number.isSafeInteger(order) || order < 1) throw new Error('Ordem de capítulo inválida.');
  const ref = doc(collection(bookRef, 'chapters'));
  return runTransaction(firestore, async (transaction) => {
    const current = editableBook(await transaction.get(bookRef));
    if (actId && !(await transaction.get(doc(bookRef, 'acts', actId))).exists())
      throw new Error('O ato não pertence a este livro.');
    assertUnchanged(current, book);
    const now = nextTimestamp(current.updatedAt as number);
    const content = input.content ?? '';
    const chapter: Chapter = {
      id: ref.id,
      bookId,
      title: input.title.trim() || 'Capítulo ' + order,
      order,
      ...(actId ? { actId } : {}),
      content,
      wordCount: countWords(content),
      createdAt: now,
      updatedAt: now,
    };
    transaction.set(ref, chapter);
    transaction.update(bookRef, {
      wordCount: ((current.wordCount as number) ?? 0) + chapter.wordCount,
      updatedAt: now,
    });
    return chapter;
  });
}

export async function moveChaptersToAct(
  bookId: string,
  selected: readonly Chapter[],
  actId: string | null,
): Promise<void> {
  const ids = selectionIds(bookId, selected);
  const { bookRef, book, chapters } = await organizationSnapshot(bookId);
  const acts = await listActs(bookId);
  const ordered = groupChapters(chapters, acts).flatMap((group) => group.chapters);
  const moving = ordered.filter(
    (chapter) => ids.has(chapter.id) && (chapter.actId ?? null) !== actId,
  );
  const nextOrder = Math.max(
    0,
    ...chapters
      .filter((chapter) => (chapter.actId ?? null) === actId)
      .map((chapter) => chapter.order),
  );
  await runTransaction(firestore, async (transaction) => {
    const current = editableBook(await transaction.get(bookRef));
    if (actId && !(await transaction.get(doc(bookRef, 'acts', actId))).exists())
      throw new Error('O ato não pertence a este livro.');
    const snapshots = await Promise.all(
      selected.map((chapter) => transaction.get(doc(bookRef, 'chapters', chapter.id))),
    );
    assertUnchanged(current, book);
    snapshots.forEach((snapshot, index) => {
      const expected = selected[index]!;
      if (!snapshot.exists() || snapshot.data().updatedAt !== expected.updatedAt)
        throw new Error('Um capítulo mudou. Atualize a lista antes de tentar novamente.');
    });
    const now = nextTimestamp(current.updatedAt as number);
    moving.forEach((chapter, index) =>
      transaction.update(doc(bookRef, 'chapters', chapter.id), {
        actId,
        order: nextOrder + index + 1,
        updatedAt: now,
      }),
    );
    if (moving.length) transaction.update(bookRef, { updatedAt: now });
  });
}

export async function deleteChapters(bookId: string, selected: readonly Chapter[]): Promise<void> {
  selectionIds(bookId, selected);
  const bookRef = doc(firestore, 'books', bookId);
  await runTransaction(firestore, async (transaction) => {
    const current = editableBook(await transaction.get(bookRef));
    const snapshots = await Promise.all(
      selected.map((chapter) => transaction.get(doc(bookRef, 'chapters', chapter.id))),
    );
    let removedWords = 0;
    snapshots.forEach((snapshot, index) => {
      if (!snapshot.exists() || snapshot.data().updatedAt !== selected[index]!.updatedAt)
        throw new Error('Um capítulo mudou. Atualize a lista antes de tentar novamente.');
      removedWords += (snapshot.data().wordCount as number) || 0;
    });
    snapshots.forEach((snapshot) => transaction.delete(snapshot.ref));
    transaction.update(bookRef, {
      wordCount: Math.max(0, ((current.wordCount as number) ?? 0) - removedWords),
      updatedAt: nextTimestamp(current.updatedAt as number),
    });
  });
}
