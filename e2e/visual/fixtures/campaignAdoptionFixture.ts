import type * as A from '../../../src/features/campaign-adoptions/model/campaignAdoption';
import type * as R from '../../../src/features/campaign-lore/model/campaignLoreRemote';
import {
  fixtureCampaignAdoptionComparison,
  fixtureCampaignAdoptionClaim,
  fixtureCampaignComparisonAdopt,
} from './campaignComparisonFixture';
import {
  fixtureCampaignLoreAdoptionSnapshot,
  fixtureCampaignLoreAdoptionGuard,
  fixtureCampaignLoreApplyAdoption,
  fixtureCampaignLoreRemoteList,
  fixtureCampaignLoreRemoteResolve,
} from './campaignLoreFixture';
import { fixtureActivateAdoptedCampaignBase } from './campaignBaseFixture';
import {
  fixtureAssertCampaignWritable,
  fixtureCampaignDeletionReservation,
  fixtureCampaignToken,
  fixtureGet,
  fixtureOwner,
} from './studioStore';
import { fixtureHash } from './sceneStore';
import { FIXTURE_TIME } from './data';

type Comparison = Awaited<ReturnType<typeof fixtureCampaignAdoptionComparison>>;
type Local = Awaited<ReturnType<typeof fixtureCampaignLoreAdoptionSnapshot>>;
interface Job {
  uid: string;
  input: A.StartAdoptionInput;
  progress: A.AdoptionProgress;
  decisions: Record<string, A.AdoptionChoice>;
  rows: Local['items'];
  candidateKeys: string[];
  candidateNames: Record<
    string,
    { name: string; category: 'character' | 'location' | 'concept' | 'other' }
  >;
  source: Comparison['candidate']['meta'];
  universeId: string | null;
  currentCapturedAt: number;
  candidateCapturedAt: number;
  epoch?: number;
  hasGuard: boolean;
  offset: number;
  receipts: Record<string, { fingerprint: string; receipt: A.AdoptionReceipt }>;
}
interface Call {
  uid: string;
  method: string;
  operationId?: string;
  adoptionId?: string;
  expectedCheckpoint?: number;
}
interface Data {
  jobs: Record<string, Job>;
  fences: Record<string, A.StartAdoptionInput>;
  resolutions: Record<string, { fingerprint: string; value: R.CampaignLoreRemoteResolution }>;
  calls: Call[];
}
const storageKey = 'writer.visual.campaign-adoptions';
const key = (uid: string, id: string) => JSON.stringify([uid, id]);
const read = (): Data =>
  JSON.parse(
    localStorage.getItem(storageKey) ?? '{"jobs":{},"fences":{},"resolutions":{},"calls":[]}',
  ) as Data;
const persist = (data: Data) => localStorage.setItem(storageKey, JSON.stringify(data));
const clone = <T>(value: T): T => structuredClone(value);
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
const stable = (value: unknown) => JSON.stringify(canonical(value));
function fail(message: string, code = 'failed-precondition', reason?: string): never {
  throw Object.assign(new Error(message), {
    code: 'functions/' + code,
    ...(reason ? { details: { reason } } : {}),
  });
}
const conflict = () =>
  fail(
    'A revisão mudou. Confira explicitamente antes de continuar.',
    'failed-precondition',
    'revision-conflict',
  );
