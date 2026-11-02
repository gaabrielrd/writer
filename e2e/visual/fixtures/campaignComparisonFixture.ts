import type * as C from '../../../src/features/campaign-comparisons/model/campaignComparison';
import type * as B from '../../../src/features/campaign-bases/model/campaignBase';
import {
  fixtureCapturedLoreAvailable,
  fixtureCampaignComparisonCurrent,
  fixtureCampaignComparisonSource,
} from './campaignBaseFixture';
import { fixtureCampaignLoreComparisonMetadata } from './campaignLoreFixture';
import {
  fixtureAssertCampaignWritable,
  fixtureCampaignDeletionReservation,
  fixtureCampaignToken,
  fixtureGet,
  fixtureOwner,
} from './studioStore';
import { fixtureHash } from './sceneStore';
import { getUniverse } from './universeService';
import { fixtureLibraryImage, fixtureSetImageUse } from './imageLibraryService';
import { FIXTURE_TIME } from './data';

type Snapshot = Awaited<ReturnType<typeof fixtureCampaignComparisonSource>>['snapshot'];
type Captured = Snapshot['items'][number];
interface Job {
  uid: string;
  input: C.StartComparisonInput;
  adventureId: string;
  progress: C.ComparisonProgress;
  snapshot: Snapshot;
  candidateCapturedAt: number;
  offset: number;
  pins: string[];
  adoptionClaim?: string;
  adopted?: boolean;
  receipts: Record<string, { fingerprint: string; receipt: C.ComparisonReceipt }>;
}
interface Data {
  jobs: Record<string, Job>;
  fences: Record<string, C.StartComparisonInput>;
  calls: {
    uid: string;
    method: string;
    operationId?: string;
    comparisonId?: string;
    expectedCheckpoint?: number;
    side?: C.ComparisonSide;
  }[];
}
const storageKey = 'writer.visual.campaign-comparisons';
const key = (uid: string, id: string) => JSON.stringify([uid, id]);
const read = (): Data =>
  JSON.parse(localStorage.getItem(storageKey) ?? '{"jobs":{},"fences":{},"calls":[]}') as Data;
const persist = (data: Data) => localStorage.setItem(storageKey, JSON.stringify(data));
const clone = <T>(value: T): T => structuredClone(value);
const kinds: B.CampaignBaseItemKind[] = [
  'part',
  'scene',
  'block',
  'arc',
  'milestone',
  'event',
  'lore',
];
const counts = () =>
  Object.fromEntries([...kinds, 'loreReference', 'image'].map((kind) => [kind, 0])) as NonNullable<
    C.ComparisonProgress['counts']
  >;
function fail(message: string, code = 'failed-precondition', reason?: string): never {
  throw Object.assign(new Error(message), {
    code: 'functions/' + code,
    ...(reason ? { details: { reason } } : {}),
  });
}
const conflict = () =>
  fail(
    'O progresso mudou. Confira antes de continuar.',
    'failed-precondition',
    'revision-conflict',
  );
