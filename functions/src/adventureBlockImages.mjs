import { validateId } from './generation.mjs';
import { workClosed, workFail, digest } from './workProgressContracts.mjs';
import { prepareLibraryImageUse, readActiveLibraryImage } from './imageLibrary.mjs';

export const adventureImage = (resource, scene, block = scene) =>
  (resource.kind === 'scene' ? scene.mainBlockImage : block.image) ?? null;
export function adventureImageInput(value) {
  if (value === null) return null;
  workClosed(value, ['imageId', 'alt', 'caption']);
  const imageId = validateId(value.imageId);
  for (const [field, maximum] of [
    ['alt', 1000],
    ['caption', 4000],
  ])
    if (typeof value[field] !== 'string' || value[field].length > maximum)
      workFail('invalid-argument', 'Legenda ou texto alternativo inválido.');
  return { imageId, alt: value.alt, caption: value.caption };
}
export async function prepareAdventureImageUse(tx, db, context, resource, previous, next) {
  return prepareLibraryImageUse(tx, db, context.uid, {
    key: 'adventure-block:' + digest({ adventureId: context.target.id, resource }),
    usage: { kind: 'adventure-block', adventureId: context.target.id, resource },
    previousId: previous?.imageId ?? null,
    nextId: next?.imageId ?? null,
  });
}
export async function adventureImageDocument(tx, db, value) {
  const image = adventureImage(value.resource, value.scene, value.block);
  if (!image) return { revision: value.block.revision, image: null };
  const active = await readActiveLibraryImage(tx, db, value.context.uid, image.imageId);
  if (active.value.useCount < 1)
    workFail('failed-precondition', 'O vínculo da imagem está inconsistente.');
  return {
    revision: value.block.revision,
    image: {
      imageId: image.imageId,
      name: active.value.name,
      alt: image.alt,
      caption: image.caption,
    },
  };
}
