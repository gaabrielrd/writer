import type * as D from '../../../src/features/campaign-deletions/model/campaignDeletion';
import {
  fixtureCampaignDeletionReservation,
  fixtureCampaignToken,
  fixtureFinishCampaignDeletion,
  fixtureGet,
  fixtureOwner,
  fixtureReserveCampaignDeletion,
} from './studioStore';
import {
  fixtureCampaignCaptureReservedId,
  fixtureDeleteCampaignBases,
} from './campaignBaseFixture';
import { fixtureDeleteCampaignLore } from './campaignLoreFixture';
import { fixtureDeleteCampaignComparisons } from './campaignComparisonFixture';
import { fixtureDeleteCampaignAdoptions } from './campaignAdoptionFixture';
import { fixtureDeleteCampaignNotes } from './campaignNotesFixture';
import { fixtureDeleteCampaignSessions } from './campaignSessionFixture';
import { fixtureDeleteCampaignPreparation } from './campaignPreparationFixture';
import { fixtureDeleteCampaignSessionReferences } from './campaignSessionReferenceFixture';
import { fixtureDeleteCampaignWork } from './workProgressFixture';
import { FIXTURE_TIME } from './data';

type Receipt = { fingerprint: string; receipt: D.DeletionReceipt; deletionId: string };
interface Data {
  jobs: Record<string, D.DeletionProgress>;
  receipts: Record<string, Receipt>;
  fences: Record<string, string>;
  calls: {
    uid: string;
    method: string;
    operationId?: string;
    campaignId?: string;
    deletionId?: string;
    expectedCheckpoint?: number;
  }[];
}
const storageKey = 'writer.visual.campaign-deletions';
const key = (uid: string, id: string) => JSON.stringify([uid, id]);
const clone = <T>(value: T): T => structuredClone(value);
const read = (): Data =>
  JSON.parse(
    localStorage.getItem(storageKey) ?? '{"jobs":{},"receipts":{},"fences":{},"calls":[]}',
  ) as Data;
const persist = (data: Data) => localStorage.setItem(storageKey, JSON.stringify(data));
function fail(message: string, code = 'failed-precondition', reason?: string): never {
  throw Object.assign(new Error(message), {
    code: 'functions/' + code,
    ...(reason ? { details: { reason } } : {}),
  });
}
function current(uid: string) {
  if (fixtureOwner() !== uid) fail('A conta mudou.', 'permission-denied');
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => [key, canonical(value)]),
    );
  return value;
}
const fingerprint = (action: string, input: unknown) =>
  JSON.stringify(canonical({ action, input }));