function current(uid: string) {
  if (fixtureOwner() !== uid) fail('A conta mudou.', 'permission-denied');
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
const stable = (value: unknown) => JSON.stringify(canonical(value));
function find(data: Data, uid: string, comparisonId: string): Job {
  const job = data.jobs[key(uid, comparisonId)];
  if (!job) fail('Comparação indisponível.', 'not-found');
  return job;
}
function once(flag: string, method: string) {
  if (sessionStorage.getItem(flag) !== method) return false;
  sessionStorage.removeItem(flag);
  return true;
}
async function hold(flag: string, method: string) {
  if (![method, 'all'].includes(sessionStorage.getItem(flag) ?? '')) return;
  const diagnostics = read();
  diagnostics.calls.push({ uid: fixtureOwner(), method: 'held:' + method });
  persist(diagnostics);
  await new Promise<void>((resolve) => {
    const check = () => {
      if ([method, 'all'].includes(sessionStorage.getItem(flag) ?? '')) return;
      clearInterval(timer);
      window.removeEventListener('writer.visual.release-comparison', check);
      resolve();
    };
    const timer = setInterval(check, 20);
    window.addEventListener('writer.visual.release-comparison', check);
    check();
  });
}
async function finish<T>(method: string, value: T): Promise<T> {
  const response = clone(value);
  if (once('writer.visual.comparison-lost-response', method))
    fail('A resposta não chegou. Confirme o mesmo pedido.', 'unavailable');
  await hold('writer.visual.comparison-hold-response', method);
  // Return the original envelope after a late response: client identity guards remain real.
  return response;
}
async function transaction<T>(
  method: string,
  input: {
    operationId?: string;
    comparisonId?: string;
    expectedCheckpoint?: number;
    side?: C.ComparisonSide;
  },
  work: (data: Data, uid: string) => Promise<T>,
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
          ['operationId', 'comparisonId', 'expectedCheckpoint', 'side'].includes(key),
        ),
      ),
    });
    persist(data);
    if (once('writer.visual.comparison-before-receive', method))
      fail('O pedido não foi recebido.', 'unavailable');
    const value = await work(data, uid);
    current(uid);
    persist(data);
    return value;
  };
  const result = navigator.locks
    ? await navigator.locks.request('writer.visual.comparison-server:' + uid, run)
    : await run();
  return finish(method, result);
}
async function identity(job: Job) {
  const campaign = await fixtureGet('campaign', job.input.campaignId);
  current(job.uid);
  if (!campaign || ('deleting' in campaign && campaign.deleting))
    fail('Campanha indisponível.', 'not-found', 'campaign-unavailable');
  if (fixtureCampaignToken(job.uid, campaign.id) !== job.input.campaignToken)
    fail('A campanha mudou.', 'failed-precondition', 'campaign-changed');
  if (
    campaign.provenance.kind !== 'original' ||
    campaign.activeBaseId !== job.input.currentBaseId ||
    campaign.provenance.baseId !== job.input.currentBaseId
  )
    fail('A base atual mudou.', 'failed-precondition', 'base-changed');
  return campaign;
}
async function available(job: Job): Promise<C.ComparisonReason> {
  try {
    await identity(job);
    await fixtureCampaignComparisonCurrent(job.input.campaignId);
    return null;
  } catch (error) {
    current(job.uid);
    const reason = (error as { details?: { reason?: C.ComparisonReason } }).details?.reason;
    return reason ?? 'source-unavailable';
  }
}
async function publicProgress(job: Job): Promise<C.ComparisonProgress> {
  const reason = await available(job);
  return {
    ...clone(job.progress),
    sourceAvailable: !reason,
    ...(reason ? { processed: null, counts: null } : {}),
  };
}
function operation(
  job: Job,
  method: C.ComparisonReceipt['action'],
  input: C.StepComparisonInput | C.StartComparisonInput,
) {
  const fingerprint = stable({ method, input }),
    old = job.receipts[input.operationId];
  if (old && old.fingerprint !== fingerprint)
    fail('Identificador usado em outro pedido.', 'invalid-argument');
  return {
    old,
    commit() {
      const receipt: C.ComparisonReceipt = {
        operationId: input.operationId,
        action: method,
        expectedCheckpoint: 'expectedCheckpoint' in input ? input.expectedCheckpoint : null,
        confirmedCheckpoint: job.progress.checkpoint,
      };
      job.receipts[input.operationId] = { fingerprint, receipt };
      return receipt;
    },
  };
}
async function result(job: Job, receipt: C.ComparisonReceipt): Promise<C.ComparisonMutationResult> {
  return { receipt: clone(receipt), progress: await publicProgress(job) };
}
export async function getCampaignComparisonSource(input: {
  campaignId: string;
  currentBaseId: string;
}): Promise<C.ComparisonSource | null> {
  const uid = fixtureOwner();
  try {
    const base = await fixtureCampaignComparisonCurrent(input.campaignId);
    current(uid);
    if (base.baseId !== input.currentBaseId)
      fail('A base mudou.', 'failed-precondition', 'base-changed');
    const source = await fixtureCampaignComparisonSource(base.adventureId);
    current(uid);
    return {
      schemaVersion: 1,
      ownerId: uid,
      campaignId: input.campaignId,
      campaignToken: fixtureCampaignToken(uid, input.campaignId),
      currentBaseId: base.baseId,
      currentCapturedAt: base.capturedAt,
      adventureId: base.adventureId,
      sourceToken: source.sourceToken,
    };
  } catch (error) {
    current(uid);
    if ((error as { code?: string }).code === 'functions/not-found') return null;
    throw error;
  }
}
export function startCampaignComparison(
  input: C.StartComparisonInput,
): Promise<C.StartComparisonResult> {
  fixtureAssertCampaignWritable(input.campaignId);
  return transaction('startCampaignComparison', input, async (data, uid) => {
    const entry = key(uid, input.operationId),
      fence = data.fences[entry],
      old = data.jobs[entry];
    if (fence) {
      if (stable(fence) !== stable(input))
        fail('Pedido diferente do encerrado.', 'invalid-argument');
      return {
        kind: 'canceled' as const,
        schemaVersion: 1 as const,
        ownerId: uid,
        request: clone(input),
      };
    }
    if (old) {
      if (stable(old.input) !== stable(input))
        fail('Pedido diferente do original.', 'invalid-argument');
      return result(old, old.receipts[input.operationId].receipt);
    }
    const source = await getCampaignComparisonSource(input);
    if (!source) fail('Origem indisponível.', 'not-found');
    if (
      source.campaignToken !== input.campaignToken ||
      source.sourceToken !== input.expectedSourceToken
    )
      conflict();
    const fresh = await fixtureCampaignComparisonSource(source.adventureId);
    if (fresh.sourceToken !== input.expectedSourceToken) conflict();
    const startedAt = Math.max(FIXTURE_TIME, source.currentCapturedAt + 1);
    const job: Job = {
      uid,
      input: clone(input),
      adventureId: source.adventureId,
      snapshot: fresh.snapshot,
      candidateCapturedAt: 0,
      offset: 0,
      pins: [],
      receipts: {},
      progress: {
        schemaVersion: 1,
        ownerId: uid,
        comparisonId: input.operationId,
        campaignId: input.campaignId,
        campaignToken: input.campaignToken,
        currentBaseId: input.currentBaseId,
        candidateBaseId: fixtureHash({
          namespace: 'candidate-base',
          uid,
          token: input.campaignToken,
          comparisonId: input.operationId,
        }),
        state: 'preparing',
        phase: 'parts',
        checkpoint: 0,
        processed: 0,
        counts: counts(),
        sourceAvailable: true,
        cleanupComplete: false,
        reason: null,
        createdAt: startedAt,
        updatedAt: startedAt,
      },
    };
    data.jobs[entry] = job;
    return result(job, operation(job, 'start', input).commit());
  });
}
export function resolveCampaignComparisonStart(
  input: C.StartComparisonInput & { intent: 'cancel' },
): Promise<C.ResolveComparisonStartResult> {
  fixtureAssertCampaignWritable(input.campaignId);
  return transaction('resolveCampaignComparisonStart', input, async (data, uid) => {
    const request: C.StartComparisonInput = {
      operationId: input.operationId,
      campaignId: input.campaignId,
      campaignToken: input.campaignToken,
      currentBaseId: input.currentBaseId,
      expectedSourceToken: input.expectedSourceToken,
    };
    const entry = key(uid, request.operationId),
      job = data.jobs[entry],
      fence = data.fences[entry];
    if (job) {
      if (stable(job.input) !== stable(request))
        fail('Pedido diferente do original.', 'invalid-argument');
      return {
        kind: 'confirmed' as const,
        ...(await result(job, job.receipts[request.operationId].receipt)),
      };
    }
    if (fence && stable(fence) !== stable(request))
      fail('Pedido diferente do encerrado.', 'invalid-argument');
    data.fences[entry] = clone(request);
    return { kind: 'canceled' as const, schemaVersion: 1 as const, ownerId: uid, request };
  });
}
export async function getCampaignComparison({
  comparisonId,
}: {
  comparisonId: string;
}): Promise<C.ComparisonProgress> {
  const uid = fixtureOwner(),
    data = read();
  data.calls.push({ uid, method: 'getCampaignComparison', comparisonId });
  persist(data);
  const response = await publicProgress(find(data, uid, comparisonId));
  if (sessionStorage.getItem('writer.visual.comparison-hold-next-get') === comparisonId) {
    sessionStorage.removeItem('writer.visual.comparison-hold-next-get');
    const diagnostics = read();
    diagnostics.calls.push({ uid, method: 'held:getCampaignComparison:one-shot', comparisonId });
    persist(diagnostics);
    await new Promise<void>((resolve) => {
      const release = (event: Event) => {
        if ((event as CustomEvent<string>).detail !== comparisonId) return;
        window.removeEventListener('writer.visual.release-comparison-old-get', release);
        resolve();
      };
      window.addEventListener('writer.visual.release-comparison-old-get', release);
    });
    const diagnosticsAfter = read();
    diagnosticsAfter.calls.push({
      uid,
      method: 'released:getCampaignComparison:one-shot',
      comparisonId,
    });
    persist(diagnosticsAfter);
  }
  // The immutable response was captured before the hold; later GETs remain independent.
  return finish('getCampaignComparison', response);
}
function page<T>(rows: T[], cursor: string | null | undefined, scope: unknown, size: number) {
  let offset = 0;
  if (cursor) {
    let value: { scope: string; offset: number };
    try {
      value = JSON.parse(cursor) as typeof value;
    } catch {
      fail('Página inválida.', 'invalid-argument');
    }
    if (value.scope !== stable(scope))
      fail('A projeção mudou. Recarregue.', 'failed-precondition', 'cursor-invalidated');
    if (!Number.isSafeInteger(value.offset) || value.offset < 0)
      fail('Página inválida.', 'invalid-argument');
    offset = value.offset;
  }
  const window = rows.slice(offset, offset + size);
  return {
    items: window,
    nextCursor:
      rows.length > offset + size
        ? JSON.stringify({ scope: stable(scope), offset: offset + window.length })
        : null,
  };
}
export async function listCampaignComparisons(
  input: C.ListComparisonsInput = {},
): Promise<C.ComparisonList> {
  const uid = fixtureOwner();
  const rows = Object.values(read().jobs)
    .filter(
      (job) =>
        job.uid === uid &&
        !fixtureCampaignDeletionReservation(job.input.campaignId) &&
        job.progress.state !== 'deleted' &&
        (!input.campaignId || job.input.campaignId === input.campaignId),
    )
    .sort(
      (a, b) =>
        b.progress.updatedAt - a.progress.updatedAt ||
        a.progress.comparisonId.localeCompare(b.progress.comparisonId),
    );
  const output = page(
    rows,
    input.cursor,
    { uid, campaignId: input.campaignId ?? null },
    input.limit ?? 25,
  );
  const items = await Promise.all(output.items.map(publicProgress));
  current(uid);
  return finish('listCampaignComparisons', { items, nextCursor: output.nextCursor });
}
export function advanceCampaignComparison(
  input: C.StepComparisonInput,
): Promise<C.ComparisonMutationResult> {
  return transaction('advanceCampaignComparison', input, async (data, uid) => {
    const job = find(data, uid, input.comparisonId),
      op = operation(job, 'advance', input);
    if (op.old) return result(job, op.old.receipt);
    if (job.progress.checkpoint !== input.expectedCheckpoint) conflict();
    if (job.progress.state !== 'preparing') fail('Preparação encerrada.');
    let reason = await available(job);
    if (!reason) {
      try {
        const fresh = await fixtureCampaignComparisonSource(job.adventureId);
        if (fresh.sourceToken !== job.input.expectedSourceToken) reason = 'source-changed';
      } catch {
        current(uid);
        reason = 'source-unavailable';
      }
    }
    if (reason) {
      job.progress.state = 'aborted';
      job.progress.reason = reason;
    } else {
      const total =
        job.snapshot.items.length +
        job.snapshot.links.length +
        Object.keys(job.snapshot.images).length;
      job.offset = Math.min(total, job.offset + 25);
      const items = job.snapshot.items.slice(0, job.offset),
        counted = counts();
      for (const { item } of items) counted[item.kind]++;
      counted.loreReference = Math.min(
        job.snapshot.links.length,
        Math.max(0, job.offset - job.snapshot.items.length),
      );
      counted.image = Math.min(
        Object.keys(job.snapshot.images).length,
        Math.max(0, job.offset - job.snapshot.items.length - job.snapshot.links.length),
      );
      job.progress.counts = counted;
      job.progress.processed = job.offset;
      job.progress.phase = job.offset >= total ? 'complete' : 'scenes';
      if (job.offset >= total) {
        for (const [imageKey, image] of Object.entries(job.snapshot.images)) {
          fixtureSetImageUse(
            'candidate:' + job.progress.candidateBaseId + ':' + imageKey,
            image.imageId,
          );
          job.pins.push(imageKey);
        }
        job.progress.state = 'ready';
        job.candidateCapturedAt = job.progress.updatedAt + 1;
      }
    }
    job.progress.checkpoint++;
    job.progress.updatedAt++;
    return result(job, op.commit());
  });
}
export function cancelCampaignComparison(
  input: C.StepComparisonInput,
): Promise<C.ComparisonMutationResult> {
  return transaction('cancelCampaignComparison', input, async (data, uid) => {
    const job = find(data, uid, input.comparisonId),
      op = operation(job, 'cancel', input);
    if (op.old) return result(job, op.old.receipt);
    if (job.progress.checkpoint !== input.expectedCheckpoint) conflict();
    const campaign = await fixtureGet('campaign', job.input.campaignId);
    if (job.adopted || job.adoptionClaim || campaign?.activeBaseId === job.progress.candidateBaseId)
      fail('A candidata está protegida pela adoção.');
    if (job.progress.state === 'deleted') fail('Limpeza encerrada.');
    if (job.progress.state !== 'deleting') {
      job.progress.state = 'deleting';
      job.progress.phase = 'cleanup';
    } else {
      const removed = job.snapshot.items.splice(0, 25);
      if (!removed.length && job.snapshot.links.length) job.snapshot.links.splice(0, 25);
      else if (!removed.length)
        for (const imageKey of Object.keys(job.snapshot.images).slice(0, 25)) {
          fixtureSetImageUse('candidate:' + job.progress.candidateBaseId + ':' + imageKey, null);
          delete job.snapshot.images[imageKey];
          job.pins = job.pins.filter((key) => key !== imageKey);
        }
      if (
        !job.snapshot.items.length &&
        !job.snapshot.links.length &&
        !Object.keys(job.snapshot.images).length
      ) {
        job.progress.state = 'deleted';
        job.progress.cleanupComplete = true;
      }
    }
    job.progress.checkpoint++;
    job.progress.updatedAt++;
    return result(job, op.commit());
  });
}

