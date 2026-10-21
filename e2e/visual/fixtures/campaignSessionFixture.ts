import type * as C from '../../../src/features/campaign-sessions/model/campaignSession';
import {
  fixtureAssertCampaignWritable,
  fixtureCampaignToken,
  fixtureCampaignDeletionReservation,
  fixtureGet,
  fixtureOwner,
} from './studioStore';
import { FIXTURE_TIME } from './data';

type Stored = C.CampaignSession & { campaignToken: string; deleted: boolean };
type Tombstone = Pick<
  Stored,
  | 'id'
  | 'schemaVersion'
  | 'ownerId'
  | 'campaignId'
  | 'campaignToken'
  | 'revision'
  | 'order'
  | 'createdAt'
  | 'updatedAt'
  | 'deleted'
>;
interface Project {
  token: string;
  revision: number;
  nextOrder: number;
  sessions: Record<string, Stored | Tombstone>;
}
interface Receipt {
  ownerId: string;
  campaignId: string;
  token: string;
  fingerprint: string;
  receipt: C.CampaignSessionReceipt;
  confirmationHash: string;
}
interface Call {
  uid: string;
  campaignId: string;
  method: string;
  sessionId?: string;
  operationId?: string;
  expectedRevision?: number;
}
interface Data {
  projects: Record<string, Project>;
  receipts: Record<string, Receipt>;
  calls: Call[];
}
const storageKey = 'writer.visual.campaign-sessions';
const key = (...parts: string[]) => JSON.stringify(parts);
const read = (): Data =>
  JSON.parse(
    localStorage.getItem(storageKey) ?? '{"projects":{},"receipts":{},"calls":[]}',
  ) as Data;
