import type * as C from '../../../src/features/campaign-session-references/model/sessionReference';
import type * as S from '../../../src/features/campaign-session-references/model/sessionSceneReference';
import { fixtureCampaignBaseSessionSnapshot, readCampaignBaseImage } from './campaignBaseFixture';
import {
  fixtureAssertCampaignWritable,
  fixtureCampaignDeletionReservation,
  fixtureCampaignToken,
  fixtureGet,
  fixtureOwner,
} from './studioStore';
import { getCampaignSession } from './campaignSessionFixture';
import {
  listCampaignLore,
  getCampaignLore,
  fixtureCampaignLoreAdoptionSnapshot,
} from './campaignLoreFixture';
import { FIXTURE_TIME } from './data';
interface Stored {
  schemaVersion: 1;
  ownerId: string;
  campaignId: string;
  campaignToken: string;
  sessionId: string;
  id: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
  target?: { kind: 'lore' | 'scene'; sourceKey: string };
}
interface Control {
  token: string;
  revision: number;
}
interface Operation {
  ownerId: string;
  campaignId: string;
  token: string;
  sessionId: string;
  fingerprint: string;
  result: C.SessionReferenceOutcome;
}
interface Fence {
  ownerId: string;
  campaignId: string;
  token: string;
  sessionId: string;
  fingerprint: string;
}
interface Call {
  uid: string;
  campaignId: string;
  method: string;
  sessionId: string;
  operationId?: string;
  referenceId?: string;
  action?: 'add' | 'remove';
  intent?: string;
}
interface Data {
  rows: Record<string, Stored>;
  controls: Record<string, Control>;
  operations: Record<string, Operation>;
  fences: Record<string, Fence>;
  calls: Call[];
}
const storageKey = 'writer.visual.session-references';
const key = (...values: string[]) => JSON.stringify(values);
const read = (): Data =>
  JSON.parse(
    localStorage.getItem(storageKey) ??
      '{"rows":{},"controls":{},"operations":{},"fences":{},"calls":[]}',
  ) as Data;
