export const ADVENTURE_IMAGES_SEED: string;
export const ADVENTURE_IMAGE_SOURCES_SEED: string;
export function adventureImageAddressLine(kind: 'scene' | 'block', id: string): string;
export interface AdventureImagesManifest {
  schemaVersion: 1;
  bindings: number;
  assets: number;
  bytes: number;
  digest: string;
}
export function adventureImagesManifest(
  bindings: number,
  assets: number,
  bytes: number,
  digest: string,
): AdventureImagesManifest;
