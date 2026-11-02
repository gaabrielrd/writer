import type * as A from '../../../src/features/lore/model/adventureLore';
import type { LoreEntity } from '../../../src/features/lore/model/loreEntity';
import {
  adventureLoreRequestHash,
  normalizeAdventureLoreEntity,
} from '../../../src/features/lore/services/adventureLoreService';
import { fixtureGet, fixtureOwner, fixturePatchProject } from './studioStore';
import { getUniverse } from './universeService';
import { listLoreEntities } from './loreService';
import { FIXTURE_TIME } from './data';

type Row = {
  entityId: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
  entity?: A.AdventureLoreEntityInput;
};
type Project = { token: string; revision: number; rows: Record<string, Row> };
type StoredOperation = { adventureId: string; requestHash: string; result: A.AdventureLoreOutcome };
interface Data {
  projects: Record<string, Project>;
  operations: Record<string, StoredOperation>;
  fences: Record<string, StoredOperation>;
  calls: {
    uid: string;
    adventureId: string;
    method: string;
    operationId?: string;
    scope?: string;
    cursor?: string | null;
  }[];
}
const storageKey = 'writer.visual.adventure-lore';
const key = (...values: string[]) => JSON.stringify(values);
const read = (): Data =>
  JSON.parse(
    localStorage.getItem(storageKey) ?? '{"projects":{},"operations":{},"fences":{},"calls":[]}',
  ) as Data;
const persist = (data: Data) => localStorage.setItem(storageKey, JSON.stringify(data));
function fail(message: string, reason?: string, code = 'failed-precondition'): never {
  throw Object.assign(new Error(message), {
    code: 'functions/' + code,
    ...(reason ? { details: { reason } } : {}),
  });
}
const changed = () => fail('O contexto de lore mudou. Atualize a consulta.', 'cursor-invalidated');
const conflict = () => fail('O lore mudou. Consulte a versão atual.', 'revision-conflict');
async function hash(value: unknown): Promise<string> {
  const sorted = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(sorted)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([k, v]) => [k, sorted(v)]),
          )
        : value;
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(sorted(value))),
  );
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
}
const hints = new Set<{
  ownerId: string;
  adventureId: string;
  active: boolean;
  hint: (kind: 'root' | 'universe') => void;
}>();
export function subscribeAdventureLoreHints(
  input: { ownerId: string; adventureId: string },
  onHint: (kind: 'root' | 'universe') => void,
): () => void {
  const listener = { ...input, active: true, hint: onHint };
  hints.add(listener);
  queueMicrotask(() => {
    if (listener.active && listener.ownerId === fixtureOwner()) onHint('root');
  });
  return () => {
    listener.active = false;
    hints.delete(listener);
  };
}
/** A server-side fixture mutation emits only a hint; it never authorizes cached data. */
export function fixtureAdventureLoreHint(adventureId: string, kind: 'root' | 'universe' = 'root') {
  for (const listener of hints)
    if (
      listener.active &&
      listener.ownerId === fixtureOwner() &&
      listener.adventureId === adventureId
    )
      listener.hint(kind);
}
async function context(
  data: Data,
  adventureId: string,
  expectedToken?: string,
  ownerId = fixtureOwner(),
) {
  const root = await fixtureGet('adventure', adventureId);
  if (ownerId !== fixtureOwner()) fail('A conta mudou.', undefined, 'permission-denied');
  if (!root || root.ownerId !== ownerId || ('deleting' in root && root.deleting))
    fail('Aventura indisponível.', undefined, 'not-found');
  const projectKey = key(ownerId, adventureId);
  const token = await hash({ version: 1, ownerId, adventureId, createdAt: root.createdAt });
  const project = data.projects[projectKey] ?? { token, revision: 0, rows: {} };
  if (project.token !== token || (expectedToken !== undefined && expectedToken !== token))
    fail('A identidade da aventura mudou.', 'adventure-changed');
  data.projects[projectKey] = project;
  const world = root.universeId ? await getUniverse(root.universeId) : null;
  const worldAvailable =
    !!world && world.authorId === ownerId && !('deleting' in world && world.deleting);
  const globals = worldAvailable ? await listLoreEntities({ kind: 'universe', id: world.id }) : [];
  if (ownerId !== fixtureOwner()) fail('A conta mudou.', undefined, 'permission-denied');
  const contextToken = await hash({
    ownerId,
    adventureId,
    token,
    revision: project.revision,
    universeId: root.universeId ?? null,
    world: worldAvailable ? world : null,
    globals,
  });
  return {
    project,
    globals,
    root,
    worldAvailable,
    contextToken,
    identity: { schemaVersion: 1 as const, ownerId, adventureId, adventureToken: token },
  };
}
type Context = Awaited<ReturnType<typeof context>>;
const canonical = (reference: A.AdventureLoreReference) =>
  reference.kind + ':' + reference.scopeId + ':' + reference.entityId;
