import type * as P from '../../../src/features/campaign-preparation/model/campaignPreparation';
import {
  fixtureAssertCampaignWritable,
  fixtureCampaignDeletionReservation,
  fixtureCampaignToken,
  fixtureGet,
  fixtureOwner,
} from './studioStore';
import { getCampaignSession } from './campaignSessionFixture';
import { FIXTURE_TIME } from './data';

type Item = P.PreparationItemSummary & { deleted: boolean; body?: P.ClueBody | P.QuestBody };
type Link = {
  id: string;
  sessionId: string;
  itemId: string;
  revision: number;
  order: number;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
};
type Control = { revision: number; nextOrder: number };
interface Project {
  token: string;
  control: Control;
  items: Record<string, Item>;
  links: Record<string, Link>;
  sessions: Record<string, Control>;
}
interface Operation {
  campaignId: string;
  fingerprint: string;
  result: P.PreparationOutcome;
}
interface Data {
  projects: Record<string, Project>;
  operations: Record<string, Operation>;
  fences: Record<string, { campaignId: string; fingerprint: string }>;
  calls: { campaignId: string; method: string; operationId?: string }[];
}
const storageKey = 'writer.visual.campaign-preparation';
const key = (...parts: string[]) => JSON.stringify(parts);
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
function canonical(value: unknown): unknown {
  return Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, canonical(v)]),
        )
      : value;
}
const fingerprint = (action: string, request: unknown) =>
  JSON.stringify(canonical({ action, request }));
const conflict = () => fail('A preparação mudou. Consulte a versão atual.', 'revision-conflict');
const identity = (campaignId: string, p: Project): P.PreparationIdentity => ({
  schemaVersion: 1,
  ownerId: fixtureOwner(),
  campaignId,
  campaignToken: p.token,
});
const pending = (row: Item) =>
  row.kind === 'clue'
    ? row.status === 'pending'
    : row.status === 'available' || row.status === 'active';
function summary(row: Item): P.PreparationItemSummary {
  const { id, kind, revision, order, title, status, createdAt, updatedAt } = row;
  return { id, kind, revision, order, title, status, createdAt, updatedAt };
}
function once(flag: string, method: string) {
  if (sessionStorage.getItem(flag) !== method) return false;
  sessionStorage.removeItem(flag);
  return true;
}
async function finish<T>(method: string, result: T): Promise<T> {
  const copy = structuredClone(result);
  if (once('writer.visual.preparation-lost-response', method))
    fail('A resposta não chegou. Confirme o mesmo pedido.', undefined, 'unavailable');
  if (sessionStorage.getItem('writer.visual.preparation-hold-response') === method) {
    await new Promise<void>((resolve) => {
      const check = () => {
        if (sessionStorage.getItem('writer.visual.preparation-hold-response') === method) return;
        clearInterval(timer);
        window.removeEventListener('writer.visual.release-preparation', check);
        resolve();
      };
      const timer = setInterval(check, 20);
      window.addEventListener('writer.visual.release-preparation', check);
      check();
    });
  }
  return copy;
}
function writable(campaignId: string, uid: string) {
  try {
    fixtureAssertCampaignWritable(campaignId, uid);
  } catch (error) {
    const reservation = fixtureCampaignDeletionReservation(campaignId);
    if (reservation?.ownerId === uid && error instanceof Error)
      Object.assign(error, {
        details: {
          reason: reservation.state === 'deleted' ? 'campaign-deleted' : 'campaign-deleting',
          campaignId,
          deletionId: reservation.deletionId,
        },
      });
    throw error;
  }
}
async function server<T>(
  method: string,
  input: { campaignId: string; campaignToken?: string; operationId?: string },
  work: (data: Data, p: Project) => T | Promise<T>,
): Promise<T> {
  const uid = fixtureOwner();
  writable(input.campaignId, uid);
  const root = await fixtureGet('campaign', input.campaignId);
  if (!root || root.ownerId !== uid) fail('Campanha indisponível.', undefined, 'not-found');
  const run = async () => {
    if (fixtureOwner() !== uid) fail('A conta mudou.', undefined, 'permission-denied');
    writable(input.campaignId, uid);
    const data = read(),
      projectKey = key(uid, input.campaignId),
      p = data.projects[projectKey] ?? {
        token: fixtureCampaignToken(uid, input.campaignId),
        control: { revision: 0, nextOrder: 1 },
        items: {},
        links: {},
        sessions: {},
      };
    if (input.campaignToken !== undefined && input.campaignToken !== p.token)
      fail('A identidade da campanha mudou.', 'campaign-changed');
    data.projects[projectKey] = p;
    data.calls.push({
      campaignId: input.campaignId,
      method,
      ...(input.operationId ? { operationId: input.operationId } : {}),
    });
    persist(data);
    if (once('writer.visual.preparation-before-receive', method))
      fail('Pedido não recebido.', undefined, 'unavailable');
    const value = await work(data, p);
    persist(data);
    return value;
  };
  const result = navigator.locks
    ? await navigator.locks.request(
        'writer.visual.preparation-server:' + key(uid, input.campaignId),
        run,
      )
    : await run();
  return finish(method, result);
}
function page<T extends { id: string; order: number }>(
  rows: T[],
  input: { cursor?: string; limit?: number },
  scope: unknown,
) {
  const limit = input.limit ?? 25;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50)
    fail('Página inválida.', undefined, 'invalid-argument');
  let offset = 0;
  if (input.cursor) {
    let cursor: { scope: string; id: string; order: number };
    try {
      cursor = JSON.parse(input.cursor) as typeof cursor;
    } catch {
      fail('Página inválida.', undefined, 'invalid-argument');
    }
    if (cursor.scope !== JSON.stringify(scope))
      fail('A lista mudou. Atualize os itens.', 'cursor-invalidated');
    offset = rows.findIndex((r) => r.id === cursor.id && r.order === cursor.order) + 1;
    if (!offset) fail('Página inválida.', 'cursor-invalidated');
  }
  const items = rows.slice(offset, offset + limit),
    last = items.at(-1);
  return {
    items,
    nextCursor:
      offset + limit < rows.length && last
        ? JSON.stringify({ scope: JSON.stringify(scope), id: last.id, order: last.order })
        : null,
  };
}
const ordered = <T extends { order: number; id: string }>(rows: T[]) =>
  rows.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
