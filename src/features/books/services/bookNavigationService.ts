import { doc, onSnapshot } from 'firebase/firestore';
import { firestore } from '@/shared/lib';

export function watchBookTitle(
  bookId: string,
  uid: string,
  onTitle: (title: string) => void,
): () => void {
  return onSnapshot(
    doc(firestore, 'books', bookId),
    (snapshot) => {
      const book = snapshot.data();
      onTitle(book?.authorId === uid && !book.deleting ? String(book.title ?? '') : '');
    },
    () => onTitle(''),
  );
}
