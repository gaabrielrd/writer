import type { Universe, UniverseInput } from '../../../src/features/universes/model/universe';
import { FIXTURE_TIME } from './data';
import { fixtureOwner } from './studioStore';
const storageKey = 'writer.visual.universes';
const worlds = new Map<string, Universe>(
  JSON.parse(sessionStorage.getItem(storageKey) ?? '[]') as [string, Universe][],
);
const keyFor = (id: string) => JSON.stringify([fixtureOwner(), id]);
function persist() {
  sessionStorage.setItem(storageKey, JSON.stringify([...worlds]));
}
export function listUniverses(authorId: string): Promise<Universe[]> {
  return Promise.resolve(
    structuredClone(
      [...worlds.values()].filter(
        (world) => authorId === fixtureOwner() && world.authorId === authorId,
      ),
    ),
  );
}
export function getUniverse(id: string): Promise<Universe | null> {
  return Promise.resolve(structuredClone(worlds.get(keyFor(id)) ?? null));
}
export function createUniverse(input: UniverseInput, creationId: string): Promise<Universe> {
  const world: Universe = {
    ...input,
    id: creationId,
    authorId: fixtureOwner(),
    bookCount: 0,
    privacyVersion: 0,
    loreVersion: 0,
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  };
  worlds.set(keyFor(creationId), world);
  persist();
  return Promise.resolve(structuredClone(world));
}
export function updateUniverse(id: string, input: UniverseInput): Promise<Universe> {
  const previous = worlds.get(keyFor(id));
  if (!previous) return Promise.reject(new Error('Universo fictício indisponível.'));
  const world = { ...previous, ...input };
  worlds.set(keyFor(id), world);
  persist();
  return Promise.resolve(structuredClone(world));
}
export function deleteUniverse(id: string): Promise<void> {
  worlds.delete(keyFor(id));
  persist();
  return Promise.resolve();
}