export function listCampaignPreparationItems(
  input: P.ListPreparationItemsInput,
): Promise<P.PreparationItemPage> {
  return server('listCampaignPreparationItems', input, (_d, p) => {
    const rows = ordered(
      Object.values(p.items).filter(
        (r) => !r.deleted && r.kind === input.kind && (input.view === 'all' || pending(r)),
      ),
    );
    return {
      ...identity(input.campaignId, p),
      itemCollectionRevision: p.control.revision,
      ...page(rows.map(summary), input, [
        fixtureOwner(),
        input.campaignId,
        p.token,
        input.kind,
        input.view,
        p.control.revision,
      ]),
    };
  });
}
export function getCampaignPreparationItem(
  input: P.GetPreparationItemInput,
): Promise<P.PreparationItemResult> {
  return server('getCampaignPreparationItem', input, (_d, p) => {
    const row = p.items[input.itemId];
    if (!row || row.deleted) fail('Item indisponível.', 'item-unavailable', 'not-found');
    if (row.revision !== input.expectedRevision) conflict();
    if (!row.body) fail('Corpo inconsistente.', 'preparation-inconsistent');
    return {
      ...identity(input.campaignId, p),
      itemCollectionRevision: p.control.revision,
      item: { ...summary(row), body: structuredClone(row.body) } as P.PreparationItem,
    };
  });
}
async function session(input: P.PreparationSessionScope) {
  const result = await getCampaignSession(input);
  if (!result.session) fail('Sessão indisponível.', undefined, 'not-found');
  if (result.session.revision !== input.expectedSessionRevision) conflict();
  return result.session;
}
export function listCampaignSessionPreparationLinks(
  input: P.PreparationSessionScope & { cursor?: string; limit?: number },
): Promise<P.PreparationLinkPage> {
  return server('listCampaignSessionPreparationLinks', input, async (_d, p) => {
    await session(input);
    const c = p.sessions[input.sessionId] ?? { revision: 0, nextOrder: 1 };
    const rows = ordered(
      Object.values(p.links).filter((l) => !l.deleted && l.sessionId === input.sessionId),
    );
    const result = page(rows, input, [
      fixtureOwner(),
      input.campaignId,
      p.token,
      input.sessionId,
      input.expectedSessionRevision,
      c.revision,
      p.control.revision,
    ]);
    return {
      ...identity(input.campaignId, p),
      sessionId: input.sessionId,
      sessionRevision: input.expectedSessionRevision,
      itemCollectionRevision: p.control.revision,
      linkCollectionRevision: c.revision,
      nextCursor: result.nextCursor,
      items: result.items.map((l) => {
        const own = {
            id: l.id,
            revision: l.revision,
            order: l.order,
            createdAt: l.createdAt,
            updatedAt: l.updatedAt,
          },
          item = p.items[l.itemId];
        if (!item) fail('Item inconsistente.', 'preparation-inconsistent');
        return item.deleted
          ? { ...own, available: false as const }
          : { ...own, available: true as const, target: summary(item) };
      }),
    };
  });
}
function prior(
  data: Data,
  p: Project,
  action: P.PreparationAction,
  request: P.PreparationRequest['request'],
): P.PreparationOutcome | null {
  const id = key(fixtureOwner(), request.operationId),
    fp = fingerprint(action, request),
    old = data.operations[id],
    fence = data.fences[id];
  if (old) {
    if (old.fingerprint !== fp)
      fail('Pedido usado com outros dados.', undefined, 'invalid-argument');
    return structuredClone(old.result);
  }
  if (fence) {
    if (fence.fingerprint !== fp)
      fail('Pedido usado com outros dados.', undefined, 'invalid-argument');
    return {
      ...identity(request.campaignId, p),
      kind: 'canceled',
      action,
      operationId: request.operationId,
    };
  }
  return null;
}
async function itemWrite(
  action: 'save-item' | 'delete-item' | 'move-item',
  input: P.SavePreparationItemInput | P.ItemWriteInput | P.MovePreparationItemInput,
): Promise<P.PreparationOutcome> {
  const method =
    action === 'save-item'
      ? 'saveCampaignPreparationItem'
      : action === 'delete-item'
        ? 'deleteCampaignPreparationItem'
        : 'moveCampaignPreparationItem';
  return server(method, input, (data, p) => {
    const previous = prior(data, p, action, input);
    if (previous) return previous;
    const old = p.items[input.itemId];
    if (
      p.control.revision !== input.expectedItemCollectionRevision ||
      (old?.revision ?? 0) !== input.expectedRevision
    )
      conflict();
    if (old?.deleted) fail('Item indisponível.', 'item-unavailable', 'not-found');
    if (!old && (action !== 'save-item' || input.itemId !== input.operationId))
      fail('Item indisponível.', 'item-unavailable', 'not-found');
    const next = p.control.revision + 1,
      updatedAt = FIXTURE_TIME + next;
    let order = old?.order ?? p.control.nextOrder;
    if (action === 'move-item') {
      if (!old) fail('Item indisponível.', 'item-unavailable', 'not-found');
      const move = input as P.MovePreparationItemInput,
        rows = ordered(Object.values(p.items).filter((r) => !r.deleted && r.kind === old.kind)),
        index = rows.findIndex((r) => r.id === input.itemId),
        neighbor = rows[index + (move.direction === 'up' ? -1 : 1)];
      if (!neighbor) fail('Não há item nesta direção.', 'order-boundary');
      order = neighbor.order;
      p.items[neighbor.id] = {
        ...neighbor,
        order: old.order,
        revision: neighbor.revision + 1,
        updatedAt,
      };
    }
    const metadata = {
      id: input.itemId,
      revision: input.expectedRevision + 1,
      order,
      createdAt: old?.createdAt ?? updatedAt,
      updatedAt,
      deleted: action === 'delete-item',
    };
    if (action === 'save-item') {
      const save = input as P.SavePreparationItemInput;
      if (old && old.kind !== save.kind) fail('Tipo imutável.', undefined, 'invalid-argument');
      p.items[input.itemId] = {
        ...metadata,
        kind: save.kind,
        title: save.title.trim(),
        status: save.status,
        body: structuredClone(save.body),
      };
    } else if (action === 'delete-item') p.items[input.itemId] = metadata as Item;
    else {
      if (!old) fail('Item indisponível.', 'item-unavailable', 'not-found');
      p.items[input.itemId] = { ...old, ...metadata };
    }
    p.control.revision = next;
    if (!old) p.control.nextOrder++;
    const result: P.PreparationOutcome = {
      ...identity(input.campaignId, p),
      kind: 'confirmed',
      receipt: {
        operationId: input.operationId,
        action,
        itemId: input.itemId,
        expectedRevision: input.expectedRevision,
        revision: metadata.revision,
        itemCollectionRevision: next,
      },
    };
    data.operations[key(fixtureOwner(), input.operationId)] = {
      campaignId: input.campaignId,
      fingerprint: fingerprint(action, input),
      result,
    };
    return result;
  });
}
export const saveCampaignPreparationItem = (input: P.SavePreparationItemInput) =>
  itemWrite('save-item', input);