const persist = (data: Data) => localStorage.setItem(storageKey, JSON.stringify(data));
function fail(message: string, reason?: string, code = 'failed-precondition'): never {
  throw Object.assign(new Error(message), {
    code: 'functions/' + code,
    ...(reason ? { details: { reason } } : {}),
  });
}
function stable(value: unknown): string {
  const canonical = (item: unknown): unknown =>
    item && typeof item === 'object'
      ? Array.isArray(item)
        ? item.map(canonical)
        : Object.fromEntries(
            Object.entries(item)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([name, entry]) => [name, canonical(entry)]),
          )
      : item;
  return JSON.stringify(canonical(value));
}
function hash(value: unknown): string {
  let result = 2166136261;
  for (const char of stable(value)) result = Math.imul(result ^ char.codePointAt(0)!, 16777619);
  return (result >>> 0).toString(16).padStart(8, '0').repeat(8);
}
function budget<T>(value: T): T {
  if (new TextEncoder().encode(JSON.stringify(value)).length > 4 * 1024 * 1024)
    fail('Resposta acima do orçamento.');
  return structuredClone(value);
}
function assertWritable(campaignId: string, uid: string) {
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
async function campaignGate(uid: string, scope: C.SessionReferenceScope) {
  assertWritable(scope.campaignId, uid);
  const campaign = await fixtureGet('campaign', scope.campaignId);
  if (!campaign || campaign.ownerId !== uid) fail('Campanha indisponível.', undefined, 'not-found');
  if (campaign.schemaVersion !== 1) fail('Versão da campanha não suportada.');
  if (fixtureCampaignToken(uid, scope.campaignId) !== scope.campaignToken)
    fail('A campanha mudou.', 'campaign-changed');
  return campaign;
}
async function sessionGate(uid: string, scope: C.SessionReferenceScope) {
  await campaignGate(uid, scope);
  const result = await getCampaignSession({
    campaignId: scope.campaignId,
    campaignToken: scope.campaignToken,
    sessionId: scope.sessionId,
  });
  if (!result.session) fail('Sessão indisponível.', 'session-unavailable', 'not-found');
  if (result.session.revision !== scope.expectedSessionRevision)
    fail('A sessão mudou. Consulte a preparação atual.', 'revision-conflict');
  return result.session;
}
function control(data: Data, uid: string, scope: C.SessionReferenceScope): Control {
  const current = data.controls[key(uid, scope.campaignId, scope.sessionId)];
  if (
    !current &&
    Object.values(data.rows).some(
      (row) =>
        row.ownerId === uid &&
        row.campaignId === scope.campaignId &&
        row.sessionId === scope.sessionId,
    )
  )
    fail('Controle dos vínculos inconsistente.');
  if (
    current &&
    (current.token !== scope.campaignToken ||
      !Number.isSafeInteger(current.revision) ||
      current.revision < 0)
  )
    fail('Controle dos vínculos inconsistente.');
  return current ?? { token: scope.campaignToken, revision: 0 };
}
const envelope = (
  uid: string,
  scope: C.SessionReferenceScope,
  current: Control,
): C.SessionReferenceEnvelope => ({
  schemaVersion: 1,
  ownerId: uid,
  campaignId: scope.campaignId,
  campaignToken: scope.campaignToken,
  sessionId: scope.sessionId,
  sessionRevision: scope.expectedSessionRevision,
  referenceCollectionRevision: current.revision,
});
async function source(
  uid: string,
  scope: C.SessionReferenceScope,
): Promise<C.SessionReferenceSourceContext | null> {
  const campaign = await campaignGate(uid, scope);
  if (campaign.provenance.kind === 'independent') return null;
  if (
    campaign.provenance.kind !== 'original' ||
    !campaign.activeBaseId ||
    campaign.activeBaseId !== campaign.provenance.baseId
  )
    fail('Base da campanha inconsistente.');
  const adventure = await fixtureGet('adventure', campaign.provenance.adventureId);
  if (!adventure) return null;
  if (adventure.ownerId !== uid) fail('Origem indisponível.', undefined, 'not-found');
  if (adventure.schemaVersion !== 1) fail('Versão da aventura não suportada.');
  if ('deleting' in adventure && adventure.deleting) return null;
  const page = await listCampaignLore({
    campaignId: scope.campaignId,
    campaignToken: scope.campaignToken,
    baseId: campaign.activeBaseId,
    limit: 1,
  });
  return { baseId: page.baseId, projectionToken: page.projectionToken };
}
function observeSource(
  actual: C.SessionReferenceSourceContext | null,
  expected: C.SessionReferenceSourceContext,
) {
  if (actual && stable(actual) !== stable(expected))
    fail('A projeção mudou. Consulte os vínculos atuais.', 'source-context-changed');
}
async function candidate(
  scope: C.SessionReferenceScope,
  context: C.SessionReferenceSourceContext,
  sourceKey: string,
): Promise<C.SessionLoreCandidate | null> {
  const snapshot = await fixtureCampaignLoreAdoptionSnapshot(scope.campaignId, context.baseId),
    row = snapshot.items.find((item) => item.sourceKey === sourceKey);
  if (!row?.available || row.inactive || row.mode === 'removed') return null;
  if (!row.name || !row.category) fail('Metadados da ficha inconsistentes.');
  return {
    sourceKey,
    name: row.name,
    category: row.category as C.SessionLoreCandidate['category'],
    revision: row.revision,
    mode: row.mode === 'override' ? 'override' : 'base',
    legacy: row.legacy,
  };
}
async function transaction<T>(
  uid: string,
  scope: C.SessionReferenceScope,
  method: string,
  detail: Partial<Call>,
  work: (data: Data) => T | Promise<T>,
): Promise<T> {
  await campaignGate(uid, scope);
  const run = async () => {
    assertWritable(scope.campaignId, uid);
    const data = read();
    data.calls.push({
      uid,
      campaignId: scope.campaignId,
      sessionId: scope.sessionId,
      method,
      ...detail,
    });
    persist(data);
    return budget(await work(data));
  };
  // Transport fixture lock only. The browser product retains its own journal and Web Lock.
  return navigator.locks
    ? navigator.locks.request('writer.visual.reference-server:' + key(uid, scope.campaignId), run)
    : run();
}
async function response<T>(
  uid: string,
  scope: C.SessionReferenceScope,
  method: string,
  value: T,
): Promise<T> {
  const captured = budget(value);
  if (sessionStorage.getItem('writer.visual.reference-hold-response') === method) {
    const data = read();
    data.calls.push({
      uid,
      campaignId: scope.campaignId,
      sessionId: scope.sessionId,
      method: 'held:' + method,
    });
    persist(data);
    await new Promise<void>((resolve) =>
      window.addEventListener('writer.visual.release-reference', () => resolve(), { once: true }),
    );
  }
  if (sessionStorage.getItem('writer.visual.reference-lost-response') === method) {
    sessionStorage.removeItem('writer.visual.reference-lost-response');
    fail('A resposta se perdeu. Confirme ou encerre o mesmo pedido.', undefined, 'unavailable');
  }
  return captured;
}
function beforeReceive(method: string) {
  if (sessionStorage.getItem('writer.visual.reference-before-receive') === method) {
    sessionStorage.removeItem('writer.visual.reference-before-receive');
    fail('Não foi possível enviar. O pedido foi preservado.', undefined, 'unavailable');
  }
}
interface Cursor {
  scope: unknown;
  last?: { id: string; createdAt: number };
  inner?: string;
  offset?: number;
}
function decode(value: string | undefined, expected: unknown): Cursor | null {
  if (!value) return null;
  let cursor: Cursor;
  try {
    cursor = JSON.parse(atob(value)) as Cursor;
  } catch {
    fail('Página inválida.', undefined, 'invalid-argument');
  }
  if (
    (cursor.offset !== undefined && (!Number.isSafeInteger(cursor.offset) || cursor.offset < 0)) ||
    stable(cursor.scope) !== stable(expected)
  )
    fail('Os vínculos ou sua projeção mudaram.', 'cursor-invalidated');
  return cursor;
}
const encode = (value: Cursor) => btoa(JSON.stringify(value));
export async function listCampaignSessionReferences(
  input: C.ListSessionReferencesInput,
): Promise<S.AnySessionReferencePage> {
  const uid = fixtureOwner(),
    size = input.limit ?? 25;
  if (!Number.isSafeInteger(size) || size < 1 || size > 50)
    fail('Página inválida.', undefined, 'invalid-argument');
  const value = await transaction(uid, input, 'listCampaignSessionReferences', {}, async (data) => {
    await sessionGate(uid, input);
    const current = control(data, uid, input),
      context = await source(uid, input);
    if (input.view === 'candidates') observeSource(context, input.sourceContext);
    const cursorScope = {
      uid,
      campaignId: input.campaignId,
      token: input.campaignToken,
      sessionId: input.sessionId,
      sessionRevision: input.expectedSessionRevision,
      referenceRevision: current.revision,
      view: input.view,
      kind: input.kind ?? 'lore',
      ...(input.view === 'candidates' && input.kind === 'scene'
        ? { archive: input.archive ?? 'active' }
        : {}),
      sourceContext: context,
    };
    const cursor = decode(input.cursor, cursorScope);
    if (input.view === 'candidates') {
      if (!context)
        return {
          ...envelope(uid, input, current),
          view: 'candidates' as const,
          sourceContext: null,
          items: [],
          nextCursor: null,
        };
      if (input.kind === 'scene') {
        const snapshot = await fixtureCampaignBaseSessionSnapshot(input.campaignId);
        const values = snapshot.items
          .filter(
            ({ item }) =>
              item.kind === 'scene' &&
              ((input.archive ?? 'active') === 'all' ||
                item.archived === (input.archive === 'archived')),
          )
          .sort(
            (a, b) =>
              a.item.orderKey.localeCompare(b.item.orderKey) ||
              a.item.sourceKey.localeCompare(b.item.sourceKey),
          );
        const offset = cursor?.offset ?? 0;
        return {
          ...envelope(uid, input, current),
          view: 'candidates' as const,
          sourceContext: context,
          items: values.slice(offset, offset + size).map(({ item }) => sceneMetadata(item)),
          nextCursor:
            offset + size < values.length
              ? encode({ scope: cursorScope, offset: offset + size })
              : null,
        };
      }
      const page = await listCampaignLore({
        campaignId: input.campaignId,
        campaignToken: input.campaignToken,
        baseId: context.baseId,
        limit: size,
        ...(cursor?.inner ? { cursor: cursor.inner } : {}),
      });
      return {
        ...envelope(uid, input, current),
        view: 'candidates' as const,
        sourceContext: context,
        items: page.items
          .filter((item) => item.mode !== 'removed')
          .map((item) => ({
            sourceKey: item.sourceKey,
            name: item.name,
            category: item.category,
            revision: item.revision,
            mode: item.mode === 'override' ? ('override' as const) : ('base' as const),
            legacy: item.legacy,
          })),
        nextCursor: page.nextCursor ? encode({ scope: cursorScope, inner: page.nextCursor }) : null,
      };
    }
    const rows = Object.values(data.rows)
      .filter(
        (row) =>
          row.ownerId === uid &&
          row.campaignId === input.campaignId &&
          row.sessionId === input.sessionId &&
          !row.deleted &&
          row.target?.kind === (input.kind ?? 'lore') &&
          (!cursor?.last ||
            row.createdAt > cursor.last.createdAt ||
            (row.createdAt === cursor.last.createdAt && row.id > cursor.last.id)),
      )
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    const window = rows.slice(0, size),
      items: S.AnySessionReferenceRow[] = [];
    for (const row of window) {
      const target =
        context && row.target
          ? row.target.kind === 'scene'
            ? await sceneCandidate(input, row.target.sourceKey)
            : await candidate(input, context, row.target.sourceKey)
          : null;
      const metadata = {
        id: row.id,
        revision: row.revision,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
      if (!target) items.push({ ...metadata, available: false });
      else if ('kind' in target) items.push({ ...metadata, available: true, target });
      else items.push({ ...metadata, available: true, target: { ...target, kind: 'lore' } });
    }
    const last = window.at(-1);
    const common = {
      ...envelope(uid, input, current),
      view: 'references' as const,
      sourceContext: context,
      nextCursor:
        rows.length > size && last
          ? encode({ scope: cursorScope, last: { id: last.id, createdAt: last.createdAt } })
          : null,
    };
    if (input.kind === 'scene')
      return {
        ...common,
        items: items.filter(
          (row): row is S.SessionSceneReferenceRow => !row.available || row.target.kind === 'scene',
        ),
      };
    return {
      ...common,
      items: items.filter(
        (row): row is C.SessionReferenceRow => !row.available || row.target.kind === 'lore',
      ),
    };
  });
  return response(uid, input, 'listCampaignSessionReferences', value);
}
export async function readCampaignSessionLoreReference(
  input: C.ReadSessionLoreReferenceInput,
): Promise<C.SessionLoreReferenceResult> {
  const uid = fixtureOwner();
  const value = await transaction(
    uid,
    input,
    'readCampaignSessionLoreReference',
    { referenceId: input.referenceId },
    async (data) => {
      await sessionGate(uid, input);
      const current = control(data, uid, input),
        row = data.rows[key(uid, input.campaignId, input.referenceId)];
      if (!row || row.sessionId !== input.sessionId || row.deleted)
        fail('Vínculo indisponível.', undefined, 'not-found');
      if (
        row.revision !== input.expectedRevision ||
        current.revision !== input.expectedReferenceCollectionRevision
      )
        fail('O vínculo mudou.', 'revision-conflict');
      if (row.target?.kind !== 'lore')
        fail('Tipo de vínculo inválido.', undefined, 'invalid-argument');
      const context = await source(uid, input);
      observeSource(context, input.sourceContext);
      let material: C.SessionLoreMaterial | null = null;
      const metadata =
        context && row.target ? await candidate(input, context, row.target.sourceKey) : null;
      if (context && metadata) {
        const body = await getCampaignLore({
          campaignId: input.campaignId,
          campaignToken: input.campaignToken,
          baseId: context.baseId,
          sourceKey: metadata.sourceKey,
        });
        if (body.item?.entity && body.item.mode !== 'removed')
          material = {
            kind: 'lore',
            sourceKey: metadata.sourceKey,
            revision: metadata.revision,
            mode: metadata.mode,
            legacy: metadata.legacy,
            entity: structuredClone(body.item.entity),
          };
      }
      return {
        ...envelope(uid, input, current),
        referenceId: row.id,
        referenceRevision: row.revision,
        sourceContext: context,
        material,
      };
    },
  );
  return response(uid, input, 'readCampaignSessionLoreReference', value);
}

type CapturedScene = Awaited<
  ReturnType<typeof fixtureCampaignBaseSessionSnapshot>
>['items'][number];
function sceneMetadata(item: CapturedScene['item']): S.SessionSceneCandidate {
  return {
    kind: 'scene',
    sourceKey: item.sourceKey,
    title: item.title,
    stage: item.stage ?? null,
    archived: item.archived,
  };
}
async function sceneCandidate(
  scope: C.SessionReferenceScope,
  sourceKey: string,
): Promise<S.SessionSceneCandidate | null> {
  const snapshot = await fixtureCampaignBaseSessionSnapshot(scope.campaignId);
  const item = snapshot.items.find(
    ({ item }) => item.kind === 'scene' && item.sourceKey === sourceKey,
  )?.item;
  return item ? sceneMetadata(item) : null;
}
function sceneBlock(
  item: CapturedScene['item'],
  scene: CapturedScene['item'],
): S.SessionSceneBlockSummary {
  if (
    item.kind !== 'block' ||
    item.parentKey !== scene.sourceKey ||
    !item.role ||
    !item.type ||
    !item.audience
  )
    fail('Bloco capturado inconsistente.');
  const ownArchived = item.role === 'main' ? null : item.structured.ownArchived;
  if (
    (item.role === 'additional' && typeof ownArchived !== 'boolean') ||
    item.archived !== (scene.archived || ownArchived === true)
  )
    fail('Arquivo do bloco capturado inconsistente.');
  return {
    kind: 'block',
    sourceKey: item.sourceKey,
    parentKey: scene.sourceKey,
    title: item.title,
    orderKey: item.orderKey,
    type: item.type as S.SessionSceneNarrativeType,
    audience: item.audience,
    role: item.role,
    archived: item.archived,
    ownArchived: ownArchived ?? null,
  };
}
async function sceneAccess(data: Data, uid: string, input: S.SessionSceneReadScope) {
  await sessionGate(uid, input);
  const current = control(data, uid, input),
    row = data.rows[key(uid, input.campaignId, input.referenceId)];
  if (!row || row.deleted || row.sessionId !== input.sessionId)
    fail('Vínculo indisponível.', undefined, 'not-found');
  if (row.target?.kind !== 'scene')
    fail('Tipo de vínculo inválido.', undefined, 'invalid-argument');
  if (
    row.revision !== input.expectedRevision ||
    current.revision !== input.expectedReferenceCollectionRevision
  )
    fail('O vínculo mudou.', 'revision-conflict');
  const context = await source(uid, input);
  observeSource(context, input.sourceContext);
  const snapshot = context ? await fixtureCampaignBaseSessionSnapshot(input.campaignId) : null;
  const scene =
    snapshot?.items.find(
      ({ item }) => item.kind === 'scene' && item.sourceKey === row.target?.sourceKey,
    ) ?? null;
  return {
    current,
    row,
    context,
    snapshot,
    scene,
    header: {
      ...envelope(uid, input, current),
      referenceId: row.id,
      referenceRevision: row.revision,
      sourceContext: context,
    },
  };
}
function fixtureChunks(text: string): string[] {
  const bytes = new TextEncoder().encode(text),
    chunks: string[] = [];
  for (let offset = 0; offset < bytes.length;) {
    let end = Math.min(bytes.length, offset + 65536);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    chunks.push(new TextDecoder('utf-8', { fatal: true }).decode(bytes.slice(offset, end)));
    offset = end;
  }
  return chunks.length ? chunks : [''];
}
export async function listCampaignSessionSceneBlocks(
  input: S.ListSessionSceneBlocksInput,
): Promise<S.SessionSceneBlocksPage> {
  const uid = fixtureOwner(),
    method = 'listCampaignSessionSceneBlocks',
    size = input.limit ?? 25;
  if (!Number.isInteger(size) || size < 1 || size > 50)
    fail('Página inválida.', undefined, 'invalid-argument');
  const value = await transaction(
    uid,
    input,
    method,
    { referenceId: input.referenceId },
    async (data) => {
      const access = await sceneAccess(data, uid, input);
      if (!access.scene) return { ...access.header, scene: null, items: [], nextCursor: null };
      const scope = {
        ...access.header,
        kind: 'blocks',
        sceneKey: access.scene.item.sourceKey,
        archive: input.archive ?? 'active',
      };
      const offset = decode(input.cursor, scope)?.offset ?? 0;
      const values = access
        .snapshot!.items.filter(
          ({ item }) => item.kind === 'block' && item.parentKey === access.scene!.item.sourceKey,
        )
        .map(({ item }) => sceneBlock(item, access.scene!.item))
        .filter(
          (item) =>
            (input.archive ?? 'active') === 'all' ||
            item.archived === (input.archive === 'archived'),
        )
        .sort(
          (a, b) => a.orderKey.localeCompare(b.orderKey) || a.sourceKey.localeCompare(b.sourceKey),
        );
      return {
        ...access.header,
        scene: sceneMetadata(access.scene.item),
        items: values.slice(offset, offset + size),
        nextCursor: offset + size < values.length ? encode({ scope, offset: offset + size }) : null,
      };
    },
  );
  return response(uid, input, method, value);
}
export async function readCampaignSessionSceneReference(
  input: S.ReadSessionSceneInput,
): Promise<S.SessionSceneReadWindow> {
  const uid = fixtureOwner(),
    method = 'readCampaignSessionSceneReference',
    size = input.limit ?? 4;
  if (!Number.isInteger(size) || size < 1 || size > 8)
    fail('Página inválida.', undefined, 'invalid-argument');
  const value = await transaction(
    uid,
    input,
    method,
    { referenceId: input.referenceId },
    async (data) => {
      const access = await sceneAccess(data, uid, input),
        resourceKind = input.blockKey ? ('block' as const) : ('scene-plan' as const);
      const neutral = {
        ...access.header,
        blockKey: input.blockKey ?? null,
        resourceKind,
        resourceKey: null,
        material: null,
      };
      if (!access.scene) return neutral;
      const selected = input.blockKey
        ? access.snapshot!.items.find(
            ({ item }) => item.kind === 'block' && item.sourceKey === input.blockKey,
          )
        : access.scene;
      if (!selected) return neutral;
      if (input.blockKey) sceneBlock(selected.item, access.scene.item);
      const names = input.blockKey ? ['content'] : ['objective', 'conflict', 'pointOfView'];
      const fields = selected.item.fields.filter((field) => names.includes(field.field));
      const item: S.SessionSceneProjectedItem = input.blockKey
        ? {
            ...sceneBlock(selected.item, access.scene.item),
            fields,
            image: structuredClone(selected.item.image),
          }
        : {
            kind: 'scene-plan',
            sourceKey: selected.item.sourceKey,
            title: selected.item.title,
            stage: selected.item.stage ?? null,
            archived: selected.item.archived,
            fields,
          };
      const chunks = fields.flatMap(({ field }) =>
        fixtureChunks(selected.texts[field] ?? '').map((content, index) => ({
          field,
          index,
          content,
        })),
      );
      const scope = {
        ...access.header,
        kind: resourceKind,
        blockKey: input.blockKey ?? null,
        resourceKey: item.sourceKey,
      };
      const offset = decode(input.cursor, scope)?.offset ?? 0;
      return {
        ...access.header,
        blockKey: input.blockKey ?? null,
        resourceKind,
        resourceKey: item.sourceKey,
        material: {
          item,
          chunks: chunks.slice(offset, offset + size),
          nextCursor:
            offset + size < chunks.length ? encode({ scope, offset: offset + size }) : null,
        },
      };
    },
  );
  return response(uid, input, method, value);
}
export async function readCampaignSessionSceneImage(
  input: S.ReadSessionSceneImageInput,
): Promise<S.SessionSceneImage> {
  const uid = fixtureOwner(),
    method = 'readCampaignSessionSceneImage';
  const authorize = () =>
    transaction(uid, input, method, { referenceId: input.referenceId }, async (data) => {
      const access = await sceneAccess(data, uid, input);
      const selected = access.scene
        ? access.snapshot!.items.find(
            ({ item }) => item.kind === 'block' && item.sourceKey === input.blockKey,
          )
        : null;
      if (selected) sceneBlock(selected.item, access.scene!.item);
      return { header: access.header, image: selected?.item.image ?? null };
    });
  const before = await authorize();
  let dataUrl: string | null = null;
  if (before.image)
    dataUrl = (
      await readCampaignBaseImage({ campaignId: input.campaignId, imageKey: before.image.imageKey })
    ).dataUrl;
  const captured = await response(uid, input, method, {
    ...before.header,
    blockKey: input.blockKey,
    imageKey: before.image?.imageKey ?? null,
    dataUrl,
  });
  // Held transport simulates I/O; repeat the real fixture gates before returning bytes.
  const after = await authorize();
  if (stable(after) !== stable(before)) fail('A projeção mudou.', 'source-context-changed');
  return captured;
}
type Mutation = C.AddSessionReferenceInput | C.RemoveSessionReferenceInput;
function identity(uid: string, input: Mutation) {
  return {
    schemaVersion: 1 as const,
    ownerId: uid,
    campaignId: input.campaignId,
    campaignToken: input.campaignToken,
    sessionId: input.sessionId,
  };
}
function operationIdentity(
  previous: Operation | Fence,
  uid: string,
  input: Mutation,
  fingerprint: string,
) {
  if (
    previous.ownerId !== uid ||
    previous.campaignId !== input.campaignId ||
    previous.token !== input.campaignToken ||
    previous.sessionId !== input.sessionId ||
    previous.fingerprint !== fingerprint
  )
    fail('Operação usada com outro pedido.', undefined, 'invalid-argument');
}
function canceled(
  uid: string,
  action: 'add' | 'remove',
  input: Mutation,
): C.SessionReferenceOutcome {
  return action === 'add'
    ? {
        ...identity(uid, input),
        kind: 'canceled',
        action,
        request: input as C.AddSessionReferenceInput,
      }
    : {
        ...identity(uid, input),
        kind: 'canceled',
        action,
        request: input as C.RemoveSessionReferenceInput,
      };
}
async function mutate(
  input: Mutation,
  action: 'add' | 'remove',
): Promise<C.SessionReferenceOutcome> {
  const method =
      action === 'add' ? 'addCampaignSessionReference' : 'removeCampaignSessionReference',
    uid = fixtureOwner();
  beforeReceive(method);
  const value = await transaction(
    uid,
    input,
    method,
    { action, operationId: input.operationId, referenceId: input.referenceId },
    async (data) => {
      const fingerprint = hash({ action, input }),
        opKey = key(uid, input.operationId),
        previous = data.operations[opKey],
        fence = data.fences[opKey];
      if (previous) {
        operationIdentity(previous, uid, input, fingerprint);
        return previous.result;
      }
      if (fence) {
        operationIdentity(fence, uid, input, fingerprint);
        return canceled(uid, action, input);
      }
      await sessionGate(uid, input);
      const current = control(data, uid, input);
      if (current.revision !== input.expectedReferenceCollectionRevision)
        fail('Os vínculos mudaram. Consulte a lista atual.', 'revision-conflict');
      const rowKey = key(uid, input.campaignId, input.referenceId),
        old = data.rows[rowKey];
      if (action === 'add') {
        const added = input as C.AddSessionReferenceInput;
        if (added.referenceId !== added.operationId || old)
          fail('Identidade já utilizada.', undefined, 'already-exists');
        const context = await source(uid, input);
        observeSource(context, added.sourceContext);
        if (
          !context ||
          !(added.target.kind === 'scene'
            ? await sceneCandidate(input, added.target.sourceKey)
            : await candidate(input, context, added.target.sourceKey))
        )
          fail('Material indisponível.', undefined, 'not-found');
        if (
          Object.values(data.rows).some(
            (row) =>
              row.ownerId === uid &&
              row.campaignId === input.campaignId &&
              row.sessionId === input.sessionId &&
              !row.deleted &&
              row.target?.kind === added.target.kind &&
              row.target.sourceKey === added.target.sourceKey,
          )
        )
          fail('Esta ficha já está vinculada.', 'reference-already-linked');
      } else if (!old || old.deleted || old.sessionId !== input.sessionId)
        fail('Vínculo indisponível.', undefined, 'not-found');
      if (
        action === 'remove' &&
        old.revision !== (input as C.RemoveSessionReferenceInput).expectedRevision
      )
        fail('O vínculo mudou.', 'revision-conflict');
      const revision = action === 'add' ? 1 : old.revision + 1,
        collectionRevision = current.revision + 1;
      const row: Stored = {
        schemaVersion: 1,
        ownerId: uid,
        campaignId: input.campaignId,
        campaignToken: input.campaignToken,
        sessionId: input.sessionId,
        id: input.referenceId,
        revision,
        createdAt: old?.createdAt ?? FIXTURE_TIME + collectionRevision,
        updatedAt: FIXTURE_TIME + collectionRevision,
        deleted: action === 'remove',
        ...(action === 'add' ? { target: (input as C.AddSessionReferenceInput).target } : {}),
      };
      data.rows[rowKey] = row;
      data.controls[key(uid, input.campaignId, input.sessionId)] = {
        token: input.campaignToken,
        revision: collectionRevision,
      };
      const result: C.SessionReferenceOutcome = {
        ...identity(uid, input),
        kind: 'confirmed',
        receipt: {
          operationId: input.operationId,
          action,
          referenceId: input.referenceId,
          sessionId: input.sessionId,
          expectedSessionRevision: input.expectedSessionRevision,
          expectedReferenceCollectionRevision: input.expectedReferenceCollectionRevision,
          revision,
          referenceCollectionRevision: collectionRevision,
        },
      };
      data.operations[opKey] = {
        ownerId: uid,
        campaignId: input.campaignId,
        token: input.campaignToken,
        sessionId: input.sessionId,
        fingerprint,
        result,
      };
      persist(data);
      return result;
    },
  );
  return response(uid, input, method, value);
}
export const addCampaignSessionReference = (input: C.AddSessionReferenceInput) =>
  mutate(input, 'add');
export const removeCampaignSessionReference = (input: C.RemoveSessionReferenceInput) =>
  mutate(input, 'remove');
export async function resolveCampaignSessionReferenceOperation(
  input: C.ResolveSessionReferenceInput,
): Promise<C.SessionReferenceOutcome> {
  const uid = fixtureOwner(),
    method = 'resolveCampaignSessionReferenceOperation';
  beforeReceive(method);
  const value = await transaction(
    uid,
    input.request,
    method,
    {
      action: input.action,
      intent: input.intent,
      operationId: input.request.operationId,
      referenceId: input.request.referenceId,
    },
    (data) => {
      const request = input.request,
        fingerprint = hash({ action: input.action, input: request }),
        opKey = key(uid, request.operationId),
        previous = data.operations[opKey],
        fence = data.fences[opKey];
      if (previous) {
        operationIdentity(previous, uid, request, fingerprint);
        return previous.result;
      }
      if (fence) operationIdentity(fence, uid, request, fingerprint);
      else {
        data.fences[opKey] = {
          ownerId: uid,
          campaignId: request.campaignId,
          token: request.campaignToken,
          sessionId: request.sessionId,
          fingerprint,
        };
        persist(data);
      }
      return canceled(uid, input.action, request);
    },
  );
  return response(uid, input.request, method, value);
}
export function fixtureDeleteCampaignSessionReferences(uid: string, campaignId: string): void {
  if (uid !== fixtureOwner()) fail('A conta mudou.', undefined, 'permission-denied');
  const data = read();
  for (const [name, row] of Object.entries(data.rows))
    if (row.ownerId === uid && row.campaignId === campaignId) delete data.rows[name];
  for (const [name] of Object.entries(data.controls)) {
    const [owner, cid] = JSON.parse(name) as string[];
    if (owner === uid && cid === campaignId) delete data.controls[name];
  }
  for (const namespace of [data.operations, data.fences])
    for (const [name, row] of Object.entries(namespace))
      if (row.ownerId === uid && row.campaignId === campaignId) delete namespace[name];
  persist(data);
}

// Scenario construction uses the existing single-state writers/capture/adoption transports.
// It does not bypass the product UI under test or claim backend authorization evidence.
export async function fixtureSeedSessionReferences(paginated = true) {
  const worlds = await import('./universeService'),
    lore = await import('./loreService'),
    adventures = await import('./adventureService'),
    scenes = await import('./sceneService'),
    bases = await import('./campaignBaseFixture'),
    comparisons = await import('./campaignComparisonFixture'),
    adoptions = await import('./campaignAdoptionFixture'),
    variants = await import('./campaignLoreFixture'),
    sessions = await import('./campaignSessionFixture'),
    store = await import('./studioStore'),
    cryptoApi = await import('../../../src/features/campaign-lore/services/campaignLoreCrypto');
  const uid = fixtureOwner();
  const world = await worlds.createUniverse(
    { name: 'Universo das referências da sessão', description: 'Origem privada preservada' },
    'visual-session-reference-world',
  );
  const adventure = await adventures.createAdventure({
    operationId: 'visual-session-reference-adventure',
    title: 'Aventura das fichas da sessão',
    synopsis: 'SINOPSE ORIGINAL SEM CÓPIA',
    universeId: world.id,
  });
  const target = { kind: 'adventure' as const, id: adventure.id };
  const created = await scenes.createScene({
    target,
    parentId: null,
    operationId: 'visual-session-reference-scene',
    title: 'Cena da fonte',
    content: '<p>CORPO ORIGINAL DA CENA</p>',
  });
  const entities = [];
  for (let index = 0; index < (paginated ? 29 : 3); index++) {
    const entity = await lore.createLoreEntity(
      { kind: 'universe', id: world.id },
      {
        name: 'Ficha capturada ' + index,
        category: 'character',
        summary: 'Resumo autorizado ' + index,
        details: 'CORPO CONGELADO DA FICHA ' + index,
        aliases: ['Alias congelado ' + index],
        structuredDetails: {
          appearance: 'Aparência ' + index,
          personality: '',
          history: '',
          notes: '',
        },
      },
    );
    entities.push(entity);
    const scene = (await scenes.getScene({ target, sceneId: created.scene.id }))!;
    await scenes.setSceneReference({
      target,
      sceneId: scene.id,
      operationId: 'visual-session-reference-link-' + index,
      expectedRevision: scene.revision,
      reference: { kind: 'universe', scopeId: world.id, entityId: entity.id.split(':').at(-1)! },
    });
  }
  const source = await bases.getCampaignCaptureSource({ adventureId: adventure.id });
  let capture = await bases.startCampaignCapture({
    operationId: 'visual-session-reference-capture',
    adventureId: adventure.id,
    expectedSourceToken: source.sourceToken,
    title: 'Mesa das referências privadas',
    description: 'Descrição autoral da mesa',
    universeId: world.id,
  });
  for (let index = 0; capture.state === 'preparing' && index < 60; index++)
    capture = await bases.advanceCampaignCapture({
      captureId: capture.captureId,
      operationId: 'visual-session-reference-capture-' + index,
      expectedCheckpoint: capture.checkpoint,
    });
  if (capture.state !== 'prepared') throw new Error('Captura de referências incompleta.');
  const activated = await bases.activateCampaignCapture({
    captureId: capture.captureId,
    operationId: 'visual-session-reference-activate',
    expectedCheckpoint: capture.checkpoint,
  });
  if (activated.kind !== 'activated') throw new Error('Mesa da referência não ativada.');
  const campaign = activated.campaign;
  const originalRows = [];
  let cursor: string | undefined;
  do {
    const page = await variants.listCampaignLore({
      campaignId: campaign.id,
      baseId: campaign.activeBaseId!,
      ...(cursor ? { cursor } : {}),
      limit: 25,
    });
    originalRows.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  const legacy = originalRows.at(-1)!,
    override = originalRows.at(-2)!;
  const token = fixtureCampaignToken(uid, campaign.id),
    scope = { campaignId: campaign.id, campaignToken: token, baseId: campaign.activeBaseId! };
  for (const [row, name, details] of [
    [legacy, 'Guardiã legada da sessão', 'FICHA LEGADA INTEIRA 🐉\nCom espaços preservados  '],
    [override, 'Farol adaptado da sessão', 'FICHA EFETIVA ADAPTADA 🐉\nPreparação particular'],
  ] as const) {
    const current = await variants.getCampaignLore({ ...scope, sourceKey: row.sourceKey });
    if (!current.item?.entity) throw new Error('Ficha inicial indisponível.');
    const { relations, ...fields } = current.item.entity;
    const entity = {
      ...fields,
      name,
      details,
      aliases: ['Alias privado de ' + name],
      relations: relations.map(({ targetKey, relationType, description }) => ({
        targetKey,
        relationType,
        description,
      })),
    };
    const header = {
      ...scope,
      sourceKey: row.sourceKey,
      operationId: 'visual-session-reference-variant-' + row.sourceKey,
      expectedRevision: 0,
    };
    const operation = {
      schemaVersion: 1 as const,
      ownerId: uid,
      header,
      action: 'save' as const,
      relatedSourceKeys: [] as string[],
      phase: 'preparing' as const,
    };
    const prepared = await variants.prepareCampaignLoreVariant({
      ...header,
      relatedSourceKeys: [],
    });
    const sealed = await cryptoApi.sealLore(operation, entity, prepared.key);
    await variants.saveCampaignLoreVariant({
      ...header,
      relatedSourceKeys: [],
      sealed: cryptoApi.sealedRequest({ ...operation, ...sealed, phase: 'sealed' }),
    });
    await variants.resolveCampaignLoreOperation({
      ...header,
      relatedSourceKeys: [],
      action: 'save',
      intent: 'confirm',
    });
  }
  const legacyEntity = entities.find((entity) => entity.name === legacy.name)!;
  const scene = (await scenes.getScene({ target, sceneId: created.scene.id }))!;
  await scenes.setSceneReference({
    target,
    sceneId: scene.id,
    operationId: 'visual-session-reference-unlink-legacy',
    expectedRevision: scene.revision,
    reference: {
      kind: 'universe',
      scopeId: world.id,
      entityId: legacyEntity.id.split(':').at(-1)!,
    },
    remove: true,
  });
  const comparisonSource = await comparisons.getCampaignComparisonSource({
    campaignId: campaign.id,
    currentBaseId: scope.baseId,
  });
  if (!comparisonSource) throw new Error('Fonte de candidata indisponível.');
  const comparisonStart = await comparisons.startCampaignComparison({
    operationId: 'visual-session-reference-comparison',
    campaignId: campaign.id,
    campaignToken: token,
    currentBaseId: scope.baseId,
    expectedSourceToken: comparisonSource.sourceToken,
  });
  if ('kind' in comparisonStart) throw new Error('Candidata encerrada.');
  let comparison = comparisonStart.progress;
  for (let index = 0; comparison.state === 'preparing' && index < 60; index++)
    comparison = (
      await comparisons.advanceCampaignComparison({
        comparisonId: comparison.comparisonId,
        operationId: 'visual-session-reference-comparison-' + index,
        expectedCheckpoint: comparison.checkpoint,
      })
    ).progress;
  if (comparison.state !== 'ready') throw new Error('Candidata incompleta.');
  const currentLore = await variants.listCampaignLore(scope);
  const start = await adoptions.startCampaignAdoption({
    operationId: 'visual-session-reference-adoption',
    campaignId: campaign.id,
    campaignToken: token,
    comparisonId: comparison.comparisonId,
    currentBaseId: scope.baseId,
    candidateBaseId: comparison.candidateBaseId,
    expectedCollectionRevision: currentLore.collectionRevision,
  });
  if ('kind' in start) throw new Error('Adoção encerrada.');
  let adoption = start.progress;
  const decisions = [];
  let decisionCursor: string | undefined;
  do {
    const page = await adoptions.listCampaignAdoptionDecisions({
      adoptionId: adoption.adoptionId,
      ...(decisionCursor ? { cursor: decisionCursor } : {}),
    });
    decisions.push(...page.items);
    decisionCursor = page.nextCursor ?? undefined;
  } while (decisionCursor);
  for (const row of decisions.filter((row) => row.required))
    adoption = (
      await adoptions.decideCampaignAdoption({
        adoptionId: adoption.adoptionId,
        operationId: 'visual-session-reference-decision-' + row.sourceKey,
        expectedCheckpoint: adoption.checkpoint,
        sourceKey: row.sourceKey,
        expectedRevision: row.revision,
        choice: 'keep-local',
      })
    ).progress;
  adoption = (
    await adoptions.prepareCampaignAdoption({
      adoptionId: adoption.adoptionId,
      operationId: 'visual-session-reference-prepare',
      expectedCheckpoint: adoption.checkpoint,
    })
  ).progress;
  for (let index = 0; adoption.state === 'preparing' && index < 80; index++)
    adoption = (
      await adoptions.advanceCampaignAdoption({
        adoptionId: adoption.adoptionId,
        operationId: 'visual-session-reference-adoption-step-' + index,
        expectedCheckpoint: adoption.checkpoint,
      })
    ).progress;
  if (adoption.state !== 'ready') throw new Error('Adoção não ficou pronta.');
  const adopted = await adoptions.activateCampaignAdoption({
    adoptionId: adoption.adoptionId,
    operationId: 'visual-session-reference-adopt',
    expectedCheckpoint: adoption.checkpoint,
  });
  if (adopted.progress.state !== 'adopted') throw new Error('Candidata não adotada.');
  const authorText = '  Preparação própria da sessão 🐉\nEste texto não recebe prosa das fichas.  ';
  const sessionId = 'visual-session-reference-own-session';
  await sessions.saveCampaignSession({
    campaignId: campaign.id,
    campaignToken: token,
    sessionId,
    operationId: sessionId,
    expectedRevision: 0,
    title: 'Encontro com as fichas da mesa',
    summary: authorText,
    scheduledDate: '2026-10-18',
    status: 'planned',
  });
  const otherSessionId = 'visual-session-reference-other-session';
  await sessions.saveCampaignSession({
    campaignId: campaign.id,
    campaignToken: token,
    sessionId: otherSessionId,
    operationId: otherSessionId,
    expectedRevision: 0,
    title: 'Outra sessão preservada',
    summary: 'PREPARAÇÃO DA OUTRA SESSÃO',
    scheduledDate: null,
    status: 'planned',
  });
  const other = await store.fixtureCreate('campaign', {
    operationId: 'visual-session-reference-other-table',
    title: 'Outra mesa preservada',
    description: 'Outra campanha intacta',
  });
  return {
    campaignId: campaign.id,
    campaignToken: token,
    sessionId,
    sessionRevision: 1,
    otherSessionId,
    otherId: other.id,
    otherRoot: JSON.stringify(other),
    adventureId: adventure.id,
    worldId: world.id,
    legacyId: legacyEntity.id,
    legacyKey: legacy.sourceKey,
    legacyName: 'Guardiã legada da sessão',
    legacyDetails: 'FICHA LEGADA INTEIRA 🐉\nCom espaços preservados  ',
    overrideKey: override.sourceKey,
    overrideName: 'Farol adaptado da sessão',
    overrideDetails: 'FICHA EFETIVA ADAPTADA 🐉\nPreparação particular',
    authorText,
    sourceRoot: JSON.stringify(await store.fixtureGet('adventure', adventure.id)),
  };
}

export async function fixtureSeedSessionScenes(paginated = true) {
  const worlds = await import('./universeService'),
    lore = await import('./loreService'),
    adventures = await import('./adventureService'),
    scenes = await import('./sceneService'),
    blocks = await import('./adventureBlocksFixture'),
    bases = await import('./campaignBaseFixture'),
    sessions = await import('./campaignSessionFixture'),
    store = await import('./studioStore');
  const uid = fixtureOwner();
  const world = await worlds.createUniverse(
    { name: 'Universo das cenas privadas', description: 'Fonte capturada' },
    'visual-session-scene-world',
  );
  const adventure = await adventures.createAdventure({
    operationId: 'visual-session-scene-adventure',
    title: 'Aventura das cenas completas',
    synopsis: 'SINOPSE DA FONTE CONGELADA',
    universeId: world.id,
  });
  const target = { kind: 'adventure' as const, id: adventure.id };
  const mainText =
    '<p>PRINCIPAL CONGELADO 🐉 ' + 'Texto próprio da aventura. '.repeat(2800) + '</p>';
  const created = await scenes.createScene({
    target,
    parentId: null,
    operationId: 'visual-session-scene-origin',
    title: 'Travessia do farol',
    content: mainText,
    planning: {
      objective: 'Alcançar o farol',
      conflict: 'Maré e neblina 🐉',
      pointOfView: 'Tripulação',
    },
  });
  const createdBlocks = [];
  for (let n = 0; n < (paginated ? 28 : 3); n++)
    createdBlocks.push(
      await blocks.createAdventureBlock({
        adventureId: adventure.id,
        sceneId: created.scene.id,
        operationId: 'visual-session-scene-extra-' + n,
        title:
          n === 27
            ? 'Último bloco além da página'
            : n === 2
              ? 'Bloco guardado no Arquivo'
              : 'Bloco da travessia ' + n,
        content: '<p>ADICIONAL CONGELADO ' + n + ' 🐉</p>',
        audience: n % 3 === 0 ? 'creator' : n % 3 === 1 ? 'gm' : 'players',
      }),
    );
  await blocks.archiveAdventureBlock({
    adventureId: adventure.id,
    blockId: createdBlocks[2].block.resource.id,
    operationId: 'visual-session-scene-archive-block',
    expectedRevision: createdBlocks[2].block.revision,
    archived: true,
  });
  const current = await blocks.getAdventureBlock({
    adventureId: adventure.id,
    resource: { kind: 'scene', id: created.scene.id },
  });
  if (!current) throw new Error('Principal da fonte indisponível.');
  await blocks.moveAdventureBlock({
    adventureId: adventure.id,
    resource: { kind: 'scene', id: created.scene.id },
    operationId: 'visual-session-scene-main-down',
    expectedRevision: current.revision,
    expectedStructureRevision: current.structureRevision,
    direction: 'down',
  });
  const live = await scenes.getScene({ target, sceneId: created.scene.id });
  await blocks.setAdventureBlockImage({
    adventureId: adventure.id,
    resource: { kind: 'scene', id: created.scene.id },
    operationId: 'visual-session-scene-image',
    expectedRevision: live!.revision,
    image: {
      imageId: 'visual-image-000001',
      alt: 'Farol congelado na neblina',
      caption: 'Ilustração privada da aventura',
    },
  });
  const archived = await scenes.createScene({
    target,
    parentId: null,
    operationId: 'visual-session-scene-archived',
    title: 'Epílogo em Arquivo',
    content: '<p>CENA ARQUIVADA CONGELADA</p>',
  });
  await scenes.archiveScene({
    target,
    sceneId: archived.scene.id,
    operationId: 'visual-session-scene-archive-scene',
    expectedRevision: archived.scene.revision,
    archived: true,
  });
  const hero = await lore.createLoreEntity(
    { kind: 'universe', id: world.id },
    {
      name: 'Guardiã do farol',
      category: 'character',
      summary: 'Ficha ainda acessível',
      details: 'CORPO LORE PRESERVADO',
    },
  );
  const latest = await scenes.getScene({ target, sceneId: created.scene.id });
  await scenes.setSceneReference({
    target,
    sceneId: created.scene.id,
    operationId: 'visual-session-scene-lore-link',
    expectedRevision: latest!.revision,
    reference: { kind: 'universe', scopeId: world.id, entityId: hero.id.split(':').at(-1)! },
  });
  const source = await bases.getCampaignCaptureSource({ adventureId: adventure.id });
  let capture = await bases.startCampaignCapture({
    operationId: 'visual-session-scene-capture',
    adventureId: adventure.id,
    expectedSourceToken: source.sourceToken,
    title: 'Mesa das cenas privadas',
    description: 'Preparação particular',
    universeId: world.id,
  });
  for (let n = 0; capture.state === 'preparing' && n < 100; n++)
    capture = await bases.advanceCampaignCapture({
      captureId: capture.captureId,
      operationId: 'visual-session-scene-capture-' + n,
      expectedCheckpoint: capture.checkpoint,
    });
  if (capture.state !== 'prepared') throw new Error('Captura das cenas não terminou.');
  const activated = await bases.activateCampaignCapture({
    captureId: capture.captureId,
    operationId: 'visual-session-scene-activate',
    expectedCheckpoint: capture.checkpoint,
  });
  if (activated.kind !== 'activated') throw new Error('Mesa das cenas não ativada.');
  const campaign = activated.campaign,
    token = fixtureCampaignToken(uid, campaign.id),
    sessionId = 'visual-session-scene-own-preparation';
  const authorText = '  PREPARAÇÃO PRÓPRIA S1 🐉\nNão recebe os blocos da aventura.  ';
  await sessions.saveCampaignSession({
    campaignId: campaign.id,
    campaignToken: token,
    sessionId,
    operationId: sessionId,
    expectedRevision: 0,
    title: 'Preparar a travessia',
    summary: authorText,
    scheduledDate: '2026-10-18',
    status: 'planned',
  });
  const otherSessionId = 'visual-session-scene-other-preparation';
  await sessions.saveCampaignSession({
    campaignId: campaign.id,
    campaignToken: token,
    sessionId: otherSessionId,
    operationId: otherSessionId,
    expectedRevision: 0,
    title: 'Outra sessão preservada',
    summary: 'OUTRA PREPARAÇÃO INTACTA',
    scheduledDate: null,
    status: 'planned',
  });
  const other = await store.fixtureCreate('campaign', {
    operationId: 'visual-session-scene-other-table',
    title: 'Outra mesa de cenas',
    description: 'OUTRA MESA INTACTA',
  });
  const snapshot = await fixtureCampaignBaseSessionSnapshot(campaign.id);
  const sceneItem = snapshot.items.find(
    ({ item }) => item.kind === 'scene' && item.title === 'Travessia do farol',
  )!;
  const main = snapshot.items.find(
    ({ item }) =>
      item.kind === 'block' && item.parentKey === sceneItem.item.sourceKey && item.role === 'main',
  )!;
  const last = snapshot.items.find(({ item }) => item.title === 'Último bloco além da página');
  const lorePage = await listCampaignLore({
    campaignId: campaign.id,
    campaignToken: token,
    baseId: campaign.activeBaseId!,
  });
  // Edit the original after capture: the session must keep showing the frozen body.
  const beforeEdit = await scenes.getScene({ target, sceneId: created.scene.id });
  await scenes.updateScene({
    target,
    sceneId: created.scene.id,
    operationId: 'visual-session-scene-live-edited',
    expectedRevision: beforeEdit!.revision,
    patch: { content: '<p>ALTERAÇÃO VIVA NÃO ADOTADA</p>' },
  });
  return {
    campaignId: campaign.id,
    campaignToken: token,
    baseId: campaign.activeBaseId!,
    sessionId,
    sessionRevision: 1,
    otherSessionId,
    otherId: other.id,
    otherRoot: JSON.stringify(other),
    adventureId: adventure.id,
    worldId: world.id,
    sceneId: created.scene.id,
    sceneKey: sceneItem.item.sourceKey,
    sceneTitle: sceneItem.item.title,
    mainKey: main.item.sourceKey,
    mainText,
    lastKey: last?.item.sourceKey ?? null,
    lastTitle: last?.item.title ?? null,
    authorText,
    loreKey: lorePage.items[0].sourceKey,
    loreName: lorePage.items[0].name,
    sourceRoot: JSON.stringify(await store.fixtureGet('adventure', adventure.id)),
  };
}
export async function fixtureAdoptSessionSceneAbsence(campaignId: string, sceneId: string) {
  const store = await import('./studioStore'),
    scenes = await import('./sceneStore'),
    comparisons = await import('./campaignComparisonFixture'),
    adoptions = await import('./campaignAdoptionFixture');
  const campaign = await store.fixtureGet('campaign', campaignId);
  if (!campaign || campaign.provenance.kind !== 'original')
    throw new Error('Mesa capturada indisponível.');
  const target = { kind: 'adventure' as const, id: campaign.provenance.adventureId },
    state = await scenes.fixtureSceneState(target);
  // Controlled external source disappearance, not an additional product deletion API.
  const old = state.scenes[sceneId];
  delete state.scenes[sceneId];
  delete state.bodies[sceneId];
  delete state.planning[sceneId];
  delete state.references[sceneId];
  for (const [id, row] of Object.entries(state.adventureBlocks ?? {}))
    if (row.sceneId === sceneId) {
      delete state.adventureBlocks![id];
      delete state.adventureBlockBodies?.[id];
    }
  scenes.fixtureUpdateCounts(state, [old?.parentId ?? null], true);
  const token = fixtureCampaignToken(fixtureOwner(), campaignId),
    source = await comparisons.getCampaignComparisonSource({
      campaignId,
      currentBaseId: campaign.activeBaseId!,
    });
  if (!source) throw new Error('Fonte de comparação indisponível.');
  const started = await comparisons.startCampaignComparison({
    operationId: 'visual-session-scene-absent-candidate',
    campaignId,
    campaignToken: token,
    currentBaseId: campaign.activeBaseId!,
    expectedSourceToken: source.sourceToken,
  });
  if ('kind' in started) throw new Error('Comparação encerrada.');
  let comparison = started.progress;
  for (let n = 0; comparison.state === 'preparing' && n < 100; n++)
    comparison = (
      await comparisons.advanceCampaignComparison({
        comparisonId: comparison.comparisonId,
        operationId: 'visual-session-scene-candidate-' + n,
        expectedCheckpoint: comparison.checkpoint,
      })
    ).progress;
  if (comparison.state !== 'ready') throw new Error('Comparação não ficou pronta.');
  const lore = await listCampaignLore({
    campaignId,
    campaignToken: token,
    baseId: campaign.activeBaseId!,
  });
  const begin = await adoptions.startCampaignAdoption({
    operationId: 'visual-session-scene-absence-adoption',
    campaignId,
    campaignToken: token,
    comparisonId: comparison.comparisonId,
    currentBaseId: campaign.activeBaseId!,
    candidateBaseId: comparison.candidateBaseId,
    expectedCollectionRevision: lore.collectionRevision,
  });
  if ('kind' in begin) throw new Error('Adoção encerrada.');
  let adoption = (
    await adoptions.prepareCampaignAdoption({
      adoptionId: begin.progress.adoptionId,
      operationId: 'visual-session-scene-absence-prepare',
      expectedCheckpoint: begin.progress.checkpoint,
    })
  ).progress;
  for (let n = 0; adoption.state === 'preparing' && n < 100; n++)
    adoption = (
      await adoptions.advanceCampaignAdoption({
        adoptionId: adoption.adoptionId,
        operationId: 'visual-session-scene-absence-step-' + n,
        expectedCheckpoint: adoption.checkpoint,
      })
    ).progress;
  if (adoption.state !== 'ready') throw new Error('Adoção não ficou pronta.');
  return adoptions.activateCampaignAdoption({
    adoptionId: adoption.adoptionId,
    operationId: 'visual-session-scene-absence-activate',
    expectedCheckpoint: adoption.checkpoint,
  });
}
