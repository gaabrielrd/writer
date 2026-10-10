import { books, author } from './data';
export function watchBookTitle(bookId: string, uid: string, onTitle: (title: string) => void) {
  onTitle(uid === author.uid ? (books.find((book) => book.id === bookId)?.title ?? '') : '');
  return () => {};
}