export const deleteCampaignPreparationItem = (input: P.ItemWriteInput) =>
  itemWrite('delete-item', input);
export const moveCampaignPreparationItem = (input: P.MovePreparationItemInput) =>
  itemWrite('move-item', input);
async function linkWrite(
  action: 'add-link' | 'remove-link' | 'move-link',
  input: P.AddPreparationLinkInput | P.LinkWriteInput | P.MovePreparationLinkInput,
): Promise<P.PreparationOutcome> {
  const method =
    action === 'add-link'
      ? 'addCampaignSessionPreparationLink'
      : action === 'remove-link'
        ? 'removeCampaignSessionPreparationLink'
        : 'moveCampaignSessionPreparationLink';
  return server(method, input, async (data, p) => {
    const previous = prior(data, p, action, input);
    if (previous) return previous;
    await session(input);
    const c = p.sessions[input.sessionId] ?? { revision: 0, nextOrder: 1 },
      old = p.links[input.linkId];
    if (
      c.revision !== input.expectedLinkCollectionRevision ||
      (old?.revision ?? 0) !== input.expectedRevision
    )
      conflict();
    if (old && (old.deleted || old.sessionId !== input.sessionId))
      fail('Vínculo indisponível.', 'link-unavailable', 'not-found');
    let itemId = old?.itemId ?? '',
      order = old?.order ?? c.nextOrder;
    if (action === 'add-link') {
      const add = input as P.AddPreparationLinkInput;
      if (old || input.linkId !== input.operationId) conflict();
      const item = p.items[add.itemId];
      if (!item || item.deleted) fail('Item indisponível.', 'item-unavailable', 'not-found');
      if (item.revision !== add.expectedItemRevision) conflict();
      if (
        Object.values(p.links).some(
          (l) => !l.deleted && l.sessionId === input.sessionId && l.itemId === add.itemId,
        )
      )
        fail('O item já está nesta sessão.', 'preparation-already-linked');
      itemId = add.itemId;
    } else if (!old) fail('Vínculo indisponível.', 'link-unavailable', 'not-found');
    const updatedAt = FIXTURE_TIME + c.revision + 1;
    if (action === 'move-link') {
      if (!old) fail('Vínculo indisponível.', 'link-unavailable', 'not-found');
      const move = input as P.MovePreparationLinkInput,
        rows = ordered(
          Object.values(p.links).filter((l) => !l.deleted && l.sessionId === input.sessionId),
        ),
        index = rows.findIndex((l) => l.id === input.linkId),
        neighbor = rows[index + (move.direction === 'up' ? -1 : 1)];
      if (!neighbor) fail('Não há vínculo nesta direção.', 'order-boundary');
      order = neighbor.order;
      p.links[neighbor.id] = {
        ...neighbor,
        order: old.order,
        revision: neighbor.revision + 1,
        updatedAt,
      };
    }
    const row = {
      id: input.linkId,
      sessionId: input.sessionId,
      itemId,
      revision: input.expectedRevision + 1,
      order,
      createdAt: old?.createdAt ?? updatedAt,
      updatedAt,
      deleted: action === 'remove-link',
    };
    p.links[input.linkId] = row;
    c.revision++;
    if (!old) c.nextOrder++;
    p.sessions[input.sessionId] = c;
    const result: P.PreparationOutcome = {
      ...identity(input.campaignId, p),
      kind: 'confirmed',
      receipt: {
        operationId: input.operationId,
        action,
        linkId: input.linkId,
        sessionId: input.sessionId,
        expectedSessionRevision: input.expectedSessionRevision,
        expectedRevision: input.expectedRevision,
        revision: row.revision,
        linkCollectionRevision: c.revision,
      },
    };
    data.operations[key(fixtureOwner(), input.operationId)] = {
      campaignId: input.campaignId,
      fingerprint: fingerprint(action, input),
      result,
    };
    return result;
  });
}
export const addCampaignSessionPreparationLink = (input: P.AddPreparationLinkInput) =>
  linkWrite('add-link', input);