const persist = (data: Data) => localStorage.setItem(storageKey, JSON.stringify(data));
function fail(message: string, reason?: string, code = 'failed-precondition'): never {
  throw Object.assign(new Error(message), {
    code: 'functions/' + code,
    ...(reason ? { details: { reason } } : {}),
  });
}
function hash(value: unknown): string {
  const canonical = (item: unknown): unknown =>
    item && typeof item === 'object'
      ? Array.isArray(item)
        ? item.map(canonical)
        : Object.fromEntries(
            Object.entries(item)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([name, v]) => [name, canonical(v)]),
          )
      : item;
  let result = 2166136261;
  for (const char of JSON.stringify(canonical(value)))
    result = Math.imul(result ^ char.codePointAt(0)!, 16777619);
  return (result >>> 0).toString(16).padStart(8, '0').repeat(8);
}
const conflict = () => fail('A sessão mudou. Consulte a versão atual.', 'revision-conflict');
const safe = (value: number, min = 0) => Number.isSafeInteger(value) && value >= min;
function budget<T>(value: T): T {
  if (new TextEncoder().encode(JSON.stringify(value)).length > 4 * 1024 * 1024)
    fail('Resposta acima do orçamento.');
  return structuredClone(value);
}
function summary(row: Stored | Tombstone): C.CampaignSessionSummary {
  if (row.deleted || !('title' in row)) fail('Sessão indisponível.', undefined, 'not-found');
  return {
    id: row.id,
    schemaVersion: row.schemaVersion,
    ownerId: row.ownerId,
    campaignId: row.campaignId,
    revision: row.revision,
    order: row.order,
    title: row.title,
    scheduledDate: row.scheduledDate,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
function full(row: Stored | Tombstone): C.CampaignSession {
  if (row.deleted || !('summary' in row)) fail('Sessão indisponível.', undefined, 'not-found');
  return { ...summary(row), summary: row.summary };
}
const envelope = (
  uid: string,
  campaignId: string,
  project: Project,
): C.CampaignSessionEnvelope => ({
  schemaVersion: 1,
  ownerId: uid,
  campaignId,
  campaignToken: project.token,
  collectionRevision: project.revision,
});
function assertWritable(campaignId: string, uid: string): void {
  try {
    fixtureAssertCampaignWritable(campaignId, uid);
  } catch (error) {
    const reservation = fixtureCampaignDeletionReservation(campaignId);
    if (reservation?.ownerId === uid && error instanceof Error) {
      Object.assign(error, {
        details: {
          reason: reservation.state === 'deleted' ? 'campaign-deleted' : 'campaign-deleting',
          campaignId,
          deletionId: reservation.deletionId,
        },
      });
    }
    throw error;
  }
}
async function server<T>(
  uid: string,
  input: {
    campaignId: string;
    campaignToken?: string;
    sessionId?: string;
    operationId?: string;
    expectedRevision?: number;
  },
  method: string,
  work: (data: Data, project: Project) => T,
): Promise<T> {
  assertWritable(input.campaignId, uid);
  const campaign = await fixtureGet('campaign', input.campaignId);
  if (!campaign || campaign.ownerId !== uid || campaign.schemaVersion !== 1)
    fail('Campanha indisponível.', undefined, 'not-found');
  const run = () => {
    assertWritable(input.campaignId, uid);
    const data = read(),
      projectKey = key(uid, input.campaignId);
    const project = data.projects[projectKey] ?? {
      token: fixtureCampaignToken(uid, input.campaignId),
      revision: 0,
      nextOrder: 1,
      sessions: {},
    };
    if (!safe(project.revision) || !safe(project.nextOrder, 1))
      fail('Controle inconsistente.', 'session-inconsistent');
    if (input.campaignToken !== undefined && input.campaignToken !== project.token)
      fail('A identidade da campanha mudou.', 'campaign-changed');
    data.projects[projectKey] = project;
    data.calls.push({
      uid,
      campaignId: input.campaignId,
      method,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.operationId
        ? { operationId: input.operationId, expectedRevision: input.expectedRevision }
        : {}),
    });
    persist(data);
    return budget(work(data, project));
  };
  // This lock models a server transaction, separate from the real product journal/Web Lock.
  return navigator.locks
    ? navigator.locks.request('writer.visual.sessions-server:' + key(uid, input.campaignId), run)
    : run();
}
const ordered = (project: Project) =>
  Object.values(project.sessions)
    .filter((row) => !row.deleted)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
export function listCampaignSessions(
  input: C.ListCampaignSessionsInput,
): Promise<C.CampaignSessionPage> {
  const uid = fixtureOwner(),
    limit = input.limit ?? 25;
  if (!safe(limit, 1) || limit > 50) fail('Página inválida.', undefined, 'invalid-argument');
  return server(uid, input, 'listCampaignSessions', (_data, project) => {
    let offset = 0;
    const rows = ordered(project);
    if (input.cursor) {
      let cursor: {
        uid: string;
        campaignId: string;
        token: string;
        revision: number;
        order: number;
        id: string;
      };
      try {
        cursor = JSON.parse(input.cursor) as typeof cursor;
      } catch {
        fail('Página inválida.', undefined, 'invalid-argument');
      }
      if (
        cursor.uid !== uid ||
        cursor.campaignId !== input.campaignId ||
        cursor.token !== project.token ||
        cursor.revision !== project.revision
      )
        fail('As sessões mudaram. Recarregue a lista.', 'cursor-invalidated');
      offset = rows.findIndex((row) => row.id === cursor.id && row.order === cursor.order) + 1;
      if (!offset) fail('Página inválida.', 'cursor-invalidated');
    }
    const page = rows.slice(offset, offset + limit),
      last = page.at(-1);
    return {
      ...envelope(uid, input.campaignId, project),
      items: page.map(summary),
      nextCursor:
        offset + limit < rows.length && last
          ? JSON.stringify({
              uid,
              campaignId: input.campaignId,
              token: project.token,
              revision: project.revision,
              order: last.order,
              id: last.id,
            })
          : null,
    };
  });
}
export function getCampaignSession(
  input: C.GetCampaignSessionInput,
): Promise<C.CampaignSessionResult> {
  return server(fixtureOwner(), input, 'getCampaignSession', (_data, project) => {
    const row = project.sessions[input.sessionId];
    return {
      ...envelope(fixtureOwner(), input.campaignId, project),
      session: row && !row.deleted ? full(row) : null,
    };
  });
}
function validateForm(input: C.SaveCampaignSessionInput) {
  const [year, month, day] = (input.scheduledDate ?? '').split('-').map(Number),
    leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const dateValid =
    input.scheduledDate === null ||
    (/^\d{4}-\d{2}-\d{2}$/.test(input.scheduledDate) &&
      year >= 1 &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]);
  if (
    !input.title.trim() ||
    input.title.trim().length > 300 ||
    input.summary.length > 150000 ||
    new TextEncoder().encode(input.summary).length > 512 * 1024 ||
    !dateValid ||
    !['planned', 'running', 'completed'].includes(input.status)
  )
    fail('Título, preparação, data ou estado inválido.', undefined, 'invalid-argument');
  if (
    input.expectedRevision === 0 &&
    (input.sessionId !== input.operationId || input.status !== 'planned')
  )
    fail(
      'Crie uma sessão Planejada com o identificador da operação.',
      undefined,
      'invalid-argument',
    );
}
async function response<T>(method: string, value: T): Promise<T> {
  if (sessionStorage.getItem('writer.visual.session-lost-response') === method) {
    sessionStorage.removeItem('writer.visual.session-lost-response');
    fail('A resposta se perdeu. Confirme o mesmo pedido.', undefined, 'unavailable');
  }
  if (sessionStorage.getItem('writer.visual.session-hold-response') === method) {
    await new Promise<void>((resolve) =>
      window.addEventListener('writer.visual.release-session', () => resolve(), { once: true }),
    );
  }
  return budget(value);
}
type Input = C.SaveCampaignSessionInput | C.MoveCampaignSessionInput | C.DeleteCampaignSessionInput;
async function mutate(
  input: Input,
  action: C.CampaignSessionReceipt['action'],
): Promise<C.CampaignSessionMutation> {
  const method =
      action === 'save'
        ? 'saveCampaignSession'
        : action === 'move'
          ? 'moveCampaignSession'
          : 'deleteCampaignSession',
    uid = fixtureOwner();
  if (!safe(input.expectedRevision)) fail('Revisão inválida.', undefined, 'invalid-argument');
  if (action === 'save') validateForm(input as C.SaveCampaignSessionInput);
  if (sessionStorage.getItem('writer.visual.session-before-receive') === method) {
    sessionStorage.removeItem('writer.visual.session-before-receive');
    fail('Não foi possível enviar. Confirme o mesmo pedido.', undefined, 'unavailable');
  }
  const normalized =
    action === 'save'
      ? { ...input, title: (input as C.SaveCampaignSessionInput).title.trim() }
      : input;
  const value = await server(uid, input, method, (data, project) => {
    const fingerprint = hash({ action, input: normalized }),
      previous = data.receipts[key(uid, input.operationId)],
      current = project.sessions[input.sessionId];
    if (previous) {
      if (
        previous.fingerprint !== fingerprint ||
        previous.campaignId !== input.campaignId ||
        previous.token !== project.token
      )
        fail('Operação usada com outro pedido.', undefined, 'invalid-argument');
      if (!current || current.revision < previous.receipt.revision)
        fail('Sessão inconsistente.', 'session-inconsistent');
      let session = null;
      if (current.revision === previous.receipt.revision) {
        const confirmed = current.deleted ? current : full(current);
        if (hash(confirmed) !== previous.confirmationHash)
          fail('Sessão inconsistente.', 'session-inconsistent');
        if (!current.deleted) session = full(current);
      }
      return { ...envelope(uid, input.campaignId, project), receipt: previous.receipt, session };
    }
    if ((current?.revision ?? 0) !== input.expectedRevision) conflict();
    if (current?.deleted || (!current && action !== 'save'))
      fail('Sessão indisponível.', undefined, 'not-found');
    const revision = input.expectedRevision + 1,
      collectionRevision = project.revision + 1;
    let order = current?.order ?? project.nextOrder;
    if (!safe(revision, 1) || !safe(collectionRevision, 1))
      fail('Controle inconsistente.', 'session-inconsistent');
    if (action === 'move') {
      const move = input as C.MoveCampaignSessionInput;
      if (move.expectedCollectionRevision !== project.revision) conflict();
      const rows = ordered(project),
        index = rows.findIndex((row) => row.id === input.sessionId),
        neighbor = rows[index + (move.direction === 'up' ? -1 : 1)];
      if (!neighbor) fail('Não há sessão nesta direção.', 'order-boundary');
      order = neighbor.order;
      project.sessions[neighbor.id] = {
        ...neighbor,
        order: current.order,
        revision: neighbor.revision + 1,
        updatedAt: FIXTURE_TIME + collectionRevision,
      };
    }
    const metadata: Tombstone = {
      id: input.sessionId,
      schemaVersion: 1,
      ownerId: uid,
      campaignId: input.campaignId,
      campaignToken: project.token,
      revision,
      order,
      createdAt: current?.createdAt ?? FIXTURE_TIME + collectionRevision,
      updatedAt: FIXTURE_TIME + collectionRevision,
      deleted: action === 'delete',
    };
    const row =
      action === 'save'
        ? {
            ...metadata,
            title: (input as C.SaveCampaignSessionInput).title.trim(),
            summary: (input as C.SaveCampaignSessionInput).summary,
            scheduledDate: (input as C.SaveCampaignSessionInput).scheduledDate,
            status: (input as C.SaveCampaignSessionInput).status,
          }
        : action === 'move'
          ? { ...current, ...metadata }
          : metadata;
    project.sessions[input.sessionId] = row;
    project.revision = collectionRevision;
    if (!current) project.nextOrder++;
    const receipt: C.CampaignSessionReceipt = {
      operationId: input.operationId,
      action,
      sessionId: input.sessionId,
      expectedRevision: input.expectedRevision,
      revision,
      collectionRevision,
    };
    const session = row.deleted ? null : full(row);
    data.receipts[key(uid, input.operationId)] = {
      ownerId: uid,
      campaignId: input.campaignId,
      token: project.token,
      fingerprint,
      receipt,
      confirmationHash: hash(session ?? row),
    };
    persist(data);
    return { ...envelope(uid, input.campaignId, project), receipt, session };
  });
  return response(method, value);
}
export const saveCampaignSession = (input: C.SaveCampaignSessionInput) => mutate(input, 'save');
export const moveCampaignSession = (input: C.MoveCampaignSessionInput) => mutate(input, 'move');
export const deleteCampaignSession = (input: C.DeleteCampaignSessionInput) =>
  mutate(input, 'delete');

export function fixtureDeleteCampaignSessions(uid: string, campaignId: string): void {
  if (uid !== fixtureOwner()) fail('A conta mudou.', undefined, 'permission-denied');
  const data = read();
  delete data.projects[key(uid, campaignId)];
  for (const [receiptKey, receipt] of Object.entries(data.receipts))
    if (receipt.ownerId === uid && receipt.campaignId === campaignId)
      delete data.receipts[receiptKey];
  // Simulated cleanup only; real C4 receipt sanitization/inventory is proved by SDK tests.
  persist(data);
}
