import type * as C from '../../../src/features/campaign-bases/model/campaignBase';
import type { Adventure } from '../../../src/features/adventures/model/adventure';
import type { Campaign } from '../../../src/features/campaigns/model/campaign';
import type { SceneReference } from '../../../src/features/scenes/model/scene';
import {
  fixtureActivateCapturedCampaign,
  fixtureGet,
  fixtureOwner,
  fixturePatchProject,
} from './studioStore';
import { fixtureContentHash, fixtureHash, fixtureSceneState } from './sceneStore';
import { fixtureNarrativeState, fixtureNarrativeSourceKey } from './narrativeStore';
import { getUniverse } from './universeService';
import { getLoreEntity } from './loreService';
import { fixtureLibraryImage, fixtureSetImageUse } from './imageLibraryService';
import { FIXTURE_TIME } from './data';

type Captured = {
  item: C.CampaignBaseItem;
  texts: Record<string, string>;
  origin: { kind: string; id: string; scopeId?: string };
};
type Link = C.CampaignBaseReference;
interface Snapshot {
  meta: C.CampaignBase['source'];
  universeId: string | null;
  items: Captured[];
  links: Link[];
  images: Record<string, { imageId: string; dataUrl: string }>;
}
interface RecordCapture {
  uid: string;
  sourceToken: string;
  adoptedComparisonId?: string;
  baseId: string;
  progress: C.CampaignCaptureProgress;
  snapshot: Snapshot;
  campaignId: string | null;
  receipts: Record<
    string,
    { fingerprint: string; method: string; checkpoint?: number; aborted?: true }
  >;
}
const storageKey = 'writer.visual.campaign-bases';
const records = new Map<string, RecordCapture>(
  JSON.parse(sessionStorage.getItem(storageKey) ?? '[]') as [string, RecordCapture][],
);
const kinds: C.CampaignBaseItemKind[] = [
  'part',
  'scene',
  'block',
  'arc',
  'milestone',
  'event',
  'lore',
];
const phases = Object.keys({
  parts: 1,
  scenes: 1,
  blocks: 1,
  sceneReferences: 1,
  arcs: 1,
  milestones: 1,
  events: 1,
  narrativeLinks: 1,
  lore: 1,
  images: 1,
  finalizing: 1,
  complete: 1,
}) as C.CampaignCapturePhase[];
const emptyCounts = () =>
  Object.fromEntries([...kinds, 'reference', 'image'].map((kind) => [kind, 0])) as Record<
    C.CampaignCaptureCountKind,
    number
  >;
const keyFor = (uid: string, id: string) => JSON.stringify([uid, id]);
const persist = () => sessionStorage.setItem(storageKey, JSON.stringify([...records]));
const sourceKey = (kind: string, id: string, extra: unknown = {}) =>
  fixtureHash({ kind, id, extra });
function fail(message: string, code = 'failed-precondition', reason?: string): never {
  throw Object.assign(new Error(message), {
    code: 'functions/' + code,
    ...(reason ? { details: { reason } } : {}),
  });
}
const conflict = () =>
  fail(
    'A origem ou o progresso mudou. Confira antes de continuar.',
    'failed-precondition',
    'revision-conflict',
  );
