import { auth } from './firebase';
import { listLoreEntities } from './loreService';
import { createBookLoreReadClient } from '../../../src/features/lore/services/bookLoreReadClient';
import { freezeBookLoreEditSource } from '../../../src/features/lore/services/bookLoreWritePlan';
import { bookLoreWriteHash } from '../../../src/features/lore/services/bookLoreWritePayload';
declare global {
  interface Window {
    __writerVisualNativeLoreCall?: (name: string, input: unknown, uid: string) => Promise<unknown>;
  }
}
export function bookLoreReadSession(
  isCurrent: () => boolean = () => true,
  options: { tokenVersion?: 1 | 2 } = {},
) {
  const actor = auth.currentUser;
  if (!actor) throw Error('Entre na conta de prévia.');
  const guard = () => {
    if (auth.currentUser !== actor || !isCurrent()) throw Error('O contexto da prévia mudou.');
  };
  if (window.__writerVisualNativeLoreCall)
    return {
      actor,
      guard,
      ...createBookLoreReadClient(
        (name, input) => window.__writerVisualNativeLoreCall!(name, input, actor.uid),
        guard,
        options,
      ),
    };
  async function captureList(bookId: string) {
    guard();
    const entries = await listLoreEntities(bookId);
    guard();
    return entries.map((entity) => {
      const data: Record<string, unknown> = { ...entity };
      delete data.id;
      delete data.bookId;
      delete data.universeId;
      return freezeBookLoreEditSource({
        bookId,
        id: entity.id,
        sourceToken: bookLoreWriteHash({ bookId, id: entity.id, data }),
        data,
      });
    });
  }
  async function capture(bookId: string, id: string, token?: string) {
    const value = (await captureList(bookId)).find((v) => v.id === id) ?? null;
    if (token !== undefined && value?.sourceToken !== token)
      throw Error('A ficha da prévia mudou.');
    return value;
  }
  return {
    actor,
    guard,
    captureList,
    capture,
    async get(bookId: string, id: string, token?: string) {
      const value = await capture(bookId, id, token);
      return value ? { id: value.id, data: structuredClone(value.data) } : null;
    },
    async list(bookId: string) {
      return (await captureList(bookId)).map((v) => ({ id: v.id, data: structuredClone(v.data) }));
    },
    metadata() {
      guard();
      return Promise.reject(Error('Este cenário exige o backend nativo isolado de lore.'));
    },
  };
}
export const hasBookLorePayload = (value: object) => Object.hasOwn(value, 'payloadStorage');
