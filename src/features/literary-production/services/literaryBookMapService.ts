import { getFunctions, httpsCallable } from '@/shared/api/domainCallable';
import { getFirebaseApp } from '@/shared/lib';
import type { BookMapPage, BookMapResource } from '../model/bookMap';
export async function readLiteraryBookMapPage(
  bookId: string,
  resource: BookMapResource,
  fence: string | null,
  afterId: string | null,
) {
  return (
    await httpsCallable<unknown, BookMapPage>(
      getFunctions(getFirebaseApp(), 'us-central1'),
      'readLiteraryBookMapPage',
    )({
      target: { kind: 'book', id: bookId },
      resource,
      fence,
      afterId,
      limit: resource === 'plans' ? 3 : 25,
    })
  ).data;
}