export const removeCampaignSessionPreparationLink = (input: P.LinkWriteInput) =>
  linkWrite('remove-link', input);
export const moveCampaignSessionPreparationLink = (input: P.MovePreparationLinkInput) =>
  linkWrite('move-link', input);
export function resolveCampaignPreparationOperation(
  input: P.ResolvePreparationInput,
): Promise<P.PreparationOutcome> {
  return server('resolveCampaignPreparationOperation', input.request, (data, p) => {
    const old = prior(data, p, input.action, input.request);
    if (old) return old;
    data.fences[key(fixtureOwner(), input.request.operationId)] = {
      campaignId: input.request.campaignId,
      fingerprint: fingerprint(input.action, input.request),
    };
    return {
      ...identity(input.request.campaignId, p),
      kind: 'canceled',
      action: input.action,
      operationId: input.request.operationId,
    };
  });
}
export function fixtureDeleteCampaignPreparation(uid: string, campaignId: string): void {
  if (uid !== fixtureOwner()) fail('A conta mudou.', undefined, 'permission-denied');
  const data = read();
  delete data.projects[key(uid, campaignId)];
  for (const [k, v] of Object.entries(data.operations))
    if (v.campaignId === campaignId) delete data.operations[k];
  for (const [k, v] of Object.entries(data.fences))
    if (v.campaignId === campaignId) delete data.fences[k];
  persist(data);
}
export const fixturePreparationCalls = () => structuredClone(read().calls);
export async function fixtureSeedCampaignPreparation() {
  const sources = await import('./campaignSessionReferenceFixture'),
    source = await sources.fixtureSeedSessionScenes(false);
  const scope = { campaignId: source.campaignId, campaignToken: source.campaignToken };
  let page = await listCampaignPreparationItems({ ...scope, kind: 'clue', view: 'all' });
  const clueId = 'visual-preparation-own-clue',
    questId = 'visual-preparation-own-quest';
  const result = await saveCampaignPreparationItem({
    ...scope,
    itemId: clueId,
    operationId: clueId,
    expectedRevision: 0,
    expectedItemCollectionRevision: page.itemCollectionRevision,
    kind: 'clue',
    title: 'A chave da maré',
    status: 'pending',
    body: {
      text: '  PISTA PRÓPRIA 🐉\nSem copiar o original.  ',
      condition: 'Se procurar a gaveta',
      recipient: 'Tripulação inteira',
    },
  });
  if (result.kind !== 'confirmed' || !('itemCollectionRevision' in result.receipt))
    throw new Error('Pista não criada.');
  await saveCampaignPreparationItem({
    ...scope,
    itemId: questId,
    operationId: questId,
    expectedRevision: 0,
    expectedItemCollectionRevision: result.receipt.itemCollectionRevision,
    kind: 'quest',
    title: 'Salvar o farol',
    status: 'available',
    body: { description: 'MISSÃO PRÓPRIA', consequences: 'A vila pode recuperar a luz' },
  });
  page = await listCampaignPreparationItems({ ...scope, kind: 'clue', view: 'all' });
  return {
    ...source,
    clueId,
    questId,
    clueText: '  PISTA PRÓPRIA 🐉\nSem copiar o original.  ',
    itemCollectionRevision: page.itemCollectionRevision,
  };
}