async function project(value: Snapshot, uid: string) {
  const snapshot = clone(value),
    allKeys = {
      items: snapshot.items.map(({ item }) => item.sourceKey),
      references: snapshot.links.map((link) => link.key),
      images: Object.keys(snapshot.images),
    };
  let worldAvailable = false;
  if (snapshot.universeId) {
    try {
      worldAvailable = (await getUniverse(snapshot.universeId))?.authorId === uid;
    } catch {
      /* absent universe revokes lore */
    }
  }
  const allowed = new Set<string>();
  for (const captured of snapshot.items) {
    if (captured.item.kind !== 'lore') {
      allowed.add(captured.item.sourceKey);
      continue;
    }
    if (captured.origin.kind !== 'adventure-lore' && !worldAvailable) continue;
    try {
      if (await fixtureCapturedLoreAvailable(captured)) allowed.add(captured.item.sourceKey);
    } catch {
      /* absent entity revokes its captured projection */
    }
  }
  current(uid);
  snapshot.items = snapshot.items.filter(({ item }) => allowed.has(item.sourceKey));
  for (const { item } of snapshot.items)
    if (item.structured.relations)
      item.structured.relations = item.structured.relations.filter((relation) =>
        allowed.has(relation.targetKey),
      );
  snapshot.links = snapshot.links
    .filter((link) => allowed.has(link.sourceKey))
    .map((link) => ({
      ...link,
      targetKey: link.targetKey && allowed.has(link.targetKey) ? link.targetKey : null,
      available: !!link.targetKey && allowed.has(link.targetKey),
    }));
  snapshot.images = Object.fromEntries(
    Object.entries(snapshot.images).filter(([, image]) => {
      try {
        fixtureLibraryImage(image.imageId);
        return true;
      } catch {
        return false;
      }
    }),
  );
  const unavailableImageItemKeys: string[] = [];
  for (const { item } of snapshot.items)
    if (item.image && !snapshot.images[item.image.imageKey]) {
      unavailableImageItemKeys.push(item.sourceKey);
      item.image = null;
    }
  return { snapshot, allKeys, unavailableImageItemKeys };
}
async function context(comparisonId: string) {
  const uid = fixtureOwner(),
    job = find(read(), uid, comparisonId);
  await identity(job);
  if (job.progress.state !== 'ready') fail('Comparação ainda não está pronta.');
  const currentBase = await fixtureCampaignComparisonCurrent(job.input.campaignId);
  if (currentBase.baseId !== job.progress.currentBaseId)
    fail('A base mudou.', 'failed-precondition', 'base-changed');
  const candidate = await project(job.snapshot, uid),
    local = await fixtureCampaignLoreComparisonMetadata(
      job.input.campaignId,
      job.progress.currentBaseId,
    );
  current(uid);
  const comparisonToken = fixtureHash({
    identity: job.progress,
    currentToken: currentBase.projectionToken,
    currentImages: Object.keys(currentBase.snapshot.images),
    currentUnavailableImageItems: currentBase.unavailableImageItemKeys,
    candidateKeys: candidate.snapshot.items.map(({ item }) => item.sourceKey),
    candidateImages: Object.keys(candidate.snapshot.images),
    revision: local.collectionRevision,
  });
  const { schemaVersion, ownerId, campaignId, campaignToken, currentBaseId, candidateBaseId } =
    job.progress;
  const envelope: C.ComparisonReadEnvelope = {
    schemaVersion,
    ownerId,
    campaignId,
    campaignToken,
    comparisonId,
    currentBaseId,
    candidateBaseId,
    currentCapturedAt: currentBase.capturedAt,
    candidateCapturedAt: job.candidateCapturedAt,
    collectionRevision: local.collectionRevision,
    comparisonToken,
  };
  return { uid, job, current: currentBase, candidate, local, envelope };
}
type Context = Awaited<ReturnType<typeof context>>;
function orderContext(
  snapshot: Snapshot,
  item: B.CampaignBaseItem,
): C.ComparisonItemSummary['orderContext'] {
  if (item.kind === 'lore') return null;
  const siblings = snapshot.items
    .map(({ item }) => item)
    .filter(
      (other) =>
        other.kind === item.kind &&
        other.parentKey === item.parentKey &&
        other.archived === item.archived,
    )
    .sort((a, b) => a.orderKey.localeCompare(b.orderKey) || a.sourceKey.localeCompare(b.sourceKey));
  const index = siblings.findIndex((other) => other.sourceKey === item.sourceKey);
  return {
    previousKey: siblings[index - 1]?.sourceKey ?? null,
    nextKey: siblings[index + 1]?.sourceKey ?? null,
  };
}
function summary(snapshot: Snapshot, item: B.CampaignBaseItem): C.ComparisonItemSummary {
  const { sourceKey, kind, parentKey, title, archived, stage, type, audience, role, dateLabel } =
    item;
  return {
    sourceKey,
    kind,
    parentKey,
    title,
    archived,
    orderContext: orderContext(snapshot, item),
    ...(stage ? { stage } : {}),
    ...(type ? { type } : {}),
    ...(audience ? { audience } : {}),
    ...(role ? { role } : {}),
    ...(dateLabel ? { dateLabel } : {}),
    ...(item.structured.category ? { category: item.structured.category } : {}),
  };
}
function itemFingerprint(snapshot: Snapshot, captured: Captured, ignoreImage: boolean) {
  const { item } = captured;
  const structured = Object.fromEntries(
    Object.entries(item.structured).filter(
      ([field]) => !['wordCount', 'mainWordCount', 'blockWordCount', 'blockCount'].includes(field),
    ),
  ) as B.CampaignBaseStructured;
  return stable({
    summary: summary(snapshot, item),
    fields: item.fields.map(({ field, sha256, bytes }) => ({ field, sha256, bytes })),
    structured: {
      ...structured,
      ...(structured.relations
        ? {
            relations: structured.relations.map(({ targetKey, relationType, description }) => ({
              targetKey,
              relationType,
              description,
            })),
          }
        : {}),
    },
    ...(ignoreImage ? {} : { image: item.image }),
  });
}
function classify(
  a: unknown,
  b: unknown,
  fingerprint: (value: unknown) => string = stable,
): C.ComparisonChangeKind {
  return a === null
    ? 'added'
    : b === null
      ? 'removed'
      : fingerprint(a) === fingerprint(b)
        ? 'unchanged'
        : 'changed';
}
function change(ctx: Context, group: C.ComparisonGroup, key: string): C.ComparisonChange | null {
  if (group === 'source') {
    const metadata = (snapshot: Snapshot) => ({
      title: snapshot.meta.title,
      synopsis: snapshot.meta.synopsis,
      language: snapshot.meta.language,
    });
    const a = metadata(ctx.current.snapshot),
      b = metadata(ctx.candidate.snapshot);
    return { key, group, change: classify(a, b), currentSummary: a, candidateSummary: b };
  }
  if (group === 'items') {
    const a = ctx.current.snapshot.items.find(({ item }) => item.sourceKey === key) ?? null,
      b = ctx.candidate.snapshot.items.find(({ item }) => item.sourceKey === key) ?? null;
    if (
      (!a && ctx.current.allKeys.items.includes(key)) ||
      (!b && ctx.candidate.allKeys.items.includes(key))
    )
      return null;
    const left = a ? summary(ctx.current.snapshot, a.item) : null,
      right = b ? summary(ctx.candidate.snapshot, b.item) : null;
    const ignoreImage =
      ctx.current.unavailableImageItemKeys.includes(key) ||
      ctx.candidate.unavailableImageItemKeys.includes(key);
    const status = !a
      ? 'added'
      : !b
        ? 'removed'
        : itemFingerprint(ctx.current.snapshot, a, ignoreImage) ===
            itemFingerprint(ctx.candidate.snapshot, b, ignoreImage)
          ? 'unchanged'
          : 'changed';
    const local = ctx.local.items[key];
    return {
      key,
      group,
      change: status,
      currentSummary: left,
      candidateSummary: right,
      orderContextChanged:
        !!left && !!right && stable(left.orderContext) !== stable(right.orderContext),
      ...(local ? { local, requiresReview: status !== 'unchanged' && local.mode !== 'base' } : {}),
    };
  }
  if (group === 'references') {
    const a = ctx.current.snapshot.links.find((link) => link.key === key) ?? null,
      b = ctx.candidate.snapshot.links.find((link) => link.key === key) ?? null;
    if (
      (!a && ctx.current.allKeys.references.includes(key)) ||
      (!b && ctx.candidate.allKeys.references.includes(key))
    )
      return null;
    return { key, group, change: classify(a, b), currentSummary: a, candidateSummary: b };
  }
  const a = ctx.current.snapshot.images[key] ?? null,
    b = ctx.candidate.snapshot.images[key] ?? null;
  if (
    (!a && ctx.current.allKeys.images.includes(key)) ||
    (!b && ctx.candidate.allKeys.images.includes(key))
  )
    return null;
  return {
    key,
    group,
    change: classify(a, b, (value) => stable((value as Snapshot['images'][string]).dataUrl)),
    currentSummary: a ? { imageKey: key, preview: 'unchecked' } : null,
    candidateSummary: b ? { imageKey: key, preview: 'unchecked' } : null,
  };
}
export async function listCampaignComparisonChanges(
  input: C.ListComparisonChangesInput,
): Promise<C.ComparisonChangesPage> {
  const ctx = await context(input.comparisonId),
    group = input.group;
  const keys =
    group === 'source'
      ? [fixtureHash({ kind: 'source' })]
      : [
          ...new Set([
            ...ctx.current.allKeys[
              group === 'items' ? 'items' : group === 'references' ? 'references' : 'images'
            ],
            ...ctx.candidate.allKeys[
              group === 'items' ? 'items' : group === 'references' ? 'references' : 'images'
            ],
          ]),
        ].sort();
  const scope = {
    uid: ctx.uid,
    comparisonId: input.comparisonId,
    group,
    kind: input.kind ?? null,
    change: input.change ?? null,
    token: ctx.envelope.comparisonToken,
  };
  const forced = Number(sessionStorage.getItem('writer.visual.comparison-scan-window') ?? 0),
    size = forced > 0 ? Math.min(forced, input.limit ?? 25) : (input.limit ?? 25);
  const window = page(keys, input.cursor, scope, size),
    items: C.ComparisonChange[] = [];
  for (const key of window.items) {
    const row = change(ctx, group, key);
    if (!row || (input.change && row.change !== input.change)) continue;
    if (
      input.kind &&
      row.group === 'items' &&
      (row.currentSummary ?? row.candidateSummary)?.kind !== input.kind
    )
      continue;
    items.push(row);
  }
  return finish('listCampaignComparisonChanges', {
    ...ctx.envelope,
    items,
    nextCursor: window.nextCursor,
  });
}
function split(text: string): string[] {
  const bytes = new TextEncoder().encode(text),
    chunks: string[] = [];
  for (let start = 0; start < bytes.length;) {
    let end = Math.min(bytes.length, start + 65536);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    chunks.push(new TextDecoder('utf-8', { fatal: true }).decode(bytes.slice(start, end)));
    start = end;
  }
  return chunks.length ? chunks : [''];
}
export async function readCampaignComparisonItem(input: {
  comparisonId: string;
  sourceKey: string;
  side: C.ComparisonSide;
  cursor?: string | null;
  limit?: number;
}): Promise<C.ComparisonItemWindow> {
  const ctx = await context(input.comparisonId),
    side = ctx[input.side];
  const captured = side.snapshot.items.find(({ item }) => item.sourceKey === input.sourceKey);
  if (!captured && side.allKeys.items.includes(input.sourceKey))
    fail('Item indisponível.', 'not-found');
  const chunks = captured
    ? Object.entries(captured.texts).flatMap(([field, text]) =>
        split(text).map((content, index) => ({ field, index, content })),
      )
    : [];
  const output = page(
    chunks,
    input.cursor,
    {
      uid: ctx.uid,
      comparisonId: input.comparisonId,
      side: input.side,
      sourceKey: input.sourceKey,
      token: ctx.envelope.comparisonToken,
    },
    input.limit ?? 4,
  );
  const wrong =
    sessionStorage.getItem('writer.visual.comparison-wrong-side') === 'readCampaignComparisonItem';
  return finish('readCampaignComparisonItem', {
    ...ctx.envelope,
    side: wrong ? (input.side === 'current' ? 'candidate' : 'current') : input.side,
    key: input.sourceKey,
    item: captured ? clone(captured.item) : null,
    chunks: output.items,
    nextCursor: output.nextCursor,
  });
}
export async function readCampaignComparisonImage(input: {
  comparisonId: string;
  imageKey: string;
  side: C.ComparisonSide;
}): Promise<C.ComparisonImage> {
  const before = await context(input.comparisonId),
    image = before[input.side].snapshot.images[input.imageKey];
  if (!image) fail('Imagem indisponível.', 'not-found');
  fixtureLibraryImage(image.imageId);
  await hold('writer.visual.comparison-hold-media-io', input.side);
  const after = await context(input.comparisonId);
  if (
    after.envelope.comparisonToken !== before.envelope.comparisonToken ||
    !after[input.side].snapshot.images[input.imageKey]
  )
    fail('A projeção mudou.', 'failed-precondition', 'cursor-invalidated');
  fixtureLibraryImage(image.imageId);
  return finish('readCampaignComparisonImage', {
    ...after.envelope,
    side: input.side,
    key: input.imageKey,
    dataUrl: 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA',
  });
}

