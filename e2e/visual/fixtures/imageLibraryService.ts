/* eslint-disable @typescript-eslint/require-await -- Inert fixture service contracts. */
import { books, FIXTURE_TIME } from './data';
import type { ImagePage } from '../../../src/features/image-library/model/image';
const images = [
  {
    id: 'visual-image-000001',
    name: 'Capa do Atlas',
    url: books[0].coverUrl!,
    createdAt: FIXTURE_TIME,
    useCount: 0,
  },
  {
    id: 'visual-image-000002',
    name: 'Capa em uso',
    url: books[1].coverUrl!,
    createdAt: FIXTURE_TIME,
    useCount: 1,
  },
];
export async function listLibraryImages(): Promise<ImagePage> {
  return { images: structuredClone(images), cursor: null };
}
export async function renameLibraryImage(id: string, name: string) {
  const image = images.find((item) => item.id === id);
  if (image) image.name = name;
}
export async function deleteLibraryImage(id: string) {
  const index = images.findIndex((item) => item.id === id);
  if (index >= 0) images.splice(index, 1);
}
