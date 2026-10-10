import type { Universe, UniverseInput } from '../../../src/features/universes/model/universe';
import { author, FIXTURE_TIME } from './data';
const worlds = new Map<string, Universe>();
export function listUniverses(authorId: string): Promise<Universe[]> {
  return Promise.resolve(
    structuredClone([...worlds.values()].filter((world) => world.authorId === authorId)),
  );
}
export function getUniverse(id: string): Promise<Universe | null> {
  return Promise.resolve(structuredClone(worlds.get(id) ?? null));
}
export function createUniverse(input: UniverseInput, creationId: string): Promise<Universe> {
  const world = {
    ...input,
    id: creationId,
    authorId: author.uid,
    bookCount: 0,
    privacyVersion: 0,
    loreVersion: 0,
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  };
  worlds.set(creationId, world);
  return Promise.resolve(structuredClone(world));
}
export function updateUniverse(id: string, input: UniverseInput): Promise<Universe> {
  const previous = worlds.get(id);
  if (!previous) return Promise.reject(new Error('Universo fictício indisponível.'));
  const world = { ...previous, ...input };
  worlds.set(id, world);
  return Promise.resolve(structuredClone(world));
}
export function deleteUniverse(id: string): Promise<void> {
  worlds.delete(id);
  return Promise.resolve();
}