function current(uid: string) {
  if (uid !== fixtureOwner()) fail('A conta mudou.', 'permission-denied');
}
function find(captureId: string) {
  const record = records.get(keyFor(fixtureOwner(), captureId));
  if (!record) fail('Preparação indisponível.', 'not-found');
  return record;
}
function originAvailable(adventure: Adventure | null) {
  return Boolean(adventure && !('deleting' in adventure && adventure.deleting));
}
async function gate(adventureId: string) {
  const uid = fixtureOwner();
  if (sessionStorage.getItem('writer.visual.capture-revoked') === adventureId)
    fixturePatchProject('adventure', adventureId, { deleting: true } as never);
  const adventure = await fixtureGet('adventure', adventureId);
  current(uid);
  if (!originAvailable(adventure)) fail('Aventura indisponível.', 'not-found');
  return adventure!;
}
async function snapshot(adventureId: string): Promise<{ value: Snapshot; token: string }> {
  const uid = fixtureOwner(),
    adventure = await gate(adventureId),
    target = { kind: 'adventure' as const, id: adventureId };
  const scenes = structuredClone(await fixtureSceneState(target)),
    narrative = structuredClone(await fixtureNarrativeState(target));
  const world = adventure.universeId ? await getUniverse(adventure.universeId) : null;
  current(uid);
  if (adventure.universeId && world?.authorId !== uid)
    fail('Universo da origem indisponível.', 'not-found');
  const items: Captured[] = [],
    links: Link[] = [],
    images: Snapshot['images'] = {},
    references = new Map<string, SceneReference>();
  async function add(
    kind: C.CampaignBaseItemKind,
    id: string,
    title: string,
    texts: Record<string, string>,
    extra: Partial<C.CampaignBaseItem> = {},
    originExtra: { scopeId?: string } = {},
  ) {
    const key = sourceKey(kind, id, originExtra),
      fields: C.CampaignBaseManifest[] = [];
    for (const [field, text] of Object.entries(texts)) {
      const chunks = split(text);
      fields.push({
        field,
        sha256: await fixtureContentHash(text),
        bytes: new TextEncoder().encode(text).length,
        chunkCount: chunks.length,
      });
    }
    const item: C.CampaignBaseItem = {
      sourceKey: key,
      kind,
      parentKey: null,
      title,
      archived: false,
      orderKey: id,
      fields,
      structured: {},
      image: null,
      ...extra,
    };
    items.push({ item, texts, origin: { kind, id, ...originExtra } });
    return item;
  }
  function image(value: { imageId: string; alt: string; caption: string } | null | undefined) {
    if (!value) return null;
    const imageKey = sourceKey('image', value.imageId),
      library = fixtureLibraryImage(value.imageId);
    images[imageKey] = { imageId: value.imageId, dataUrl: library.url };
    return { imageKey, alt: value.alt, caption: value.caption };
  }
  for (const group of Object.values(scenes.groups).filter(
    (group) => group.id !== null && !group.deleting,
  )) {
    const legacy = scenes.sources[group.id!]?.content;
    await add(
      'part',
      group.id!,
      group.title,
      legacy === undefined ? {} : { legacyContent: legacy },
      {
        orderKey: String(group.order).padStart(16, '0'),
        structured: { contentMode: group.contentMode },
      },
    );
  }
  for (const scene of Object.values(scenes.scenes)) {
    const key = sourceKey('scene', scene.id),
      plan = scenes.planning[scene.id] ?? { objective: '', conflict: '', pointOfView: '' };
    await add(
      'scene',
      scene.id,
      scene.title,
      { content: scenes.bodies[scene.id] ?? '', ...plan },
      {
        parentKey: scene.parentId === null ? null : sourceKey('part', scene.parentId),
        archived: scene.archived,
        orderKey: scene.rank,
        stage: scene.stage,
        structured: {
          wordCount: scene.wordCount,
          mainWordCount: scene.mainWordCount ?? scene.wordCount,
          blockWordCount: scene.blockWordCount ?? 0,
          blockCount: scene.blockCount ?? 0,
        },
      },
    );
    await add(
      'block',
      scene.id,
      scene.mainBlockTitle ?? 'Texto principal',
      { content: scenes.bodies[scene.id] ?? '' },
      {
        sourceKey: sourceKey('block-main', scene.id),
        parentKey: key,
        archived: scene.archived,
        orderKey: String(scene.mainBlockOrder ?? 0).padStart(16, '0'),
        role: 'main',
        type: scene.mainBlockType ?? 'scene',
        audience: scene.mainBlockAudience ?? 'creator',
        structured: { wordCount: scene.mainWordCount ?? scene.wordCount },
        image: image(scene.mainBlockImage),
      },
    );
    for (const entry of scenes.references[scene.id] ?? []) {
      const reference = entry.reference,
        targetKey =
          reference.kind === 'universe' && reference.scopeId === adventure.universeId
            ? sourceKey('lore', reference.entityId, { scopeId: reference.scopeId })
            : null;
      if (targetKey) references.set(targetKey, reference);
      links.push({
        key: sourceKey('scene-link', entry.id, { sceneId: scene.id }),
        kind: 'scene',
        sourceKey: key,
        targetKey,
        available: false,
      });
    }
  }
  for (const block of Object.values(scenes.adventureBlocks ?? {})) {
    const scene = scenes.scenes[block.sceneId];
    await add(
      'block',
      block.resource.id,
      block.title,
      { content: scenes.adventureBlockBodies?.[block.resource.id] ?? '' },
      {
        parentKey: sourceKey('scene', block.sceneId),
        archived: Boolean(scene?.archived || block.archived),
        orderKey: String(block.order).padStart(16, '0'),
        role: 'additional',
        type: block.narrativeType,
        audience: block.audience,
        structured: { wordCount: block.wordCount, ownArchived: block.archived },
        image: image(block.image),
      },
    );
  }
  for (const item of Object.values(narrative.items)) {
    const texts: Record<string, string> =
      item.kind === 'arc'
        ? {
            initialState: item.initialState,
            objective: item.objective,
            plannedOutcome: item.plannedOutcome,
          }
        : item.kind === 'milestone'
          ? { notes: item.notes }
          : { description: item.description };
    await add(item.kind, item.id, item.title, texts, {
      parentKey: item.kind === 'milestone' ? sourceKey('arc', item.arcId) : null,
      orderKey: item.rank,
      ...(item.kind === 'event' ? { dateLabel: item.dateLabel } : {}),
    });
    for (const entry of narrative.references[fixtureNarrativeSourceKey(item)] ?? []) {
      const reference = entry.reference;
      let targetKey: string | null = null;
      if (
        reference.kind === 'lore' &&
        reference.reference.kind === 'universe' &&
        reference.reference.scopeId === adventure.universeId
      ) {
        targetKey = sourceKey('lore', reference.reference.entityId, {
          scopeId: reference.reference.scopeId,
        });
        references.set(targetKey, reference.reference);
      } else if (reference.kind === 'scene') targetKey = sourceKey('scene', reference.sceneId);
      else if (reference.kind === 'event') targetKey = sourceKey('event', reference.eventId);
      links.push({
        key: sourceKey('narrative-link', entry.id),
        kind: 'narrative',
        sourceKey: sourceKey(item.kind, item.id),
        targetKey,
        available: false,
      });
    }
  }
  for (const [key, reference] of references) {
    const entity = await getLoreEntity(
      { kind: 'universe', id: reference.scopeId },
      'universe:' + reference.scopeId + ':' + reference.entityId,
    );
    if (!entity) continue;
    const texts: Record<string, string> = { summary: entity.summary, details: entity.details };
    for (const field of ['appearance', 'personality', 'history', 'notes'] as const)
      if (entity.structuredDetails) texts[field] = entity.structuredDetails[field];
    await add(
      'lore',
      reference.entityId,
      entity.name,
      texts,
      {
        sourceKey: key,
        structured: {
          aliases: entity.aliases,
          category: entity.category,
          isPublic: entity.isPublic,
          relations: [],
        },
      },
      { scopeId: reference.scopeId },
    );
  }
  for (const captured of items.filter((value) => value.item.kind === 'lore')) {
    const entity = await getLoreEntity(
      { kind: 'universe', id: captured.origin.scopeId! },
      'universe:' + captured.origin.scopeId + ':' + captured.origin.id,
    );
    captured.item.structured.relations = (entity?.relations ?? []).flatMap((relation) => {
      const prefix = 'universe:' + captured.origin.scopeId + ':';
      const target = items.find(
        (candidate) =>
          candidate.item.kind === 'lore' &&
          candidate.origin.scopeId === captured.origin.scopeId &&
          relation.targetEntityId.startsWith(prefix) &&
          candidate.origin.id === relation.targetEntityId.slice(prefix.length),
      );
      return target
        ? [
            {
              targetKey: target.item.sourceKey,
              title: target.item.title,
              relationType: relation.relationType,
              description: relation.description ?? '',
            },
          ]
        : [];
    });
  }
  for (const link of links)
    link.available = items.some((item) => item.item.sourceKey === link.targetKey);
  current(uid);
  const value: Snapshot = {
    meta: {
      adventureId,
      title: adventure.title,
      synopsis: adventure.synopsis,
      language: adventure.language,
    },
    universeId: adventure.universeId,
    items,
    links,
    images,
  };
  return {
    value,
    token: await fixtureContentHash(
      JSON.stringify({
        adventure,
        value,
        world,
        scenesRevision: scenes.revision,
        narrativeRevision: narrative.revision,
      }),
    ),
  };
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
async function available(record: RecordCapture) {
  try {
    const adventure = await gate(record.progress.request.adventureId),
      uid = fixtureOwner();
    if (adventure.universeId) {
      const world = await getUniverse(adventure.universeId);
      current(uid);
      if (world?.authorId !== uid) return false;
    }
    return true;
  } catch {
    return false;
  }
}
async function progress(record: RecordCapture): Promise<C.CampaignCaptureProgress> {
  const sourceAvailable = await available(record);
  return structuredClone({
    ...record.progress,
    sourceAvailable,
    processed: sourceAvailable ? record.progress.processed : 0,
    counts: sourceAvailable ? record.progress.counts : null,
  });
}
const queues = new Map<string, Promise<unknown>>();
function serial<T>(uid: string, work: () => Promise<T>): Promise<T> {
  const previous = queues.get(uid) ?? Promise.resolve(),
    result = previous.catch(() => undefined).then(work);
  queues.set(uid, result);
  void result
    .finally(() => {
      if (queues.get(uid) === result) queues.delete(uid);
    })
    .catch(() => undefined);
  return result;
}
function receipt(record: RecordCapture, method: string, input: { operationId: string }) {
  const fingerprint = fixtureHash({ method, input }),
    old = record.receipts[input.operationId];
  if (old && old.fingerprint !== fingerprint)
    fail('O pedido já foi usado com outros dados.', 'invalid-argument');
  return {
    old: !!old,
    commit() {
      record.receipts[input.operationId] = {
        fingerprint,
        method,
        checkpoint: record.progress.checkpoint,
        ...(method === 'activateCampaignCapture' && record.progress.state === 'aborted'
          ? { aborted: true as const }
          : {}),
      };
      persist();
    },
  };
}
const holds = new Map<string, Promise<void>>();
async function finish<T>(uid: string, method: string, value: T): Promise<T> {
  if (sessionStorage.getItem('writer.visual.capture-hold') === method) {
    const key = keyFor(uid, method);
    let hold = holds.get(key);
    if (!hold) {
      hold = new Promise<void>((resolve) =>
        window.addEventListener(
          'writer.visual.capture-release',
          () => {
            sessionStorage.removeItem('writer.visual.capture-hold');
            holds.delete(key);
            resolve();
          },
          { once: true },
        ),
      );
      holds.set(key, hold);
    }
    await hold;
  }
  current(uid);
  if (sessionStorage.getItem('writer.visual.capture-lost-response') === method) {
    sessionStorage.removeItem('writer.visual.capture-lost-response');
    fail('A resposta se perdeu. Confirme o mesmo pedido.', 'unavailable');
  }
  return structuredClone(value);
}
export async function getCampaignCaptureSource({
  adventureId,
}: {
  adventureId: string;
}): Promise<C.CampaignCaptureSource> {
  const source = await snapshot(adventureId);
  return {
    adventureId,
    title: source.value.meta.title,
    universeId: source.value.universeId,
    sourceToken: source.token,
    loreSelection: 'referenced',
    counts: Object.fromEntries(
      [...kinds, 'reference', 'image'].map((kind) => [kind, null]),
    ) as C.CampaignCaptureSource['counts'],
  };
}
export function startCampaignCapture(
  input: C.StartCampaignCaptureInput,
): Promise<C.CampaignCaptureProgress> {
  const uid = fixtureOwner();
  return serial(uid, async () => {
    current(uid);
    const existing = records.get(keyFor(uid, input.operationId));
    if (existing) {
      receipt(existing, 'startCampaignCapture', input);
      return finish(uid, 'startCampaignCapture', await progress(existing));
    }
    const source = await snapshot(input.adventureId);
    current(uid);
    if (source.token !== input.expectedSourceToken) conflict();
    const record: RecordCapture = {
      uid,
      sourceToken: source.token,
      baseId: sourceKey('base', input.operationId),
      snapshot: source.value,
      campaignId: null,
      receipts: {},
      progress: {
        captureId: input.operationId,
        reserved: {
          campaignId: sourceKey('campaign', input.operationId, { uid }),
          baseId: sourceKey('base', input.operationId),
        },
        state: 'preparing',
        phase: 'parts',
        checkpoint: 0,
        processed: 0,
        counts: emptyCounts(),
        sourceAvailable: true,
        cleanupComplete: false,
        campaignId: null,
        reason: null,
        request: {
          adventureId: input.adventureId,
          title: input.title.trim(),
          description: input.description.trim(),
          universeId: input.universeId,
        },
        createdAt: FIXTURE_TIME,
        updatedAt: FIXTURE_TIME,
      },
    };
    records.set(keyFor(uid, input.operationId), record);
    receipt(record, 'startCampaignCapture', input).commit();
    return finish(uid, 'startCampaignCapture', record.progress);
  });
}
export const getCampaignCapture = ({ captureId }: { captureId: string }) =>
  progress(find(captureId));
export async function listCampaignCaptures(
  input: C.ListCampaignCapturesInput = {},
): Promise<C.CampaignCaptureList> {
  const uid = fixtureOwner(),
    values = [...records.values()].filter(
      (record) =>
        record.uid === uid &&
        !['activated', 'deleted'].includes(record.progress.state) &&
        (!input.adventureId || record.progress.request.adventureId === input.adventureId),
    );
  const page = pageOf(
    values,
    input.cursor,
    { uid, adventureId: input.adventureId ?? null },
    input.limit ?? 25,
  );
  const items = await Promise.all(page.items.map(progress));
  current(uid);
  return { items, nextCursor: page.nextCursor };
}
export function advanceCampaignCapture(
  input: C.AdvanceCampaignCaptureInput,
): Promise<C.CampaignCaptureProgress> {
  const uid = fixtureOwner();
  return serial(uid, async () => {
    current(uid);
    const record = find(input.captureId),
      operation = receipt(record, 'advanceCampaignCapture', input);
    if (operation.old) return finish(uid, 'advanceCampaignCapture', await progress(record));
    if (record.progress.checkpoint !== input.expectedCheckpoint) conflict();
    if (record.progress.state !== 'preparing') fail('Preparação não está em andamento.');
    if (
      sessionStorage.getItem('writer.visual.capture-source-changed') ===
      record.progress.request.adventureId
    ) {
      sessionStorage.removeItem('writer.visual.capture-source-changed');
      fixturePatchProject('adventure', record.progress.request.adventureId, {
        synopsis: 'Origem alterada em outro dispositivo.',
      });
    }
    const present = await snapshot(record.progress.request.adventureId).catch(() => null);
    current(uid);
    if (!present || present.token !== record.sourceToken) {
      record.progress.state = 'aborted';
      record.progress.reason = present ? 'source-changed' : 'source-unavailable';
    } else {
      const index = phases.indexOf(record.progress.phase),
        next = phases[Math.min(index + 1, phases.length - 1)];
      record.progress.phase = next;
      const field = (
        {
          scenes: 'part',
          blocks: 'scene',
          sceneReferences: 'block',
          arcs: 'reference',
          milestones: 'arc',
          events: 'milestone',
          narrativeLinks: 'event',
          images: 'lore',
          finalizing: 'image',
        } as Record<string, C.CampaignCaptureCountKind>
      )[next];
      if (field && record.progress.counts) {
        const count =
          field === 'reference'
            ? record.snapshot.links.length
            : field === 'image'
              ? Object.keys(record.snapshot.images).length
              : record.snapshot.items.filter((value) => value.item.kind === field).length;
        record.progress.counts[field] = count;
        record.progress.processed += count;
      }
      if (next === 'finalizing')
        for (const [imageKey, image] of Object.entries(record.snapshot.images))
          fixtureSetImageUse(
            JSON.stringify(['campaign-base', record.baseId, imageKey]),
            image.imageId,
          );
      if (next === 'complete') record.progress.state = 'prepared';
    }
    record.progress.checkpoint++;
    record.progress.updatedAt++;
    operation.commit();
    return finish(uid, 'advanceCampaignCapture', await progress(record));
  });
}
export function activateCampaignCapture(
  input: C.ActivateCampaignCaptureInput,
): Promise<C.CampaignCaptureActivation> {
  const uid = fixtureOwner();
  return serial(uid, async () => {
    current(uid);
    const record = find(input.captureId),
      operation = receipt(record, 'activateCampaignCapture', input);
    if (operation.old) {
      if (record.progress.state === 'aborted')
        return finish(uid, 'activateCampaignCapture', {
          kind: 'aborted' as const,
          preparation: await progress(record),
        });
      const campaign = record.campaignId ? await fixtureGet('campaign', record.campaignId) : null;
      current(uid);
      if (
        !campaign ||
        campaign.provenance.kind !== 'original' ||
        campaign.id !== record.progress.reserved.campaignId ||
        campaign.activeBaseId !== record.baseId ||
        campaign.provenance.baseId !== record.baseId ||
        campaign.provenance.adventureId !== record.progress.request.adventureId
      )
        fail('Campanha indisponível.', 'not-found');
      return finish(uid, 'activateCampaignCapture', {
        kind: 'already-activated' as const,
        campaignId: campaign.id,
      });
    }
    if (record.progress.checkpoint !== input.expectedCheckpoint) conflict();
    if (record.progress.state !== 'prepared') fail('Preparação não está pronta.');
    const source = await snapshot(record.progress.request.adventureId).catch(() => null);
    current(uid);
    if (!source || source.token !== record.sourceToken) {
      record.progress.state = 'aborted';
      record.progress.reason = source ? 'source-changed' : 'source-unavailable';
      record.progress.checkpoint++;
      operation.commit();
      return finish(uid, 'activateCampaignCapture', {
        kind: 'aborted' as const,
        preparation: await progress(record),
      });
    }
    const confirmed: Campaign = {
      id: record.progress.reserved.campaignId,
      ownerId: uid,
      schemaVersion: 1,
      revision: 1,
      title: record.progress.request.title,
      description: record.progress.request.description,
      universeId: record.progress.request.universeId,
      status: 'planning',
      createdAt: FIXTURE_TIME,
      updatedAt: record.progress.updatedAt + 1,
      provenance: {
        kind: 'original',
        adventureId: record.progress.request.adventureId,
        baseId: record.baseId,
      },
      activeBaseId: record.baseId,
    };
    const campaign = fixtureActivateCapturedCampaign(confirmed);
    record.campaignId = campaign.id;
    record.progress.campaignId = campaign.id;
    record.progress.state = 'activated';
    record.progress.updatedAt++;
    operation.commit();
    return finish(uid, 'activateCampaignCapture', {
      kind: 'activated' as const,
      campaign: confirmed,
    });
  });
}
export function cancelCampaignCapture(
  input: C.CancelCampaignCaptureInput,
): Promise<C.CampaignCaptureProgress> {
  const uid = fixtureOwner();
  return serial(uid, async () => {
    current(uid);
    const record = find(input.captureId),
      operation = receipt(record, 'cancelCampaignCapture', input);
    if (operation.old) return finish(uid, 'cancelCampaignCapture', await progress(record));
    if (record.progress.checkpoint !== input.expectedCheckpoint) conflict();
    if (record.progress.state === 'activated') fail('A campanha já está ativa.');
    if (record.progress.state === 'deleting') {
      for (const [key] of Object.entries(record.snapshot.images))
        fixtureSetImageUse(JSON.stringify(['campaign-base', record.baseId, key]), null);
      record.snapshot.items = [];
      record.snapshot.links = [];
      record.snapshot.images = {};
      record.progress.state = 'deleted';
      record.progress.cleanupComplete = true;
    } else record.progress.state = 'deleting';
    record.progress.phase = 'cleanup';
    record.progress.checkpoint++;
    record.progress.updatedAt++;
    operation.commit();
    return finish(uid, 'cancelCampaignCapture', await progress(record));
  });
}
function pageOf<T>(items: T[], cursor: string | null | undefined, scope: unknown, limit: number) {
  const parsed = cursor
    ? (JSON.parse(cursor) as { scope: unknown; offset: number })
    : { scope, offset: 0 };
  if (
    JSON.stringify(parsed.scope) !== JSON.stringify(scope) ||
    !Number.isSafeInteger(parsed.offset) ||
    parsed.offset < 0
  )
    fail('A projeção mudou. Reabra a base.', 'failed-precondition', 'cursor-invalidated');
  return {
    items: items.slice(parsed.offset, parsed.offset + limit),
    nextCursor:
      parsed.offset + limit < items.length
        ? JSON.stringify({ scope, offset: parsed.offset + limit })
        : null,
  };
}
async function context(campaignId: string) {
  const uid = fixtureOwner(),
    campaign = await fixtureGet('campaign', campaignId);
  current(uid);
  const stored = [...records.values()].find(
    (record) =>
      record.uid === uid &&
      record.campaignId === campaignId &&
      record.baseId === campaign?.activeBaseId &&
      record.progress.state === 'activated',
  );
  const record = stored?.adoptedComparisonId
    ? {
        ...stored,
        snapshot: await (
          await import('./campaignComparisonFixture')
        ).fixtureCampaignAdoptedSnapshot(stored.adoptedComparisonId, campaignId, stored.baseId),
      }
    : stored;
  if (
    !campaign ||
    campaign.provenance.kind !== 'original' ||
    !record ||
    campaign.activeBaseId !== record.baseId
  )
    fail('Base indisponível.', 'not-found');
  await gate(record.progress.request.adventureId);
  current(uid);
  const world = record.snapshot.universeId ? await getUniverse(record.snapshot.universeId) : null;
  const allowed = new Set<string>();
  for (const value of record.snapshot.items) {
    if (value.item.kind !== 'lore') allowed.add(value.item.sourceKey);
    else if (
      world?.authorId === uid &&
      (await getLoreEntity(
        { kind: 'universe', id: value.origin.scopeId! },
        'universe:' + value.origin.scopeId + ':' + value.origin.id,
      ))
    )
      allowed.add(value.item.sourceKey);
  }
  current(uid);
  return {
    record,
    allowed,
    token: fixtureHash({
      uid,
      baseId: record.baseId,
      allowed: [...allowed].sort(),
      privacyVersion: world?.privacyVersion ?? null,
    }),
  };
}
export async function getCampaignBase({
  campaignId,
}: {
  campaignId: string;
}): Promise<C.CampaignBase> {
  const { record, token } = await context(campaignId);
  return {
    baseId: record.baseId,
    capturedAt: record.progress.updatedAt,
    source: structuredClone(record.snapshot.meta),
    projectionToken: token,
  };
}
export async function listCampaignBaseItems(
  input: C.ListCampaignBaseItemsInput,
): Promise<C.CampaignBaseList> {
  const { record, allowed, token } = await context(input.campaignId);
  const values = record.snapshot.items
    .filter(
      ({ item }) =>
        item.kind === input.kind &&
        (!Object.hasOwn(input, 'parentKey') ||
          input.parentKey === undefined ||
          item.parentKey === input.parentKey) &&
        (input.archive === 'all' || item.archived === (input.archive === 'archived')),
    )
    .sort(
      (a, b) =>
        a.item.orderKey.localeCompare(b.item.orderKey) ||
        a.item.sourceKey.localeCompare(b.item.sourceKey),
    );
  const page = pageOf(
    values,
    input.cursor,
    {
      uid: fixtureOwner(),
      campaignId: input.campaignId,
      kind: input.kind,
      parent: input.parentKey ?? '*',
      archive: input.archive ?? 'active',
      token,
    },
    input.limit ?? 25,
  );
  return {
    items: page.items
      .filter((value) => allowed.has(value.item.sourceKey))
      .map(({ item }) => {
        const { fields, structured, image, ...summary } = item;
        void fields;
        void structured;
        void image;
        return structuredClone(summary);
      }),
    nextCursor: page.nextCursor,
    projectionToken: token,
  };
}
export async function readCampaignBaseItem(
  input: C.ReadCampaignBaseItemInput,
): Promise<C.CampaignBaseWindow> {
  const { record, allowed, token } = await context(input.campaignId),
    value = record.snapshot.items.find((value) => value.item.sourceKey === input.sourceKey);
  if (!value || !allowed.has(value.item.sourceKey)) fail('Item indisponível.', 'not-found');
  const item = structuredClone(value.item);
  if (item.structured.relations)
    item.structured.relations = item.structured.relations.filter((relation) =>
      allowed.has(relation.targetKey),
    );
  const chunks = Object.entries(value.texts).flatMap(([field, text]) =>
    split(text).map((content, index) => ({ field, index, content })),
  );
  const page = pageOf(
    chunks,
    input.cursor,
    { uid: fixtureOwner(), campaignId: input.campaignId, key: input.sourceKey, token },
    input.limit ?? 4,
  );
  return { item, chunks: page.items, nextCursor: page.nextCursor, projectionToken: token };
}
export async function listCampaignBaseReferences(input: {
  campaignId: string;
  sourceKey: string;
  cursor?: string | null;
  limit?: number;
}): Promise<C.CampaignBaseReferences> {
  const { record, allowed, token } = await context(input.campaignId);
  if (!allowed.has(input.sourceKey)) fail('Item indisponível.', 'not-found');
  const links = record.snapshot.links
    .filter((link) => link.sourceKey === input.sourceKey)
    .map((link) => ({
      ...link,
      targetKey: link.targetKey && allowed.has(link.targetKey) ? link.targetKey : null,
      available: !!link.targetKey && allowed.has(link.targetKey),
    }));
  return {
    ...pageOf(
      links,
      input.cursor,
      { uid: fixtureOwner(), campaignId: input.campaignId, key: input.sourceKey, token },
      input.limit ?? 25,
    ),
    projectionToken: token,
  };
}
export async function readCampaignBaseImage({
  campaignId,
  imageKey,
}: {
  campaignId: string;
  imageKey: string;
}): Promise<C.CampaignBaseImage> {
  const { record, token } = await context(campaignId),
    image = record.snapshot.images[imageKey];
  if (!image) fail('Imagem indisponível.', 'not-found');
  fixtureLibraryImage(image.imageId);
  // Local inert WebP transport; the real renderer still validates its media envelope.
  const dataUrl = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
  return { dataUrl, projectionToken: token };
}

// Read-only simulated server seam: raw scan keys, authorized captured metadata only.
export async function fixtureCampaignBaseLoreMetadata(campaignId: string) {
  const { record, allowed, token } = await context(campaignId);
  return {
    baseId: record.baseId,
    projectionToken: token,
    availableSourceKeys: record.snapshot.items
      .filter(({ item }) => item.kind === 'lore' && allowed.has(item.sourceKey))
      .map(({ item }) => item.sourceKey),
    items: record.snapshot.items
      .filter(({ item }) => item.kind === 'lore')
      .map(({ item }) => ({
        sourceKey: item.sourceKey,
        ...(allowed.has(item.sourceKey)
          ? { name: item.title, category: item.structured.category }
          : {}),
      })),
  };
}

// Read-only seams for the comparison transport. They never activate another campaign.
export async function fixtureCampaignComparisonSource(adventureId: string) {
  const { value, token } = await snapshot(adventureId);
  return { snapshot: structuredClone(value), sourceToken: token };
}
export async function fixtureCampaignComparisonCurrent(campaignId: string) {
  const { record, allowed, token } = await context(campaignId);
  const value = structuredClone(record.snapshot);
  const allKeys = {
    items: value.items.map(({ item }) => item.sourceKey),
    references: value.links.map((link) => link.key),
    images: Object.keys(value.images),
  };
  value.items = value.items.filter(({ item }) => allowed.has(item.sourceKey));
  for (const { item } of value.items) {
    if (item.structured.relations)
      item.structured.relations = item.structured.relations.filter((relation) =>
        allowed.has(relation.targetKey),
      );
  }
  value.links = value.links
    .filter((link) => allowed.has(link.sourceKey))
    .map((link) => ({
      ...link,
      targetKey: link.targetKey && allowed.has(link.targetKey) ? link.targetKey : null,
      available: !!link.targetKey && allowed.has(link.targetKey),
    }));
  value.images = Object.fromEntries(
    Object.entries(value.images).filter(([, image]) => {
      try {
        fixtureLibraryImage(image.imageId);
        return true;
      } catch {
        return false;
      }
    }),
  );
  const unavailableImageItemKeys: string[] = [];
  for (const { item } of value.items) {
    if (item.image && !value.images[item.image.imageKey]) {
      unavailableImageItemKeys.push(item.sourceKey);
      item.image = null;
    }
  }
  return {
    baseId: record.baseId,
    adventureId: record.progress.request.adventureId,
    capturedAt: record.progress.updatedAt,
    projectionToken: token,
    allKeys,
    unavailableImageItemKeys,
    snapshot: value,
  };
}

export async function fixtureActivateAdoptedCampaignBase(input: {
  campaignId: string;
  comparisonId: string;
  baseId: string;
  capturedAt: number;
  source: C.CampaignBase['source'];
  universeId: string | null;
}) {
  const uid = fixtureOwner(),
    campaign = await fixtureGet('campaign', input.campaignId);
  current(uid);
  if (
    !campaign ||
    campaign.provenance.kind !== 'original' ||
    campaign.provenance.adventureId !== input.source.adventureId
  )
    fail('Campanha indisponível.', 'not-found');
  const previous = [...records.values()].find(
    (record) =>
      record.uid === uid &&
      record.campaignId === campaign.id &&
      record.baseId === campaign.activeBaseId,
  );
  if (!previous) fail('Base atual indisponível.', 'not-found');
  const adopted: RecordCapture = {
    ...previous,
    adoptedComparisonId: input.comparisonId,
    baseId: input.baseId,
    progress: {
      ...structuredClone(previous.progress),
      reserved: { campaignId: campaign.id, baseId: input.baseId },
      updatedAt: input.capturedAt,
    },
    snapshot: {
      meta: structuredClone(input.source),
      universeId: input.universeId,
      items: [],
      links: [],
      images: {},
    },
    receipts: {},
  };
  records.set(keyFor(uid, 'adopted:' + input.baseId), adopted);
  fixturePatchProject('campaign', campaign.id, {
    activeBaseId: input.baseId,
    provenance: { ...campaign.provenance, baseId: input.baseId },
  });
  persist();
}
export async function resolveCampaignCaptureActivation(
  input: C.ResolveCampaignCaptureActivationInput,
): Promise<C.CampaignCaptureActivationResolution> {
  const uid = fixtureOwner(),
    record = records.get(keyFor(uid, input.captureId)),
    receipt = record?.receipts[input.operationId];
  if (!receipt)
    fail('Ativação sem confirmação histórica.', 'failed-precondition', 'operation-unconfirmed');
  if (
    receipt.method !== 'activateCampaignCapture' ||
    receipt.fingerprint !== fixtureHash({ method: 'activateCampaignCapture', input })
  )
    fail('Pedido diferente do registro histórico.', 'invalid-argument');
  if (receipt.checkpoint !== input.expectedCheckpoint + 1)
    fail('Registro histórico inconsistente.');
  return finish(uid, 'resolveCampaignCaptureActivation', {
    schemaVersion: 1,
    ownerId: uid,
    request: structuredClone(input),
    outcome: receipt.aborted === true ? 'aborted' : 'activated',
    confirmedCheckpoint: receipt.checkpoint,
  });
}
