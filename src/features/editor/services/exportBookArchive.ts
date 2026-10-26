import type { Book, Chapter } from '@/features/books';
import type { BookBackupSink } from '@/features/book-portability';
import { auth } from '@/shared/lib';
import { exportFileName } from '../model/exportDocument';
import { saveEditorBookBackup } from './bookBackup';
import {
  bookArchivePicker,
  openBookArchiveSink,
  type BookArchivePicker,
} from './bookArchiveDestination';

export async function exportBookArchive(
  input: {
    book: Book;
    currentChapter?: Chapter;
    currentContent?: string;
    signal?: AbortSignal;
    isCurrent?: () => boolean;
  },
  ports: { picker?: BookArchivePicker; save?: typeof saveEditorBookBackup } = {},
): Promise<{ kind: 'saved' } | { kind: 'cancelled' }> {
  const ownerId = auth.currentUser?.uid,
    bookId = input.book.id,
    picker = ports.picker ?? bookArchivePicker,
    save = ports.save ?? saveEditorBookBackup;
  function guard() {
    input.signal?.throwIfAborted();
    if (
      !ownerId ||
      ownerId !== input.book.authorId ||
      auth.currentUser?.uid !== ownerId ||
      input.book.id !== bookId ||
      input.book.deleting ||
      (input.isCurrent && !input.isCurrent())
    )
      throw new DOMException('A conta ou o livro mudou. Reabra a exportação.', 'AbortError');
  }
  guard();
  if (input.currentChapter && input.currentChapter.bookId !== bookId)
    throw new Error('O capítulo não pertence a este livro.');
  if (!picker.supported())
    throw new Error('Este navegador não oferece gravação de backup com seleção de arquivo.');
  const fileName = exportFileName(input.book.title, 'writer');
  let resolve!: (sink: BookBackupSink) => void, reject!: (error: unknown) => void;
  const destination = new Promise<BookBackupSink>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  // The producer freezes its explicit draft before the native chooser starts.
  const saving = save(
    bookId,
    {
      signal: input.signal,
      isCurrent: () => {
        guard();
        return true;
      },
      draft:
        input.currentChapter &&
        input.currentChapter.contentMode !== 'scenes' &&
        input.currentContent !== undefined
          ? { chapter: input.currentChapter, content: input.currentContent }
          : null,
    },
    destination,
  );
  const settled = saving.then(
    () => ({ ok: true as const }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  let sink: BookBackupSink | undefined,
    pickerCancelled = false,
    choosing = true;
  try {
    const handle = await picker.pick(fileName);
    choosing = false;
    guard();
    sink = await openBookArchiveSink(handle);
    guard();
    resolve(sink);
  } catch (error) {
    pickerCancelled = choosing && error instanceof DOMException && error.name === 'AbortError';
    let failure = error;
    if (sink) {
      try {
        await sink.abort(error);
      } catch (cleanup) {
        failure = new AggregateError(
          [error, cleanup],
          'Não foi possível encerrar o arquivo de backup.',
          { cause: error },
        );
      }
    }
    reject(failure);
  }
  const outcome = await settled;
  if (!outcome.ok) {
    if (pickerCancelled) {
      guard();
      return { kind: 'cancelled' };
    }
    throw outcome.error;
  }
  guard();
  return { kind: 'saved' };
}