function current(uid: string) {
  if (fixtureOwner() !== uid) fail('A conta mudou.', 'permission-denied');
}
function find(data: Data, uid: string, id: string) {
  const job = data.jobs[key(uid, id)];
  if (!job) fail('Atualização indisponível.', 'not-found');
  return job;
}
function once(flag: string, method: string) {
  if (sessionStorage.getItem(flag) !== method) return false;
  sessionStorage.removeItem(flag);
  return true;
}
async function finish<T>(method: string, value: T): Promise<T> {
  const response = clone(value);
  if (once('writer.visual.adoption-lost-response', method))
    fail('A resposta não chegou. Confirme o mesmo pedido.', 'unavailable');
  if (sessionStorage.getItem('writer.visual.adoption-hold-response') === method) {
    const data = read();
    data.calls.push({ uid: fixtureOwner(), method: 'held:' + method });
    persist(data);
    await new Promise<void>((resolve) => {
      const check = () => {
        if (sessionStorage.getItem('writer.visual.adoption-hold-response') === method) return;
        clearInterval(timer);
        window.removeEventListener('writer.visual.release-adoption', check);
        resolve();
      };
      const timer = setInterval(check, 20);
      window.addEventListener('writer.visual.release-adoption', check);
      check();
    });
  }
  return response;
}
async function transaction<T>(
  method: string,
  input: { operationId?: string; adoptionId?: string; expectedCheckpoint?: number },
  work: (data: Data, uid: string) => Promise<T>,
): Promise<T> {
  const uid = fixtureOwner();
  const run = async () => {
    current(uid);
    const data = read();
    data.calls.push({ uid, method, ...input });
    persist(data);
    if (once('writer.visual.adoption-before-receive', method))
      fail('O pedido não foi recebido.', 'unavailable');
    const value = await work(data, uid);
    current(uid);
    persist(data);
    return value;
  };
  const result = navigator.locks
    ? await navigator.locks.request('writer.visual.adoption-server:' + uid, run)
    : await run();
  return finish(method, result);
}
async function available(job: Job) {
  const campaign = await fixtureGet('campaign', job.input.campaignId);
  current(job.uid);
  if (
    !campaign ||
    ('deleting' in campaign && campaign.deleting) ||
    campaign.provenance.kind !== 'original' ||
    fixtureCampaignToken(job.uid, campaign.id) !== job.input.campaignToken
  )
    return false;
  const expected =
    job.progress.state === 'adopted' ? job.progress.candidateBaseId : job.progress.currentBaseId;
  if (campaign.activeBaseId !== expected || campaign.provenance.baseId !== expected) return false;
  const adventure = await fixtureGet('adventure', job.source.adventureId);
  current(job.uid);
  return !!adventure && !('deleting' in adventure && adventure.deleting);
}
async function publicProgress(job: Job): Promise<A.AdoptionProgress> {
  const allowed = await available(job);
  return {
    ...clone(job.progress),
    sourceAvailable: allowed,
    ...(!allowed ? { processed: null } : {}),
  };
}
function operation(
  job: Job,
  action: A.AdoptionAction,
  input: A.StartAdoptionInput | A.StepAdoptionInput | A.DecideAdoptionInput,
) {
  const fingerprint = stable({ action, input }),
    old = job.receipts[input.operationId];
  if (old && old.fingerprint !== fingerprint)
    fail('Identificador usado em outro pedido.', 'invalid-argument');
  return {
    old,
    commit() {
      const receipt: A.AdoptionReceipt = {
        operationId: input.operationId,
        action,
        expectedCheckpoint: 'expectedCheckpoint' in input ? input.expectedCheckpoint : null,
        confirmedCheckpoint: job.progress.checkpoint,
        outcome: 'confirmed',
        ...('sourceKey' in input
          ? {
              sourceKey: input.sourceKey,
              expectedRevision: input.expectedRevision,
              choice: input.choice,
            }
          : {}),
      };
      job.receipts[input.operationId] = { fingerprint, receipt };
      return receipt;
    },
  };
}
async function result(job: Job, receipt: A.AdoptionReceipt): Promise<A.AdoptionMutationResult> {
  return { receipt: clone(receipt), progress: await publicProgress(job) };
}
async function observed(job: Job) {
  if (!(await available(job))) fail('A origem ou a campanha não está disponível.', 'not-found');
  const comparison = await fixtureCampaignAdoptionComparison(job.input.comparisonId),
    local = await fixtureCampaignLoreAdoptionSnapshot(
      job.input.campaignId,
      job.input.currentBaseId,
    );
  current(job.uid);
  if (
    comparison.envelope.campaignToken !== job.input.campaignToken ||
    comparison.envelope.currentBaseId !== job.input.currentBaseId ||
    comparison.envelope.candidateBaseId !== job.input.candidateBaseId ||
    local.collectionRevision !== job.input.expectedCollectionRevision
  )
    conflict();
  return { comparison, local };
}
async function release(job: Job) {
  if (!job.hasGuard) return;
  await fixtureCampaignLoreAdoptionGuard(
    job.input.campaignId,
    job.input.currentBaseId,
    job.progress.adoptionId,
    job.epoch,
  );
  fixtureCampaignAdoptionClaim(job.input.comparisonId, job.progress.adoptionId, true);
  job.hasGuard = false;
}
function tick(job: Job) {
  job.progress.checkpoint++;
  job.progress.updatedAt++;
}
export function startCampaignAdoption(input: A.StartAdoptionInput): Promise<A.StartAdoptionResult> {
  fixtureAssertCampaignWritable(input.campaignId);
  return transaction(
    'startCampaignAdoption',
    { operationId: input.operationId },
    async (data, uid) => {
      const entry = key(uid, input.operationId),
        fence = data.fences[entry],
        old = data.jobs[entry];
      if (fence) {
        if (stable(fence) !== stable(input))
          fail('Pedido diferente do encerrado.', 'invalid-argument');
        return { kind: 'canceled', schemaVersion: 1, ownerId: uid, request: clone(input) };
      }
      if (old) {
        if (stable(old.input) !== stable(input))
          fail('Pedido diferente do original.', 'invalid-argument');
        return result(old, old.receipts[input.operationId].receipt);
      }
      const comparison = await fixtureCampaignAdoptionComparison(input.comparisonId),
        e = comparison.envelope;
      if (
        e.campaignId !== input.campaignId ||
        e.campaignToken !== input.campaignToken ||
        e.currentBaseId !== input.currentBaseId ||
        e.candidateBaseId !== input.candidateBaseId ||
        e.collectionRevision !== input.expectedCollectionRevision
      )
        conflict();
      const local = await fixtureCampaignLoreAdoptionSnapshot(
        input.campaignId,
        input.currentBaseId,
      );
      current(uid);
      const job: Job = {
        uid,
        input: clone(input),
        decisions: {},
        rows: local.items,
        candidateKeys: comparison.candidateKeys,
        candidateNames: Object.fromEntries(
          comparison.candidate.items
            .filter((value) => value.item.kind === 'lore')
            .map((value) => [
              value.item.sourceKey,
              {
                name: value.item.title,
                category: value.item.structured.category as
                  'character' | 'location' | 'concept' | 'other',
              },
            ]),
        ),
        source: clone(comparison.candidate.meta),
        universeId: comparison.candidate.universeId,
        currentCapturedAt: e.currentCapturedAt,
        candidateCapturedAt: e.candidateCapturedAt,
        hasGuard: false,
        offset: 0,
        receipts: {},
        progress: {
          schemaVersion: 1,
          ownerId: uid,
          adoptionId: input.operationId,
          campaignId: input.campaignId,
          campaignToken: input.campaignToken,
          comparisonId: input.comparisonId,
          currentBaseId: input.currentBaseId,
          candidateBaseId: input.candidateBaseId,
          loreGenerationId: fixtureHash({
            namespace: 'adopted-lore-generation',
            uid,
            adoptionId: input.operationId,
          }),
          expectedCollectionRevision: input.expectedCollectionRevision,
          state: 'reviewing',
          phase: 'review',
          checkpoint: 0,
          processed: 0,
          sourceAvailable: true,
          cleanupComplete: false,
          reason: null,
          createdAt: FIXTURE_TIME + 1,
          updatedAt: FIXTURE_TIME + 1,
        },
      };
      data.jobs[entry] = job;
      return result(job, operation(job, 'start', input).commit());
    },
  );
}
export function resolveCampaignAdoptionStart(
  input: A.StartAdoptionInput & { intent: 'cancel' },
): Promise<A.ResolveAdoptionStartResult> {
  fixtureAssertCampaignWritable(input.campaignId);
  return transaction(
    'resolveCampaignAdoptionStart',
    { operationId: input.operationId },
    async (data, uid) => {
      const request: A.StartAdoptionInput = {
        operationId: input.operationId,
        campaignId: input.campaignId,
        campaignToken: input.campaignToken,
        comparisonId: input.comparisonId,
        currentBaseId: input.currentBaseId,
        candidateBaseId: input.candidateBaseId,
        expectedCollectionRevision: input.expectedCollectionRevision,
      };
      const old = data.jobs[key(uid, input.operationId)];
      if (old) {
        if (stable(old.input) !== stable(request))
          fail('Pedido diferente do original.', 'invalid-argument');
        return {
          kind: 'confirmed',
          ...(await result(old, old.receipts[input.operationId].receipt)),
        };
      }
      const fence = data.fences[key(uid, input.operationId)];
      if (fence && stable(fence) !== stable(request))
        fail('Pedido diferente do encerrado.', 'invalid-argument');
      data.fences[key(uid, input.operationId)] = clone(request);
      return { kind: 'canceled', schemaVersion: 1, ownerId: uid, request: clone(request) };
    },
  );
}
export async function getCampaignAdoption(input: {
  adoptionId: string;
}): Promise<A.AdoptionProgress> {
  const uid = fixtureOwner(),
    data = read();
  data.calls.push({ uid, method: 'getCampaignAdoption', ...input });
  persist(data);
  return finish('getCampaignAdoption', await publicProgress(find(data, uid, input.adoptionId)));
}
export async function listCampaignAdoptions(input: A.ListAdoptionsInput): Promise<A.AdoptionList> {
  const uid = fixtureOwner(),
    rows = Object.values(read().jobs)
      .filter(
        (job) =>
          job.uid === uid &&
          !fixtureCampaignDeletionReservation(job.input.campaignId) &&
          (!input.campaignId || job.input.campaignId === input.campaignId),
      )
      .sort(
        (a, b) =>
          b.progress.createdAt - a.progress.createdAt ||
          a.progress.adoptionId.localeCompare(b.progress.adoptionId),
      );
  const scope = stable({ uid, campaignId: input.campaignId ?? null }),
    cursor = input.cursor ? (JSON.parse(input.cursor) as { scope: string; offset: number }) : null;
  if (cursor && cursor.scope !== scope) fail('Página de outra conta.');
  const offset = cursor?.offset ?? 0,
    size = input.limit ?? 25;
  const items = await Promise.all(rows.slice(offset, offset + size).map(publicProgress));
  current(uid);
  return {
    items,
    nextCursor:
      offset + size < rows.length ? JSON.stringify({ scope, offset: offset + size }) : null,
  };
}
export async function listCampaignAdoptionDecisions(input: {
  adoptionId: string;
  cursor?: string;
  limit?: number;
}): Promise<A.AdoptionDecisionsPage> {
  const uid = fixtureOwner(),
    job = find(read(), uid, input.adoptionId),
    { comparison, local } = await observed(job);
  const projectionToken = fixtureHash({
      identity: job.input,
      available: local.items.filter((row) => row.available).map((row) => row.sourceKey),
      candidate: comparison.candidate.items.map((value) => value.item.sourceKey),
    }),
    scope = stable({ uid, input: job.input, projectionToken }),
    cursor = input.cursor ? (JSON.parse(input.cursor) as { scope: string; last: string }) : null;
  if (cursor && cursor.scope !== scope)
    fail('A revisão mudou.', 'failed-precondition', 'cursor-invalidated');
  const rows = local.items
      .filter(
        (row) =>
          row.sourceKey > (cursor?.last ?? '') &&
          (row.hasLocal || job.candidateKeys.includes(row.sourceKey)),
      )
      .sort((a, b) => a.sourceKey.localeCompare(b.sourceKey)),
    window = rows.slice(0, input.limit ?? 25),
    items: A.AdoptionDecision[] = [];
  for (const row of window) {
    if (!row.available || !row.name || !row.category) continue;
    const candidate = comparison.candidate.items.find(
        (value) => value.item.sourceKey === row.sourceKey,
      ),
      present = job.candidateKeys.includes(row.sourceKey);
    if (present && !candidate) continue;
    items.push({
      sourceKey: row.sourceKey,
      revision: row.revision,
      mode: row.mode,
      legacy: row.legacy,
      current: {
        name: row.name,
        category: row.category as A.AdoptionDecision['current']['category'],
      },
      candidate: candidate
        ? {
            present: true,
            name: candidate.item.title,
            category: candidate.item.structured
              .category as A.AdoptionDecision['current']['category'],
          }
        : { present: false },
      choice: job.decisions[row.sourceKey] ?? null,
      required: row.hasLocal,
      impediments: [],
    });
  }
  const {
    schemaVersion,
    ownerId,
    adoptionId,
    campaignId,
    campaignToken,
    comparisonId,
    currentBaseId,
    candidateBaseId,
    loreGenerationId,
    expectedCollectionRevision,
    checkpoint,
  } = job.progress;
  return {
    schemaVersion,
    ownerId,
    adoptionId,
    campaignId,
    campaignToken,
    comparisonId,
    currentBaseId,
    candidateBaseId,
    loreGenerationId,
    expectedCollectionRevision,
    checkpoint,
    currentCapturedAt: job.currentCapturedAt,
    candidateCapturedAt: job.candidateCapturedAt,
    projectionToken,
    items,
    nextCursor:
      rows.length > window.length
        ? JSON.stringify({ scope, last: window.at(-1)!.sourceKey })
        : null,
  };
}
export function decideCampaignAdoption(
  input: A.DecideAdoptionInput,
): Promise<A.AdoptionMutationResult> {
  return transaction('decideCampaignAdoption', input, async (data, uid) => {
    const job = find(data, uid, input.adoptionId),
      op = operation(job, 'decide', input);
    if (op.old) return result(job, op.old.receipt);
    if (job.progress.checkpoint !== input.expectedCheckpoint || job.progress.state !== 'reviewing')
      conflict();
    const { local } = await observed(job),
      row = local.items.find((value) => value.sourceKey === input.sourceKey);
    if (!row?.available || row.revision !== input.expectedRevision) conflict();
    const choices = job.candidateKeys.includes(input.sourceKey)
      ? ['keep-local', 'use-candidate']
      : ['keep-local', 'discard-local'];
    if (!choices.includes(input.choice)) fail('Escolha incompatível.', 'invalid-argument');
    job.decisions[input.sourceKey] = input.choice;
    tick(job);
    return result(job, op.commit());
  });
}
export function prepareCampaignAdoption(
  input: A.StepAdoptionInput,
): Promise<A.AdoptionMutationResult> {
  return transaction('prepareCampaignAdoption', input, async (data, uid) => {
    const job = find(data, uid, input.adoptionId),
      op = operation(job, 'prepare', input);
    if (op.old) return result(job, op.old.receipt);
    if (job.progress.checkpoint !== input.expectedCheckpoint || job.progress.state !== 'reviewing')
      conflict();
    const { local } = await observed(job);
    job.rows = local.items;
    fixtureCampaignAdoptionClaim(job.input.comparisonId, job.progress.adoptionId);
    job.epoch = await fixtureCampaignLoreAdoptionGuard(
      job.input.campaignId,
      job.input.currentBaseId,
      job.progress.adoptionId,
    );
    job.hasGuard = true;
    job.progress.state = 'preparing';
    job.progress.phase = 'operations';
    job.offset = 0;
    tick(job);
    return result(job, op.commit());
  });
}
export function advanceCampaignAdoption(
  input: A.StepAdoptionInput,
): Promise<A.AdoptionMutationResult> {
  return transaction('advanceCampaignAdoption', input, async (data, uid) => {
    const job = find(data, uid, input.adoptionId),
      op = operation(job, 'advance', input);
    if (op.old) return result(job, op.old.receipt);
    if (job.progress.checkpoint !== input.expectedCheckpoint || job.progress.state !== 'preparing')
      conflict();
    await observed(job);
    if (job.progress.phase === 'operations') {
      let cursor: string | undefined;
      let pending = false;
      do {
        const page = await fixtureCampaignLoreRemoteList({
          campaignId: job.input.campaignId,
          campaignToken: job.input.campaignToken,
          baseId: job.input.currentBaseId,
          cursor,
          limit: 25,
        });
        pending ||= page.items.length > 0;
        cursor = page.nextCursor ?? undefined;
      } while (cursor && !pending);
      if (pending) {
        job.progress.state = 'aborted';
        job.progress.reason = 'pending-operations';
        await release(job);
      } else job.progress.phase = 'overlays';
    } else if (job.progress.phase === 'overlays') {
      const window = job.rows.slice(job.offset, job.offset + 25);
      if (window.some((row) => row.available && row.hasLocal && !job.decisions[row.sourceKey])) {
        job.progress.state = 'aborted';
        job.progress.reason = 'decision-required';
        await release(job);
      } else {
        job.offset += window.length;
        job.progress.processed = job.offset;
        if (job.offset >= job.rows.length) job.progress.phase = 'authorization';
      }
    } else if (job.progress.phase === 'authorization') {
      job.progress.state = 'ready';
      job.progress.phase = 'complete';
    }
    tick(job);
    return result(job, op.commit());
  });
}
export function activateCampaignAdoption(
  input: A.StepAdoptionInput,
): Promise<A.AdoptionMutationResult> {
  return transaction('activateCampaignAdoption', input, async (data, uid) => {
    const job = find(data, uid, input.adoptionId),
      op = operation(job, 'activate', input);
    if (op.old) return result(job, op.old.receipt);
    if (job.progress.checkpoint !== input.expectedCheckpoint || job.progress.state !== 'ready')
      conflict();
    await observed(job);
    if (job.epoch === undefined || !job.hasGuard) return conflict();
    await fixtureCampaignLoreApplyAdoption({
      campaignId: job.input.campaignId,
      oldBaseId: job.input.currentBaseId,
      baseId: job.input.candidateBaseId,
      expectedRevision: job.input.expectedCollectionRevision,
      adoptionId: job.progress.adoptionId,
      epoch: job.epoch,
      candidateKeys: job.candidateKeys,
      choices: job.decisions,
    });
    fixtureCampaignComparisonAdopt(job.input.comparisonId, job.progress.adoptionId);
    await fixtureActivateAdoptedCampaignBase({
      campaignId: job.input.campaignId,
      comparisonId: job.input.comparisonId,
      baseId: job.input.candidateBaseId,
      capturedAt: job.candidateCapturedAt,
      source: job.source,
      universeId: job.universeId,
    });
    await fixtureCampaignLoreAdoptionGuard(
      job.input.campaignId,
      job.input.currentBaseId,
      job.progress.adoptionId,
      job.epoch,
    );
    job.hasGuard = false;
    job.progress.state = 'adopted';
    job.progress.phase = 'complete';
    tick(job);
    return result(job, op.commit());
  });
}
export function cancelCampaignAdoption(
  input: A.StepAdoptionInput,
): Promise<A.AdoptionMutationResult> {
  return transaction('cancelCampaignAdoption', input, async (data, uid) => {
    const job = find(data, uid, input.adoptionId),
      op = operation(job, 'cancel', input);
    if (op.old) return result(job, op.old.receipt);
    if (job.progress.state === 'adopted') fail('A base já foi adotada.');
    if (job.progress.checkpoint !== input.expectedCheckpoint) conflict();
    await release(job);
    job.progress.state = job.progress.state === 'deleting' ? 'deleted' : 'deleting';
    job.progress.phase = 'cleanup';
    job.progress.cleanupComplete = job.progress.state === 'deleted';
    tick(job);
    return result(job, op.commit());
  });
}
export const listCampaignLoreOperations = (input: R.ListCampaignLoreOperationsInput) =>
  fixtureCampaignLoreRemoteList(input);