function reference(value: string): A.AdventureLoreReference {
  const [kind, scopeId, entityId, ...rest] = value.split(':');
  if (rest.length || !scopeId || !entityId || (kind !== 'adventure' && kind !== 'universe'))
    fail('Destino inválido.', undefined, 'invalid-argument');
  return { kind, scopeId, entityId };
}
function available(c: Context, ref: A.AdventureLoreReference): boolean {
  if (ref.kind === 'adventure')
    return (
      ref.scopeId === c.identity.adventureId &&
      !!c.project.rows[ref.entityId] &&
      !c.project.rows[ref.entityId].deleted
    );
  return (
    c.worldAvailable &&
    ref.scopeId === c.root.universeId &&
    c.globals.some((row) => row.id === canonical(ref))
  );
}
async function summary(c: Context, row: Row): Promise<A.AdventureLoreSummary> {
  const entity = row.entity;
  if (!entity || row.deleted) fail('Ficha indisponível.', undefined, 'not-found');
  const reference: A.AdventureLoreReference & { kind: 'adventure' } = {
    kind: 'adventure',
    scopeId: c.identity.adventureId,
    entityId: row.entityId,
  };
  return {
    id: canonical(reference),
    reference,
    entityToken: await hash({ reference, contextToken: c.contextToken, revision: row.revision }),
    name: entity.name,
    aliases: [...entity.aliases],
    category: entity.category,
    summary: entity.summary,
    isPublic: false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    revision: row.revision,
    relationCount: entity.relations.length,
  };
}
async function globalSummary(c: Context, entity: LoreEntity): Promise<A.AdventureLoreSummary> {
  const ref = reference(entity.id);
  const global = { ...ref, kind: 'universe' as const };
  return {
    id: canonical(global),
    reference: global,
    entityToken: await hash({ reference: global, contextToken: c.contextToken, entity }),
    name: entity.name,
    aliases: [...entity.aliases],
    category: entity.category,
    summary: entity.summary,
    isPublic: entity.isPublic,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}
function once(flag: string, method: string): boolean {
  if (sessionStorage.getItem(flag) !== method) return false;
  sessionStorage.removeItem(flag);
  return true;
}
async function response<T>(uid: string, method: string, adventureId: string, value: T): Promise<T> {
  const result = structuredClone(value);
  if (once('writer.visual.adventure-lore-lost-response', method))
    fail('A resposta se perdeu. Confirme o mesmo pedido.', undefined, 'unavailable');
  if (once('writer.visual.adventure-lore-hold-response', method)) {
    const data = read();
    data.calls.push({ uid, adventureId, method: 'held:' + method });
    persist(data);
    await new Promise<void>((resolve) =>
      window.addEventListener('writer.visual.release-adventure-lore', () => resolve(), {
        once: true,
      }),
    );
  }
  // Preserve the response's original UID so the real client must reject a late identity.
  return result;
}
async function server<T>(
  method: string,
  input: {
    adventureId: string;
    adventureToken?: string;
    operationId?: string;
    scope?: string;
    cursor?: string | null;
  },
  work: (data: Data, c: Context) => T | Promise<T>,
): Promise<T> {
  const uid = fixtureOwner();
  const run = async () => {
    const data = read();
    const c = await context(data, input.adventureId, input.adventureToken, uid);
    data.calls.push({
      uid,
      adventureId: input.adventureId,
      method,
      ...(input.operationId ? { operationId: input.operationId } : {}),
      ...(input.scope ? { scope: input.scope } : {}),
      ...(input.cursor ? { cursor: input.cursor } : {}),
    });
    persist(data);
    if (once('writer.visual.adventure-lore-before-receive', method))
      fail('O transporte não recebeu o pedido.', undefined, 'unavailable');
    const result = await work(data, c);
    persist(data);
    return result;
  };
  const result = await navigator.locks.request(
    'writer.visual.adventure-lore-server:' + key(uid, input.adventureId),
    run,
  );
  return response(uid, method, input.adventureId, result);
}
export function listAdventureLore(input: A.AdventureLoreListInput): Promise<A.AdventureLoreList> {
  return server('listAdventureLore', input, async (_data, c) => {
    const size = input.limit ?? 25;
    if (!Number.isSafeInteger(size) || size < 1 || size > 50)
      fail('Página inválida.', undefined, 'invalid-argument');
    const scope = JSON.stringify({
      ...c.identity,
      contextToken: c.contextToken,
      scope: input.scope,
      category: input.category ?? null,
    });
    type Cursor = { scope: string; id: string; name: string };
    let after: Cursor | null = null;
    if (input.cursor) {
      try {
        after = JSON.parse(input.cursor) as Cursor;
      } catch {
        changed();
      }
      if (!after || after.scope !== scope) changed();
    }
    const summaries =
      input.scope === 'adventure'
        ? await Promise.all(
            Object.values(c.project.rows)
              .filter((row) => !row.deleted)
              .map((row) => summary(c, row)),
          )
        : await Promise.all(c.globals.map((row) => globalSummary(c, row)));
    const ordered = summaries
      .filter((row) => !input.category || row.category === input.category)
      .sort((a, b) =>
        a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
      );
    let offset = 0;
    if (after) {
      const cursor = after;
      const boundary = ordered.findIndex((row) => row.id === cursor.id && row.name === cursor.name);
      if (boundary < 0) changed();
      offset = boundary + 1;
    }
    const items = ordered.slice(offset, offset + size);
    const last = items.at(-1);
    return {
      ...c.identity,
      scope: input.scope,
      collectionRevision: c.project.revision,
      contextToken: c.contextToken,
      items,
      nextCursor:
        offset + size < ordered.length && last
          ? JSON.stringify({ scope, id: last.id, name: last.name })
          : null,
    };
  });
}
export function getAdventureLore(input: A.AdventureLoreGetInput): Promise<A.AdventureLoreGet> {
  return server('getAdventureLore', input, async (_data, c) => {
    if (input.expectedContextToken !== c.contextToken) changed();
    if (!available(c, input.reference)) fail('Ficha indisponível.', undefined, 'not-found');
    const own = input.reference.kind === 'adventure';
    const row = own ? c.project.rows[input.reference.entityId] : null;
    const global = own
      ? null
      : c.globals.find((entity) => entity.id === canonical(input.reference));
    const head = row ? await summary(c, row) : await globalSummary(c, global!);
    if (head.entityToken !== input.expectedEntityToken) conflict();
    const entity = row?.entity ?? global!;
    return {
      ...c.identity,
      collectionRevision: c.project.revision,
      contextToken: c.contextToken,
      item: {
        ...head,
        details: entity.details,
        structuredDetails: entity.structuredDetails ?? {
          appearance: '',
          personality: '',
          history: '',
          notes: '',
        },
        relations: entity.relations.map((relation) => ({
          targetEntityId: relation.targetEntityId,
          relationType: relation.relationType,
          description: relation.description ?? '',
          available: available(c, reference(relation.targetEntityId)),
        })),
      },
    };
  });
}
async function mutate(
  input: A.AdventureLoreWrite | A.AdventureLoreSave,
  action: A.AdventureLoreAction,
): Promise<A.AdventureLoreOutcome> {
  return server(
    action === 'save' ? 'saveAdventureLore' : 'deleteAdventureLore',
    input,
    async (data, c) => {
      const request: A.AdventureLoreWrite | A.AdventureLoreSave =
        action === 'save'
          ? {
              ...input,
              entity: normalizeAdventureLoreEntity((input as A.AdventureLoreSave).entity),
            }
          : { ...input };
      const requestHash = await adventureLoreRequestHash(action, request);
      const operationKey = key(c.identity.ownerId, input.operationId);
      const old = data.operations[operationKey] ?? data.fences[operationKey];
      if (old) {
        if (old.adventureId !== input.adventureId || old.requestHash !== requestHash)
          fail('Operação utilizada com outro pedido.', undefined, 'invalid-argument');
        return old.result;
      }
      const previous = c.project.rows[input.entityId];
      if (
        c.project.revision !== input.expectedCollectionRevision ||
        (previous?.revision ?? 0) !== input.expectedRevision
      )
        conflict();
      if (previous?.deleted) fail('Ficha indisponível.', undefined, 'not-found');
      if (!input.expectedRevision && (input.entityId !== input.operationId || previous))
        fail('Identidade de criação inválida.', undefined, 'invalid-argument');
      if (action === 'delete' && !previous) fail('Ficha indisponível.', undefined, 'not-found');
      const entity = action === 'save' ? (request as A.AdventureLoreSave).entity : undefined;
      if (entity) {
        const permitted = new Map<string, number>();
        for (const relation of previous?.entity?.relations ?? []) {
          const k = JSON.stringify(relation);
          permitted.set(k, (permitted.get(k) ?? 0) + 1);
        }
        for (const relation of entity.relations) {
          const ref = reference(relation.targetEntityId);
          if (
            ref.kind === 'adventure' &&
            (ref.scopeId !== input.adventureId || ref.entityId === input.entityId)
          )
            fail('Destino local inválido.', undefined, 'invalid-argument');
          if (available(c, ref)) continue;
          const k = JSON.stringify(relation),
            count = permitted.get(k) ?? 0;
          if (!count) fail('Destino da relação indisponível.', undefined, 'not-found');
          permitted.set(k, count - 1);
        }
      }
      const revision = (previous?.revision ?? 0) + 1;
      const updatedAt = Math.max(
        FIXTURE_TIME + c.project.revision + 1,
        (previous?.updatedAt ?? 0) + 1,
      );
      c.project.rows[input.entityId] = {
        entityId: input.entityId,
        revision,
        createdAt: previous?.createdAt ?? updatedAt,
        updatedAt,
        deleted: action === 'delete',
        ...(entity ? { entity } : {}),
      };
      c.project.revision++;
      fixturePatchProject('adventure', input.adventureId, {
        loreVersion: c.project.revision,
        updatedAt,
      } as never);
      const result: A.AdventureLoreOutcome = {
        ...c.identity,
        kind: 'confirmed',
        receipt: {
          operationId: input.operationId,
          action,
          entityId: input.entityId,
          expectedRevision: input.expectedRevision,
          revision,
          collectionRevision: c.project.revision,
        },
      };
      data.operations[operationKey] = { adventureId: input.adventureId, requestHash, result };
      queueMicrotask(() => fixtureAdventureLoreHint(input.adventureId));
      return result;
    },
  );
}
export const saveAdventureLore = (input: A.AdventureLoreSave) => mutate(input, 'save');
export const deleteAdventureLore = (input: A.AdventureLoreWrite) => mutate(input, 'delete');
export function resolveAdventureLoreOperation(
  input: A.AdventureLoreResolve,
): Promise<A.AdventureLoreOutcome> {
  return server('resolveAdventureLoreOperation', input, (data, c) => {
    const operationKey = key(c.identity.ownerId, input.operationId);
    const old = data.operations[operationKey] ?? data.fences[operationKey];
    if (old) {
      if (old.adventureId !== input.adventureId || old.requestHash !== input.requestHash)
        fail('Operação utilizada com outro pedido.', undefined, 'invalid-argument');
      return old.result;
    }
    const result: A.AdventureLoreOutcome = {
      ...c.identity,
      kind: 'canceled',
      action: input.action,
      operationId: input.operationId,
    };
    data.fences[operationKey] = {
      adventureId: input.adventureId,
      requestHash: input.requestHash,
      result,
    };
    return result;
  });
}
/** Internal server-fixture adapters: these do not authorize browser SDK access. */
export async function fixtureGetLocalAdventureLore(
  adventureId: string,
  entityId: string,
): Promise<LoreEntity | null> {
  const data = read(),
    c = await context(data, adventureId);
  const row = c.project.rows[entityId];
  if (!row?.entity || row.deleted) return null;
  const head = await summary(c, row);
  return { ...head, ...structuredClone(row.entity), adventureId } as LoreEntity;
}
export async function fixtureLocalAdventureLoreAvailable(
  adventureId: string,
  entityId: string,
  expectedAdventureToken?: string,
): Promise<boolean> {
  const ownerId = fixtureOwner();
  const root = await fixtureGet('adventure', adventureId);
  if (
    fixtureOwner() !== ownerId ||
    !root ||
    root.ownerId !== ownerId ||
    ('deleting' in root && root.deleting)
  )
    return false;
  const project = read().projects[key(ownerId, adventureId)];
  const currentToken = await hash({ version: 1, ownerId, adventureId, createdAt: root.createdAt });
  if (
    !project ||
    project.token !== currentToken ||
    (expectedAdventureToken !== undefined && expectedAdventureToken !== currentToken)
  )
    return false;
  const row = project.rows[entityId];
  // Fixture identity uses its root creation stamp; SDK separately proves real createTime.
  // This gate examines only identity/existence/tombstone metadata, never entity or prose.
  return !!row && !row.deleted;
}
export function fixtureLocalAdventureLoreVersion(adventureId: string): number {
  return read().projects[key(fixtureOwner(), adventureId)]?.revision ?? 0;
}
export async function fixtureAdventureLoreProjection(adventureId: string) {
  const c = await context(read(), adventureId);
  return {
    adventureToken: c.identity.adventureToken,
    loreVersion: c.project.revision,
    contextToken: c.contextToken,
  };
}
/** Setup uses the same transport; the application hook still owns all form and recovery behavior. */
export async function fixtureSeedAdventureLore(
  adventureId: string,
  entities: A.AdventureLoreEntityInput[],
) {
  let collection = await listAdventureLore({ adventureId, scope: 'adventure' });
  const ids: string[] = [];
  for (const [index, entity] of entities.entries()) {
    const entityId = 'visual-adventure-lore-' + String(index).padStart(3, '0');
    const result = await saveAdventureLore({
      adventureId,
      adventureToken: collection.adventureToken,
      entityId,
      operationId: entityId,
      expectedRevision: 0,
      expectedCollectionRevision: collection.collectionRevision,
      entity,
    });
    if (result.kind !== 'confirmed') throw Error('Pré-condição local não confirmada');
    ids.push(entityId);
    collection = await listAdventureLore({ adventureId, scope: 'adventure' });
  }
  return ids;
}