function once(flag: string, method: string) {
  if (sessionStorage.getItem(flag) !== method) return false;
  sessionStorage.removeItem(flag);
  return true;
}
async function finish<T>(method: string, result: T): Promise<T> {
  const value = clone(result);
  if (once('writer.visual.deletion-lost-response', method))
    fail('A resposta não chegou. Confirme o mesmo pedido.', 'unavailable');
  if (sessionStorage.getItem('writer.visual.deletion-hold-response') === method) {
    const data = read();
    data.calls.push({ uid: fixtureOwner(), method: 'held:' + method });
    persist(data);
    await new Promise<void>((resolve) => {
      const check = () => {
        if (sessionStorage.getItem('writer.visual.deletion-hold-response') === method) return;
        clearInterval(timer);
        window.removeEventListener('writer.visual.release-deletion', check);
        resolve();
      };
      const timer = setInterval(check, 20);
      window.addEventListener('writer.visual.release-deletion', check);
      check();
    });
  }
  return value;
}
async function server<T>(
  method: string,
  input: {
    operationId?: string;
    campaignId?: string;
    deletionId?: string;
    expectedCheckpoint?: number;
  },
  work: (data: Data, uid: string) => T | Promise<T>,
): Promise<T> {
  const uid = fixtureOwner();
  const run = async () => {
    current(uid);
    const data = read();
    data.calls.push({
      uid,
      method,
      ...Object.fromEntries(
        Object.entries(input).filter(([key]) =>
          ['operationId', 'campaignId', 'deletionId', 'expectedCheckpoint'].includes(key),
        ),
      ),
    });
    persist(data);
    if (once('writer.visual.deletion-before-receive', method))
      fail('O pedido não foi recebido.', 'unavailable');
    const value = await work(data, uid);
    current(uid);
    persist(data);
    return value;
  };
  // This models a server transaction; the real browser adapter has a different lock namespace.
  const value = navigator.locks
    ? await navigator.locks.request('writer.visual.deletion-server:' + uid, run)
    : await run();
  return finish(method, value);
}
function job(data: Data, uid: string, id: string): D.DeletionProgress {
  const value = data.jobs[key(uid, id)];
  if (!value || value.ownerId !== uid) fail('Exclusão indisponível.', 'not-found');
  const reservation = fixtureCampaignDeletionReservation(value.campaignId);
  if (
    !reservation ||
    reservation.ownerId !== uid ||
    reservation.campaignToken !== value.campaignToken ||
    reservation.deletionId !== id
  )
    fail('Reserva de exclusão inconsistente.');
  return value;
}
function prior(
  data: Data,
  uid: string,
  action: 'start' | 'advance',
  input: D.StartDeletionInput | D.AdvanceDeletionInput,
): D.DeletionMutation | null {
  const previous = data.receipts[key(uid, input.operationId)];
  if (!previous) return null;
  if (previous.fingerprint !== fingerprint(action, input))
    fail('Identificador usado por outro pedido.', 'invalid-argument');
  return { receipt: clone(previous.receipt), progress: clone(job(data, uid, previous.deletionId)) };
}
function commit(
  data: Data,
  uid: string,
  action: 'start' | 'advance',
  input: D.StartDeletionInput | D.AdvanceDeletionInput,
  value: D.DeletionProgress,
): D.DeletionMutation {
  const receipt: D.DeletionReceipt = {
    operationId: input.operationId,
    action,
    expectedCheckpoint: 'expectedCheckpoint' in input ? input.expectedCheckpoint : null,
    confirmedCheckpoint: value.checkpoint,
  };
  data.receipts[key(uid, input.operationId)] = {
    fingerprint: fingerprint(action, input),
    receipt,
    deletionId: value.deletionId,
  };
  return { receipt: clone(receipt), progress: clone(value) };
}
export async function getCampaignDeletionSource(input: {
  campaignId: string;
}): Promise<D.DeletionSource | null> {
  const uid = fixtureOwner(),
    root = await fixtureGet('campaign', input.campaignId);
  current(uid);
  if (
    !root ||
    root.ownerId !== uid ||
    root.schemaVersion !== 1 ||
    fixtureCampaignDeletionReservation(input.campaignId)
  )
    return null;
  return {
    schemaVersion: 1,
    ownerId: uid,
    campaignId: root.id,
    campaignToken: fixtureCampaignToken(uid, root.id),
    revision: root.revision,
    title: root.title,
  };
}
export function startCampaignDeletion(
  input: D.StartDeletionInput,
): Promise<D.DeletionMutation | D.DeletionStartCanceled> {
  return server('startCampaignDeletion', input, async (data, uid) => {
    const previous = prior(data, uid, 'start', input);
    if (previous) return previous;
    const fence = data.fences[key(uid, input.operationId)];
    if (fence) {
      if (fence !== fingerprint('start', input))
        fail('Pedido diferente do encerrado.', 'invalid-argument');
      return { kind: 'canceled', schemaVersion: 1, ownerId: uid, request: clone(input) };
    }
    const source = await getCampaignDeletionSource({ campaignId: input.campaignId });
    current(uid);
    if (!source) fail('Campanha indisponível.', 'not-found');
    if (source.campaignToken !== input.campaignToken || source.revision !== input.expectedRevision)
      fail(
        'A campanha mudou. Consulte e confirme novamente.',
        'failed-precondition',
        'revision-conflict',
      );
    const value: D.DeletionProgress = {
      schemaVersion: 1,
      ownerId: uid,
      campaignId: input.campaignId,
      campaignToken: input.campaignToken,
      deletionId: input.operationId,
      state: 'deleting',
      phase: 'recovery',
      checkpoint: 0,
      complete: false,
      revoked: true,
      createdAt: FIXTURE_TIME,
      updatedAt: FIXTURE_TIME,
    };
    fixtureReserveCampaignDeletion({
      ownerId: uid,
      campaignId: input.campaignId,
      campaignToken: input.campaignToken,
      deletionId: value.deletionId,
      state: 'deleting',
    });
    data.jobs[key(uid, value.deletionId)] = value;
    return commit(data, uid, 'start', input, value);
  });
}
export function resolveCampaignDeletionStart(
  input: D.StartDeletionInput & { intent: 'cancel' },
): Promise<D.DeletionMutation | D.DeletionStartCanceled> {
  const { intent, ...request } = input;
  if (intent !== 'cancel') fail('Intenção inválida.', 'invalid-argument');
  return server('resolveCampaignDeletionStart', request, (data, uid) => {
    const previous = prior(data, uid, 'start', request);
    if (previous) return previous;
    const entry = key(uid, request.operationId),
      value = fingerprint('start', request);
    if (data.fences[entry] && data.fences[entry] !== value)
      fail('Pedido diferente do encerrado.', 'invalid-argument');
    data.fences[entry] = value;
    return { kind: 'canceled', schemaVersion: 1, ownerId: uid, request: clone(request) };
  });
}
export async function getCampaignDeletion(input: D.DeletionLookupInput): Promise<D.DeletionLookup> {
  const uid = fixtureOwner(),
    campaignId =
      'campaignId' in input
        ? input.campaignId
        : fixtureCampaignCaptureReservedId(uid, input.captureId),
    reservation = fixtureCampaignDeletionReservation(campaignId),
    data = read();
  const deletion =
    reservation?.ownerId === uid ? clone(job(data, uid, reservation.deletionId)) : null;
  return finish('getCampaignDeletion', {
    schemaVersion: 1,
    ownerId: uid,
    lookup: clone(input),
    deletion,
  });
}
export async function listCampaignDeletions(
  input: { cursor?: string; limit?: number } = {},
): Promise<D.DeletionList> {
  const uid = fixtureOwner(),
    size = input.limit ?? 25;
  const rows = Object.values(read().jobs)
    .filter((row) => row.ownerId === uid)
    .sort((a, b) => a.deletionId.localeCompare(b.deletionId));
  const cursor = input.cursor ? (JSON.parse(input.cursor) as { uid: string; last: string }) : null;
  if (cursor && cursor.uid !== uid) fail('Página de outra conta.', 'invalid-argument');
  const remaining = rows.filter((row) => !cursor || row.deletionId > cursor.last),
    items = remaining.slice(0, size);
  return finish('listCampaignDeletions', {
    items,
    nextCursor:
      remaining.length > size ? JSON.stringify({ uid, last: items.at(-1)!.deletionId }) : null,
  });
}
const phases: D.DeletionPhase[] = [
  'recovery',
  'controls',
  'bases',
  'lore-generations',
  'campaign-children',
  'activity',
  'finalizing',
  'complete',
];
export function advanceCampaignDeletion(
  input: D.AdvanceDeletionInput,
): Promise<D.DeletionMutation> {
  return server('advanceCampaignDeletion', input, (data, uid) => {
    const previous = prior(data, uid, 'advance', input);
    if (previous) return previous;
    const value = job(data, uid, input.deletionId);
    if (value.checkpoint !== input.expectedCheckpoint)
      fail(
        'O progresso mudou. Consulte antes de continuar.',
        'failed-precondition',
        'checkpoint-conflict',
      );
    if (value.complete) fail('A exclusão já terminou.');
    let complete = true;
    switch (value.phase) {
      case 'recovery':
        fixtureDeleteCampaignLore(uid, value.campaignId, 'recovery');
        break;
      case 'controls':
        complete = fixtureDeleteCampaignAdoptions(uid, value.campaignId);
        complete = fixtureDeleteCampaignComparisons(uid, value.campaignId) && complete;
        break;
      case 'bases':
        complete = fixtureDeleteCampaignBases(uid, value.campaignId);
        break;
      case 'lore-generations':
        fixtureDeleteCampaignLore(uid, value.campaignId, 'bodies');
        break;
      case 'campaign-children':
        fixtureDeleteCampaignNotes(uid, value.campaignId);
        fixtureDeleteCampaignSessions(uid, value.campaignId);
        fixtureDeleteCampaignPreparation(uid, value.campaignId);
        fixtureDeleteCampaignSessionReferences(uid, value.campaignId);
        fixtureDeleteCampaignWork(uid, value.campaignId, 'children');
        break;
      case 'activity':
        fixtureDeleteCampaignWork(uid, value.campaignId, 'activity');
        break;
      case 'finalizing':
        fixtureFinishCampaignDeletion(uid, value.campaignId, value.campaignToken, value.deletionId);
        value.complete = true;
        value.state = 'deleted';
        break;
    }
    if (complete) value.phase = phases[phases.indexOf(value.phase) + 1];
    value.checkpoint++;
    value.updatedAt++;
    return commit(data, uid, 'advance', input, value);
  });
}