export function resolveCampaignLoreRemoteOperation(
  input: R.ResolveCampaignLoreRemoteInput,
): Promise<R.CampaignLoreRemoteResolution> {
  return transaction(
    'resolveCampaignLoreRemoteOperation',
    { operationId: input.resolutionId },
    async (data, uid) => {
      const id = key(uid, input.resolutionId),
        fingerprint = stable(input),
        old = data.resolutions[id];
      if (old) {
        if (old.fingerprint !== fingerprint)
          fail('Resolução usada em outro pedido.', 'invalid-argument');
        return clone(old.value);
      }
      const value = await fixtureCampaignLoreRemoteResolve(input);
      current(uid);
      data.resolutions[id] = { fingerprint, value: clone(value) };
      return value;
    },
  );
}

// Sanitize only controls belonging to the deleted campaign; preserve other mesas.
export function fixtureDeleteCampaignAdoptions(uid: string, campaignId: string): boolean {
  current(uid);
  const data = read();
  for (const [fenceKey, fence] of Object.entries(data.fences)) {
    if (fenceKey === key(uid, fence.operationId) && fence.campaignId === campaignId)
      delete data.fences[fenceKey];
  }
  for (const [id, resolution] of Object.entries(data.resolutions)) {
    if (resolution.value.ownerId === uid && resolution.value.request.campaignId === campaignId)
      delete data.resolutions[id];
  }
  const entry = Object.entries(data.jobs).find(
    ([, job]) => job.uid === uid && job.input.campaignId === campaignId,
  );
  if (!entry) {
    persist(data);
    return true;
  }
  const [entryKey, job] = entry;

  const terminalKey = 'writer.visual.campaign-adoption-terminals';
  const terminals = JSON.parse(localStorage.getItem(terminalKey) ?? '{}') as Record<
    string,
    unknown
  >;
  terminals[entryKey] = {
    uid,
    campaignId,
    receipts: Object.fromEntries(
      Object.entries(job.receipts).map(([id, value]) => [
        id,
        {
          fingerprint: fixtureHash(value.fingerprint),
          receipt: {
            operationId: value.receipt.operationId,
            action: value.receipt.action,
            expectedCheckpoint: value.receipt.expectedCheckpoint,
            confirmedCheckpoint: value.receipt.confirmedCheckpoint,
            outcome: value.receipt.outcome,
          },
        },
      ]),
    ),
  };
  localStorage.setItem(terminalKey, JSON.stringify(terminals));
  delete data.jobs[entryKey];
  persist(data);
  return !Object.values(data.jobs).some(
    (row) => row.uid === uid && row.input.campaignId === campaignId,
  );
}
