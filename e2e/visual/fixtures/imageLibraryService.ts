/* eslint-disable @typescript-eslint/require-await -- Inert fixture service contracts. */
import { books, FIXTURE_TIME } from './data';
import type { ImagePage, LibraryImage } from '../../../src/features/image-library/model/image';
import { fixtureOwner } from './studioStore';

type LibraryState = { images: LibraryImage[]; uses: Record<string, string> };
const storageKey = 'writer.visual.image-library';
const libraries = new Map<string, LibraryState>(
  JSON.parse(sessionStorage.getItem(storageKey) ?? '[]') as [string, LibraryState][],
);
function library(): LibraryState {
  const uid = fixtureOwner();
  let state = libraries.get(uid);
  if (!state) {
    state = {
      images: [
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
      ],
      uses: {},
    };
    libraries.set(uid, state);
  }
  return state;
}
function persist() {
  sessionStorage.setItem(storageKey, JSON.stringify([...libraries.entries()]));
}
function failure(message: string, code = 'failed-precondition'): never {
  throw Object.assign(new Error(message), { code: `functions/${code}` });
}
function validCount(image: LibraryImage, minimum = 0) {
  const knownUses = Object.values(library().uses).filter((id) => id === image.id).length;
  if (!Number.isSafeInteger(image.useCount) || image.useCount < Math.max(minimum, knownUses))
    failure('O contador de uso da imagem está inconsistente.');
}
export function fixtureLibraryImage(id: string): LibraryImage {
  const image = library().images.find((item) => item.id === id);
  const revoked = sessionStorage.getItem('writer.visual.preview-revoked-image');
  if (!image || image.state === 'deleting' || revoked === 'true' || revoked === id)
    failure('Imagem indisponível.', 'not-found');
  validCount(image);
  return structuredClone(image);
}
export const fixtureAdventureImageUse = (
  adventureId: string,
  resource: { kind: string; id: string },
) => JSON.stringify(['adventure-block', adventureId, resource.kind, resource.id]);
export function fixtureSetImageUse(key: string, imageId: string | null) {
  const state = library(),
    oldId = state.uses[key];
  const next = imageId === null ? null : fixtureLibraryImage(imageId);
  const old = oldId ? state.images.find((item) => item.id === oldId) : null;
  if (oldId && !old) failure('O uso da imagem está inconsistente.');
  if (old) validCount(old, 1);
  if (oldId === imageId) return;
  if (next && !Number.isSafeInteger(next.useCount + 1))
    failure('O contador de uso da imagem está inconsistente.');
  if (old) old.useCount -= 1;
  if (next) {
    const image = state.images.find((item) => item.id === next.id)!;
    image.useCount += 1;
    state.uses[key] = image.id;
  } else delete state.uses[key];
  persist();
}
export async function listLibraryImages(): Promise<ImagePage> {
  return { images: structuredClone(library().images), cursor: null };
}
export async function renameLibraryImage(id: string, name: string) {
  const image = library().images.find((item) => item.id === id);
  if (image) {
    image.name = name;
    persist();
  }
}
export async function deleteLibraryImage(id: string) {
  const state = library(),
    index = state.images.findIndex((item) => item.id === id);
  if (index < 0) return;
  const image = state.images[index];
  validCount(image);
  if (image.useCount > 0) failure('A imagem está em uso e não pode ser excluída.');
  state.images.splice(index, 1);
  persist();
}