// Fixture-only seams: the production controller still owns decisions and local journals.
export async function fixtureCampaignAdoptionComparison(comparisonId: string) {
  const ctx = await context(comparisonId);
  return {
    envelope: clone(ctx.envelope),
    candidate: clone(ctx.candidate.snapshot),
    candidateKeys: clone(ctx.candidate.allKeys.items),
    current: clone(ctx.current.snapshot),
    adventureId: ctx.job.adventureId,
  };
}
export function fixtureCampaignAdoptionClaim(
  comparisonId: string,
  adoptionId: string,
  release = false,
) {
  const uid = fixtureOwner(),
    data = read(),
    job = find(data, uid, comparisonId);
  if (job.adopted) fail('A candidata já foi adotada.');
  if (job.adoptionClaim && job.adoptionClaim !== adoptionId) conflict();
  if (release) {
    if (job.adoptionClaim === adoptionId) delete job.adoptionClaim;
  } else {
    if (job.progress.state !== 'ready') fail('A candidata não está pronta.');
    job.adoptionClaim = adoptionId;
  }
  persist(data);
}
export function fixtureCampaignComparisonAdopt(comparisonId: string, adoptionId: string) {
  const data = read(),
    job = find(data, fixtureOwner(), comparisonId);
  if (job.adoptionClaim !== adoptionId || job.adopted) conflict();
  job.adopted = true;
  job.progress.state = 'adopted';
  delete job.adoptionClaim;
  persist(data);
}
export async function fixtureCampaignAdoptedSnapshot(
  comparisonId: string,
  campaignId: string,
  baseId: string,
) {
  const uid = fixtureOwner(),
    job = find(read(), uid, comparisonId),
    campaign = await fixtureGet('campaign', campaignId);
  current(uid);
  if (
    !job.adopted ||
    job.input.campaignId !== campaignId ||
    job.progress.candidateBaseId !== baseId ||
    !campaign ||
    campaign.provenance.kind !== 'original' ||
    campaign.activeBaseId !== baseId ||
    campaign.provenance.baseId !== baseId ||
    fixtureCampaignToken(uid, campaignId) !== job.input.campaignToken
  )
    fail('Base adotada indisponível.', 'not-found');
  const adventure = await fixtureGet('adventure', job.adventureId);
  current(uid);
  if (!adventure || ('deleting' in adventure && adventure.deleting))
    fail('Origem indisponível.', 'not-found');
  const projected = await project(job.snapshot, uid);
  current(uid);
  return clone(projected.snapshot);
}

// Sanitize only controls belonging to the deleted campaign; preserve other mesas.
export function fixtureDeleteCampaignComparisons(uid: string, campaignId: string): boolean {
  current(uid);
  const data = read();
  for (const [fenceKey, fence] of Object.entries(data.fences)) {
    if (fenceKey === key(uid, fence.operationId) && fence.campaignId === campaignId)
      delete data.fences[fenceKey];
  }
  const entry = Object.entries(data.jobs).find(
    ([, job]) => job.uid === uid && job.input.campaignId === campaignId,
  );
  if (!entry) {
    persist(data);
    return true;
  }
  const [entryKey, job] = entry;
  const imageKey = job.pins[0];
  if (imageKey) {
    fixtureSetImageUse('candidate:' + job.progress.candidateBaseId + ':' + imageKey, null);
    job.pins.shift();
    persist(data);
    return false;
  }
  const terminalKey = 'writer.visual.campaign-comparison-terminals';
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
        { fingerprint: fixtureHash(value.fingerprint), receipt: value.receipt },
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