// Scenario setup uses the existing source writers; it does not activate a comparison candidate.
export async function fixtureSeedCampaignDeletion(captured: boolean) {
  const studio = await import('./studioStore'),
    worlds = await import('./universeService'),
    notes = await import('./campaignNotesFixture'),
    work = await import('./workProgressFixture');
  const world = await worlds.createUniverse(
    { name: 'Universo preservado na exclusão', description: 'Origem preservada' },
    'deletion-world',
  );
  let campaign,
    adventureId: string | null = null,
    baseId: string | null = null,
    captureId: string | null = null,
    captureRequest:
      | import('../../../src/features/campaign-bases/model/campaignBase').StartCampaignCaptureInput
      | null = null;
  if (captured) {
    const adventures = await import('./adventureService'),
      scenes = await import('./sceneService'),
      lore = await import('./loreService'),
      bases = await import('./campaignBaseFixture');
    const adventure = await adventures.createAdventure({
      operationId: 'delete-captured-origin',
      title: 'Aventura preservada após excluir mesa',
      synopsis: 'SINOPSE ORIGINAL PRESERVADA',
      universeId: world.id,
    });
    adventureId = adventure.id;
    const entity = await lore.createLoreEntity(
      { kind: 'universe', id: world.id },
      {
        name: 'Lia da origem preservada',
        category: 'character',
        summary: 'Resumo da origem',
        details: 'CORPO DA ORIGEM PRESERVADO',
      },
    );
    const target = { kind: 'adventure' as const, id: adventure.id },
      scene = (
        await scenes.createScene({
          target,
          operationId: 'delete-captured-scene',
          parentId: null,
          title: 'Cena da origem preservada',
          content: '<p>PROSA DA AVENTURA PRESERVADA</p>',
        })
      ).scene;
    await scenes.setSceneReference({
      target,
      sceneId: scene.id,
      operationId: 'delete-captured-ref',
      expectedRevision: scene.revision,
      reference: { kind: 'universe', scopeId: world.id, entityId: entity.id.split(':').at(-1)! },
    });
    const source = await bases.getCampaignCaptureSource({ adventureId: adventure.id });
    captureRequest = {
      operationId: 'delete-base-capture',
      adventureId: adventure.id,
      expectedSourceToken: source.sourceToken,
      title: 'Mesa capturada a excluir',
      description: 'DESCRIÇÃO PARTICULAR A EXCLUIR',
      universeId: world.id,
    };
    let p = await bases.startCampaignCapture(captureRequest);
    for (let i = 0; p.state === 'preparing' && i < 30; i++)
      p = await bases.advanceCampaignCapture({
        captureId: p.captureId,
        operationId: 'delete-base-step-' + i,
        expectedCheckpoint: p.checkpoint,
      });
    const activation = await bases.activateCampaignCapture({
      captureId: p.captureId,
      operationId: 'delete-base-activate',
      expectedCheckpoint: p.checkpoint,
    });
    if (activation.kind !== 'activated') throw Error('Captura de preparação não ativada.');
    campaign = activation.campaign;
    baseId = p.reserved.baseId;
    captureId = p.captureId;
  } else
    campaign = await studio.fixtureCreate('campaign', {
      operationId: 'delete-independent',
      title: 'Mesa independente a excluir',
      description: 'DESCRIÇÃO INDEPENDENTE A EXCLUIR',
      universeId: world.id,
    });
  const other = await studio.fixtureCreate('campaign', {
    operationId: 'delete-other-kept',
    title: 'Outra mesa permanece',
    description: 'DESCRIÇÃO DA OUTRA MESA PRESERVADA',
    universeId: world.id,
  });
  for (const row of [campaign, other]) {
    const n = await notes.listCampaignNotes({ campaignId: row.id });
    await notes.saveCampaignNote({
      campaignId: row.id,
      campaignToken: n.campaignToken,
      noteId: 'own-note-' + row.id,
      operationId: 'own-note-' + row.id,
      expectedRevision: 0,
      title: row.id === campaign.id ? 'Nota particular a excluir' : 'Nota da outra mesa preservada',
      content:
        row.id === campaign.id
          ? 'TEXTO PARTICULAR A EXCLUIR'
          : 'TEXTO PARTICULAR DA OUTRA MESA PRESERVADO',
    });
    await work.createWorkChecklistItem({
      target: { kind: 'campaign', id: row.id },
      operationId: 'task-' + row.id,
      title:
        row.id === campaign.id
          ? 'Preparação particular a excluir'
          : 'Preparação da outra mesa preservada',
    });
  }
  return {
    campaignId: campaign.id,
    title: campaign.title,
    otherId: other.id,
    otherTitle: other.title,
    otherRoot: JSON.stringify(other),
    worldId: world.id,
    adventureId,
    baseId,
    captureId,
    captureRequest,
  };
}
