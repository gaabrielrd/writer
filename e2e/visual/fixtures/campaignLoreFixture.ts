import type * as C from '../../../src/features/campaign-lore/model/campaignLore';
import { fixtureAssertCampaignWritable, fixtureCampaignToken, fixtureOwner } from './studioStore';
import { fixtureCampaignBaseLoreMetadata, readCampaignBaseItem } from './campaignBaseFixture';
import { FIXTURE_TIME } from './data';
import { fixtureCampaignComparisonCurrent } from './campaignBaseFixture';
import { getUniverse } from './universeService';
import { getLoreEntity } from './loreService';
import type * as R from '../../../src/features/campaign-lore/model/campaignLoreRemote';

type Anchor = {
  baseId: string;
  origin: { kind: string; id: string; scopeId?: string };
  entity: C.CampaignLoreEntityInput;
};
type Overlay = {
  legacy?: boolean;
  inactive?: boolean;
  revision: number;
  mode: C.CampaignLoreState['mode'];
  previousMode?: 'base' | 'override';
  createdAt: number;
  updatedAt: number;
  entity?: C.CampaignLoreEntityInput;
  entityHash?: string;
};
type Descriptor = C.CampaignLoreHeader & {
  action: C.CampaignLoreAction;
  relatedSourceKeys?: string[];
};
interface Operation {
  descriptor: Descriptor;
  state: 'prepared' | 'committed' | 'canceled';
  key?: string;
  closed?: boolean;
  fingerprint?: string;
  revision: number | null;
  confirmedHash?: string;
}
interface Project {
  token: string;
  baseId: string;
  revision: number;
  overlays: Record<string, Overlay>;
  anchors?: Record<string, Anchor>;
}
interface Call {
  uid: string;
  method: string;
  campaignId: string;
  sourceKey?: string;
  operationId?: string;
  expectedRevision?: number;
  intent?: string;
}
interface Data {
  projects: Record<string, Project>;
  guards?: Record<string, { adoptionId: string; baseId: string; epoch: number }>;
  guardEpochs?: Record<string, number>;
  operations: Record<string, Operation>;
  calls: Call[];
}
const storageKey = 'writer.visual.campaign-lore';
const scopeKey = (...values: string[]) => JSON.stringify(values);
const read = (): Data =>
  JSON.parse(
    localStorage.getItem(storageKey) ?? '{"projects":{},"operations":{},"calls":[]}',
  ) as Data;
const persist = (data: Data) => localStorage.setItem(storageKey, JSON.stringify(data));
function fail(message: string, code = 'failed-precondition', reason?: string): never {
  throw Object.assign(new Error(message), {
    code: 'functions/' + code,
    ...(reason ? { details: { reason } } : {}),
  });
}
const conflict = () =>
  fail('A ficha mudou. Confira o estado atual.', 'failed-precondition', 'revision-conflict');
function closed(value: unknown, keys: string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    fail('Campos inválidos.', 'invalid-argument');
}
function id(value: unknown): asserts value is string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.includes('/') ||
    ['.', '..'].includes(value) ||
    new TextEncoder().encode(value).length > 1500
  )
    fail('Identificador inválido.', 'invalid-argument');
}
function opaque(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    fail('Identidade inválida.', 'invalid-argument');
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
async function hash(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable(value)));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
function budget<T>(value: T): T {
  if (new TextEncoder().encode(JSON.stringify(value)).length > 4 * 1024 * 1024)
    fail('Resposta acima do orçamento.');
  return structuredClone(value);
}
const baseFields = ['campaignId', 'campaignToken', 'baseId'];
const headerFields = [...baseFields, 'sourceKey', 'operationId', 'expectedRevision'];
function checkHeader(input: C.CampaignLoreHeader) {
  id(input.campaignId);
  opaque(input.campaignToken);
  opaque(input.baseId);
  opaque(input.sourceKey);
  id(input.operationId);
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0)
    fail('Revisão inválida.', 'invalid-argument');
}
function related(input: C.CampaignLoreSaveHeader) {
  if (
    !Array.isArray(input.relatedSourceKeys) ||
    input.relatedSourceKeys.length > 50 ||
    stable(input.relatedSourceKeys) !== stable([...new Set(input.relatedSourceKeys)].sort())
  )
    fail('Alvos inválidos.', 'invalid-argument');
  input.relatedSourceKeys.forEach(opaque);
  if (input.relatedSourceKeys.includes(input.sourceKey))
    fail('A relação não pode apontar para a própria ficha.', 'invalid-argument');
}
function descriptor(
  input: C.CampaignLoreHeader,
  action: C.CampaignLoreAction,
  keys?: string[],
): Descriptor {
  return {
    campaignId: input.campaignId,
    campaignToken: input.campaignToken,
    baseId: input.baseId,
    sourceKey: input.sourceKey,
    operationId: input.operationId,
    expectedRevision: input.expectedRevision,
    action,
    ...(action === 'save' ? { relatedSourceKeys: keys } : {}),
  };
}
const current = (uid: string) => {
  if (fixtureOwner() !== uid) fail('A conta mudou.', 'permission-denied');
};
async function transaction<T>(
  uid: string,
  input: {
    campaignId: string;
    sourceKey?: string;
    operationId?: string;
    expectedRevision?: number;
    intent?: string;
  },
  method: string,
  work: (data: Data) => Promise<T> | T,
): Promise<T> {
  const run = async () => {
    current(uid);
    fixtureAssertCampaignWritable(input.campaignId, uid);
    const data = read();
    data.calls.push({
      uid,
      method,
      campaignId: input.campaignId,
      ...('sourceKey' in input ? { sourceKey: input.sourceKey } : {}),
      ...('operationId' in input ? { operationId: input.operationId } : {}),
      ...('expectedRevision' in input ? { expectedRevision: input.expectedRevision } : {}),
      ...('intent' in input ? { intent: input.intent } : {}),
    });
    persist(data);
    return work(data);
  };
  // Simulated server lock, distinct from the product's IndexedDB/Web Lock reservation.
  return navigator.locks
    ? navigator.locks.request('writer.visual.lore-server:' + scopeKey(uid, input.campaignId), run)
    : run();
}
async function context(
  data: Data,
  uid: string,
  input: { campaignId: string; campaignToken?: string; baseId: string },
) {
  fixtureAssertCampaignWritable(input.campaignId, uid);
  const meta = await fixtureCampaignBaseLoreMetadata(input.campaignId);
  current(uid);
  const token = fixtureCampaignToken(uid, input.campaignId);
  if (input.campaignToken !== undefined && input.campaignToken !== token)
    fail('A campanha mudou.', 'failed-precondition', 'campaign-changed');
  if (input.baseId !== meta.baseId) fail('A base mudou.', 'failed-precondition', 'base-changed');
  let project = data.projects[scopeKey(uid, input.campaignId)];
  if (!project) project = { token, baseId: meta.baseId, revision: 0, overlays: {} };
  if (project.token !== token) fail('A campanha mudou.', 'failed-precondition', 'campaign-changed');
  if (project.baseId !== meta.baseId) fail('A base mudou.', 'failed-precondition', 'base-changed');
  if (!Number.isSafeInteger(project.revision) || project.revision < 0)
    fail('Controle inconsistente.');
  const available = new Set(meta.availableSourceKeys);
  for (const [key, anchor] of Object.entries(project.anchors ?? {})) {
    const overlay = project.overlays[key];
    if (meta.items.some((item) => item.sourceKey === key) || !overlay?.legacy || overlay.inactive)
      continue;
    let authorized = false;
    try {
      const world = anchor.origin.scopeId ? await getUniverse(anchor.origin.scopeId) : null;
      authorized =
        world?.authorId === uid &&
        !!(await getLoreEntity(
          { kind: 'universe', id: anchor.origin.scopeId! },
          'universe:' + anchor.origin.scopeId + ':' + anchor.origin.id,
        ));
    } catch {
      /* Legacy authorization remains independent of the current universe. */
    }
    current(uid);
    if (authorized) available.add(key);
    meta.items.push({
      sourceKey: key,
      ...(authorized ? { name: anchor.entity.name, category: anchor.entity.category } : {}),
    });
  }
  const envelope: C.CampaignLoreEnvelope = {
    schemaVersion: 1,
    ownerId: uid,
    campaignId: input.campaignId,
    campaignToken: token,
    baseId: meta.baseId,
    collectionRevision: project.revision,
    projectionToken: await hash({
      uid,
      baseId: meta.baseId,
      token: meta.projectionToken,
      revision: project.revision,
      availableSourceKeys: [...available].sort(),
    }),
  };
  return { project, meta, envelope, available };
}
type Context = Awaited<ReturnType<typeof context>>;
function requireSource(ctx: Context, sourceKey: string) {
  if (
    !ctx.available.has(sourceKey) ||
    ctx.project.overlays[sourceKey]?.inactive ||
    !ctx.meta.items.some((item) => item.sourceKey === sourceKey)
  )
    fail('Ficha indisponível.', 'not-found');
}
function requireTargets(ctx: Context, input: C.CampaignLoreSaveHeader) {
  requireSource(ctx, input.sourceKey);
  for (const key of input.relatedSourceKeys) {
    requireSource(ctx, key);
    if (ctx.project.overlays[key]?.mode === 'removed') fail('Alvo indisponível.', 'not-found');
  }
}
async function baseEntity(
  campaignId: string,
  sourceKey: string,
): Promise<C.CampaignLoreEntityInput> {
  let page = await readCampaignBaseItem({ campaignId, sourceKey, limit: 50 });
  if (page.item.kind !== 'lore') fail('A ficha não é lore.');
  const item = page.item,
    fields: Record<string, string> = {};
  for (;;) {
    for (const chunk of page.chunks)
      fields[chunk.field] = (fields[chunk.field] ?? '') + chunk.content;
    if (!page.nextCursor) break;
    page = await readCampaignBaseItem({
      campaignId,
      sourceKey,
      limit: 50,
      cursor: page.nextCursor,
    });
  }
  const category = item.structured.category;
  if (!['character', 'location', 'concept', 'other'].includes(category ?? ''))
    fail('Categoria inconsistente.');
  return {
    name: item.title,
    aliases: item.structured.aliases ?? [],
    category: category as C.CampaignLoreCategory,
    summary: fields.summary ?? '',
    details: fields.details ?? '',
    structuredDetails: {
      appearance: fields.appearance ?? '',
      personality: fields.personality ?? '',
      history: fields.history ?? '',
      notes: fields.notes ?? '',
    },
    relations: (item.structured.relations ?? []).map(
      ({ targetKey, relationType, description }) => ({ targetKey, relationType, description }),
    ),
  };
}
function sourceName(ctx: Context, key: string) {
  if (!ctx.available.has(key) || ctx.project.overlays[key]?.mode === 'removed') return null;
  return (
    ctx.project.overlays[key]?.entity?.name ??
    ctx.meta.items.find((item) => item.sourceKey === key)?.name ??
    null
  );
}
async function view(ctx: Context, campaignId: string, key: string): Promise<C.CampaignLoreState> {
  const overlay = ctx.project.overlays[key];
  const common = {
    legacy: overlay?.legacy ?? false,
    sourceKey: key,
    revision: overlay?.revision ?? 0,
    mode: overlay?.mode ?? 'base',
    createdAt: overlay?.createdAt ?? null,
    updatedAt: overlay?.updatedAt ?? null,
  };
  if (overlay?.mode === 'removed') return { ...common, entity: null, entityHash: null };
  const entity =
    overlay?.mode === 'override'
      ? overlay.entity!
      : ((overlay?.legacy ? ctx.project.anchors?.[key]?.entity : null) ??
        (await baseEntity(campaignId, key)));
  const projected: C.CampaignLoreEntityView = {
    ...structuredClone(entity),
    relations: entity.relations.flatMap((relation) => {
      const name = sourceName(ctx, relation.targetKey);
      return name ? [{ ...relation, targetName: name }] : [];
    }),
  };
  return {
    ...common,
    entity: projected,
    entityHash: overlay?.mode === 'override' ? overlay.entityHash! : await hash(entity),
  };
}
const holds = new Map<string, Promise<void>>();
async function response<T>(
  uid: string,
  method: string,
  input: { operationId?: string },
  value: T,
): Promise<T> {
  const holdKey = 'writer.visual.campaign-lore-hold-response';
  if (sessionStorage.getItem(holdKey) === method) {
    sessionStorage.removeItem(holdKey);
    const key = scopeKey(uid, method, input.operationId ?? '');
    let wait = holds.get(key);
    if (!wait) {
      wait = new Promise<void>((resolve) =>
        window.addEventListener(
          'writer.visual.release-campaign-lore',
          () => {
            holds.delete(key);
            resolve();
          },
          { once: true },
        ),
      );
      holds.set(key, wait);
    }
    await wait;
  }
  if (sessionStorage.getItem('writer.visual.campaign-lore-lost-response') === method) {
    sessionStorage.removeItem('writer.visual.campaign-lore-lost-response');
    fail('A resposta se perdeu. Repita o mesmo pedido.', 'unavailable');
  }
  // A response retains its original request UID; the real controller must reject late identity.
  return budget(value);
}
function base64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}
function binary(value: string): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string') fail('Base64 inválido.', 'invalid-argument');
  let result: Uint8Array<ArrayBuffer>;
  try {
    result = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  } catch {
    fail('Base64 inválido.', 'invalid-argument');
  }
  if (base64(result) !== value) fail('Base64 não canônico.', 'invalid-argument');
  return result;
}
const aad = (uid: string, input: C.CampaignLoreSaveHeader) =>
  new TextEncoder().encode(
    JSON.stringify([
      1,
      uid,
      input.campaignId,
      input.campaignToken,
      input.baseId,
      input.sourceKey,
      input.operationId,
      input.expectedRevision,
      'save',
      input.relatedSourceKeys,
    ]),
  );
function entityInput(value: unknown, input: C.CampaignLoreSaveHeader): C.CampaignLoreEntityInput {
  const raw = value as C.CampaignLoreEntityInput;
  closed(raw, [
    'name',
    'aliases',
    'category',
    'summary',
    'details',
    'structuredDetails',
    'relations',
  ]);
  const string = (value: unknown, max: number, trim = false, required = false) => {
    if (
      typeof value !== 'string' ||
      value.length > max ||
      new TextDecoder().decode(new TextEncoder().encode(value)) !== value ||
      (required && !value.trim())
    )
      fail('Texto inválido.', 'invalid-argument');
    return trim ? value.trim() : value;
  };
  if (
    !Array.isArray(raw.aliases) ||
    raw.aliases.length > 20 ||
    !Array.isArray(raw.relations) ||
    raw.relations.length > 50 ||
    !['character', 'location', 'concept', 'other'].includes(raw.category)
  )
    fail('Ficha inválida.', 'invalid-argument');
  closed(raw.structuredDetails, ['appearance', 'personality', 'history', 'notes']);
  const result: C.CampaignLoreEntityInput = {
    name: string(raw.name, 200, true, true),
    summary: string(raw.summary, 140, true, true),
    category: raw.category,
    aliases: raw.aliases.map((alias) => string(alias, 200, true, true)),
    details: string(raw.details, 150000),
    structuredDetails: {
      appearance: string(raw.structuredDetails.appearance, 150000),
      personality: string(raw.structuredDetails.personality, 150000),
      history: string(raw.structuredDetails.history, 150000),
      notes: string(raw.structuredDetails.notes, 150000),
    },
    relations: raw.relations.map((relation) => {
      closed(relation, ['targetKey', 'relationType', 'description']);
      opaque(relation.targetKey);
      return {
        targetKey: relation.targetKey,
        relationType: string(relation.relationType, 200, true, true),
        description: string(relation.description, 4000),
      };
    }),
  };
  if (
    stable([...new Set(result.relations.map((relation) => relation.targetKey))].sort()) !==
    stable(input.relatedSourceKeys)
  )
    fail('Alvos não correspondem ao pedido.', 'invalid-argument');
  if (new TextEncoder().encode(JSON.stringify(result)).length > 900000)
    fail('Ficha acima do limite.', 'invalid-argument');
  return result;
}
function operationFor(
  data: Data,
  uid: string,
  input: C.CampaignLoreHeader,
  action: C.CampaignLoreAction,
  relatedKeys?: string[],
) {
  const desc = descriptor(input, action, relatedKeys),
    key = scopeKey(uid, input.operationId),
    previous = data.operations[key];
  if (previous && stable(previous.descriptor) !== stable(desc))
    fail('Operação usada com outros dados.', 'invalid-argument');
  return { desc, key, previous };
}
export async function listCampaignLore(
  input: C.ListCampaignLoreInput,
): Promise<C.CampaignLorePage> {
  closed(input, [...baseFields, 'view', 'cursor', 'limit']);
  id(input.campaignId);
  opaque(input.baseId);
  if (input.campaignToken !== undefined) opaque(input.campaignToken);
  const size = input.limit ?? 25,
    selected = input.view ?? 'active';
  if (!Number.isInteger(size) || size < 1 || size > 50 || !['active', 'removed'].includes(selected))
    fail('Página inválida.', 'invalid-argument');
  const uid = fixtureOwner();
  return transaction(uid, input, 'listCampaignLore', async (data) => {
    const ctx = await context(data, uid, input),
      scope = {
        uid,
        campaignId: input.campaignId,
        token: ctx.project.token,
        baseId: input.baseId,
        view: selected,
        projectionToken: ctx.envelope.projectionToken,
        revision: ctx.project.revision,
      };
    let last = '';
    if (input.cursor) {
      let cursor: { version: number; scope: unknown; last: string };
      try {
        cursor = JSON.parse(input.cursor) as typeof cursor;
      } catch {
        fail('Página inválida.', 'invalid-argument');
      }
      closed(cursor, ['version', 'scope', 'last']);
      if (cursor.version !== 1 || typeof cursor.last !== 'string')
        fail('Página inválida.', 'invalid-argument');
      if (stable(cursor.scope) !== stable(scope))
        fail('A lista mudou. Recarregue.', 'failed-precondition', 'cursor-invalidated');
      last = cursor.last;
    }
    const rows = ctx.meta.items
        .filter((item) => item.sourceKey > last)
        .sort((a, b) => a.sourceKey.localeCompare(b.sourceKey)),
      window = rows.slice(0, size),
      items: C.CampaignLoreSummary[] = [];
    for (const row of window) {
      if (!ctx.available.has(row.sourceKey) || ctx.project.overlays[row.sourceKey]?.inactive)
        continue;
      const overlay = ctx.project.overlays[row.sourceKey],
        mode = overlay?.mode ?? 'base';
      if ((selected === 'removed') !== (mode === 'removed')) continue;
      const entity = overlay?.entity,
        name = entity?.name ?? row.name,
        category = entity?.category ?? row.category;
      if (!name || !['character', 'location', 'concept', 'other'].includes(category ?? ''))
        fail('Metadados inconsistentes.');
      items.push({
        legacy: overlay?.legacy ?? false,
        sourceKey: row.sourceKey,
        revision: overlay?.revision ?? 0,
        mode,
        name,
        category: category as C.CampaignLoreCategory,
      });
    }
    return budget({
      ...ctx.envelope,
      items,
      nextCursor:
        rows.length > size
          ? JSON.stringify({ version: 1, scope, last: window.at(-1)!.sourceKey })
          : null,
    });
  });
}
export async function getCampaignLore(
  input: C.CampaignLoreScope & { sourceKey: string },
): Promise<C.CampaignLoreResult> {
  closed(input, [...baseFields, 'sourceKey']);
  id(input.campaignId);
  opaque(input.baseId);
  opaque(input.campaignToken);
  opaque(input.sourceKey);
  const uid = fixtureOwner();
  return transaction(uid, input, 'getCampaignLore', async (data) => {
    const ctx = await context(data, uid, input);
    return budget({
      ...ctx.envelope,
      item:
        ctx.available.has(input.sourceKey) &&
        !ctx.project.overlays[input.sourceKey]?.inactive &&
        ctx.meta.items.some((item) => item.sourceKey === input.sourceKey)
          ? await view(ctx, input.campaignId, input.sourceKey)
          : null,
    });
  });
}
export async function prepareCampaignLoreVariant(
  input: C.CampaignLoreSaveHeader,
): Promise<C.CampaignLorePrepared> {
  closed(input, [...headerFields, 'relatedSourceKeys']);
  checkHeader(input);
  related(input);
  const uid = fixtureOwner();
  const value = await transaction(uid, input, 'prepareCampaignLoreVariant', async (data) => {
    if (data.guards?.[scopeKey(uid, input.campaignId)])
      fail('A atualização está preparando o lore.', 'failed-precondition', 'adoption-in-progress');
    const ctx = await context(data, uid, input);
    requireTargets(ctx, input);
    const op = operationFor(data, uid, input, 'save', input.relatedSourceKeys);
    if (op.previous?.state === 'canceled')
      fail('Pedido cancelado.', 'failed-precondition', 'operation-canceled');
    if (op.previous?.closed) fail('Pedido encerrado.', 'failed-precondition', 'operation-canceled');
    if (!op.previous) {
      data.operations[op.key] = {
        descriptor: op.desc,
        state: 'prepared',
        revision: null,
        key: base64(crypto.getRandomValues(new Uint8Array(32))),
      };
      persist(data);
    }
    data.calls.push({
      uid,
      method: 'key-delivered',
      campaignId: input.campaignId,
      sourceKey: input.sourceKey,
      operationId: input.operationId,
    });
    persist(data);
    return {
      ...ctx.envelope,
      ...input,
      action: 'save' as const,
      algorithm: 'AES-GCM' as const,
      key: data.operations[op.key].key!,
    };
  });
  return response(uid, 'prepareCampaignLoreVariant', input, value);
}
async function mutate(
  input: C.CampaignLoreHeader | C.SaveCampaignLoreInput,
  action: C.CampaignLoreAction,
  method: string,
): Promise<C.CampaignLoreResult> {
  closed(input, [...headerFields, ...(action === 'save' ? ['relatedSourceKeys', 'sealed'] : [])]);
  checkHeader(input);
  const uid = fixtureOwner();
  if (action === 'save') related(input as C.SaveCampaignLoreInput);
  if (sessionStorage.getItem('writer.visual.campaign-lore-before-first-send') === method) {
    sessionStorage.removeItem('writer.visual.campaign-lore-before-first-send');
    fail('O transporte não recebeu o pedido.', 'unavailable');
  }
  const value = await transaction(uid, input, method, async (data) => {
    if (data.guards?.[scopeKey(uid, input.campaignId)])
      fail('A atualização está preparando o lore.', 'failed-precondition', 'adoption-in-progress');
    const ctx = await context(data, uid, input);
    requireSource(ctx, input.sourceKey);
    const save = input as C.SaveCampaignLoreInput;
    if (action === 'save') requireTargets(ctx, save);
    const op = operationFor(
        data,
        uid,
        input,
        action,
        action === 'save' ? save.relatedSourceKeys : undefined,
      ),
      old = ctx.project.overlays[input.sourceKey];
    if (op.previous?.state === 'canceled')
      fail('Pedido cancelado.', 'failed-precondition', 'operation-canceled');
    const fingerprint = await hash({
      descriptor: op.desc,
      ...(action === 'save' ? { sealed: save.sealed } : {}),
    });
    if (op.previous?.state === 'committed') {
      if (op.previous.fingerprint !== fingerprint)
        fail('Operação usada com outros bytes.', 'invalid-argument');
      if (
        !old ||
        old.revision !== op.previous.revision ||
        (await hash(old)) !== op.previous.confirmedHash
      )
        conflict();
      return { ...ctx.envelope, item: await view(ctx, input.campaignId, input.sourceKey) };
    }
    if ((old?.revision ?? 0) !== input.expectedRevision) conflict();
    let entity: C.CampaignLoreEntityInput | undefined;
    if (action === 'save') {
      if (!op.previous?.key || op.previous.closed) fail('Prepare o pedido antes de salvar.');
      closed(save.sealed, ['version', 'algorithm', 'nonce', 'ciphertext']);
      if (save.sealed.version !== 1 || save.sealed.algorithm !== 'AES-GCM')
        fail('Formato cifrado inválido.', 'invalid-argument');
      const nonce = binary(save.sealed.nonce),
        ciphertext = binary(save.sealed.ciphertext);
      if (nonce.length !== 12 || ciphertext.length > 900016 || ciphertext.length < 16)
        fail('Envelope cifrado inválido.', 'invalid-argument');
      const key = await crypto.subtle.importKey('raw', binary(op.previous.key), 'AES-GCM', false, [
        'decrypt',
      ]);
      let decoded: unknown;
      try {
        const plaintext = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: nonce, additionalData: aad(uid, save) },
          key,
          ciphertext,
        );
        decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
      } catch {
        fail('O pedido cifrado não pôde ser confirmado.', 'invalid-argument');
      }
      entity = entityInput(decoded, save);
      if (old?.mode === 'removed') fail('Restaure a ficha antes de editar.');
    } else if (action === 'remove' && old?.mode === 'removed') fail('A ficha já foi retirada.');
    else if (action === 'restore' && old?.mode !== 'removed') fail('A ficha não foi retirada.');
    else if (action === 'discard' && old?.mode !== 'override')
      fail('A ficha não tem variante para descartar.');
    const time = Math.max(FIXTURE_TIME + ctx.project.revision + 1, (old?.updatedAt ?? 0) + 1),
      overlay: Overlay = {
        legacy: old?.legacy ?? false,
        inactive: false,
        revision: (old?.revision ?? 0) + 1,
        mode:
          action === 'save'
            ? 'override'
            : action === 'remove'
              ? 'removed'
              : action === 'restore'
                ? old.previousMode!
                : 'base',
        createdAt: old?.createdAt ?? time,
        updatedAt: time,
      };
    if (action === 'save') {
      overlay.entity = entity;
      overlay.entityHash = await hash(entity);
    } else if (action === 'remove') {
      overlay.previousMode = old?.mode === 'override' ? 'override' : 'base';
      if (old?.entity) {
        overlay.entity = old.entity;
        overlay.entityHash = old.entityHash;
      }
    } else if (action === 'restore' && old?.previousMode === 'override') {
      overlay.entity = old.entity;
      overlay.entityHash = old.entityHash;
    }
    ctx.project.overlays[input.sourceKey] = overlay;
    ctx.project.revision++;
    data.projects[scopeKey(uid, input.campaignId)] = ctx.project;
    data.operations[op.key] = {
      ...op.previous,
      descriptor: op.desc,
      state: 'committed',
      revision: overlay.revision,
      fingerprint,
      confirmedHash: await hash(overlay),
    };
    persist(data);
    const fresh = await context(data, uid, input);
    return { ...fresh.envelope, item: await view(fresh, input.campaignId, input.sourceKey) };
  });
  return response(uid, method, input, value);
}
export const saveCampaignLoreVariant = (input: C.SaveCampaignLoreInput) =>
  mutate(input, 'save', 'saveCampaignLoreVariant');
export const removeCampaignLore = (input: C.CampaignLoreHeader) =>
  mutate(input, 'remove', 'removeCampaignLore');
export const restoreCampaignLore = (input: C.CampaignLoreHeader) =>
  mutate(input, 'restore', 'restoreCampaignLore');
export const discardCampaignLoreVariant = (input: C.CampaignLoreHeader) =>
  mutate(input, 'discard', 'discardCampaignLoreVariant');
export async function resolveCampaignLoreOperation(
  input: C.ResolveCampaignLoreInput,
): Promise<C.CampaignLoreResolution> {
  closed(input, [...headerFields, 'action', 'relatedSourceKeys', 'intent']);
  checkHeader(input);
  if (
    !['save', 'remove', 'restore', 'discard'].includes(input.action) ||
    !['confirm', 'cancel'].includes(input.intent)
  )
    fail('Resolução inválida.', 'invalid-argument');
  if (input.action === 'save') related(input as C.CampaignLoreSaveHeader);
  else if (input.relatedSourceKeys !== undefined)
    fail('Ação não recebe alvos.', 'invalid-argument');
  const uid = fixtureOwner();
  const value = await transaction(uid, input, 'resolveCampaignLoreOperation', (data) => {
    const op = operationFor(data, uid, input, input.action, input.relatedSourceKeys);
    if (input.intent === 'confirm' && (!op.previous || op.previous.state === 'prepared'))
      fail('Pedido ainda não confirmado.', 'failed-precondition', 'operation-unconfirmed');
    const operation: Operation = op.previous ?? {
      descriptor: op.desc,
      state: 'canceled',
      revision: null,
    };
    if (operation.state === 'prepared') operation.state = 'canceled';
    operation.closed = true;
    delete operation.key;
    data.operations[op.key] = operation;
    persist(data);
    return {
      ...op.desc,
      ownerId: uid,
      schemaVersion: 1 as const,
      state: operation.state,
      revision: operation.revision,
    };
  });
  return response(uid, 'resolveCampaignLoreOperation', input, value);
}

// Comparison transport only: authorized local state, without bodies or recovery material.
export async function fixtureCampaignLoreComparisonMetadata(campaignId: string, baseId: string) {
  const uid = fixtureOwner();
  const ctx = await context(read(), uid, { campaignId, baseId });
  return {
    collectionRevision: ctx.project.revision,
    items: Object.fromEntries(
      [...ctx.available].map((key) => [
        key,
        {
          mode: ctx.project.overlays[key]?.mode ?? 'base',
          revision: ctx.project.overlays[key]?.revision ?? 0,
        },
      ]),
    ),
  };
}

// Transport-only integration seams. They never inspect the product journal or its keys.
export async function fixtureCampaignLoreAdoptionSnapshot(campaignId: string, baseId: string) {
  const uid = fixtureOwner(),
    data = read(),
    ctx = await context(data, uid, { campaignId, baseId });
  const keys = new Set([
    ...ctx.meta.items.map((item) => item.sourceKey),
    ...Object.keys(ctx.project.overlays),
  ]);
  return {
    collectionRevision: ctx.project.revision,
    items: [...keys].sort().map((sourceKey) => {
      const overlay = ctx.project.overlays[sourceKey],
        row = ctx.meta.items.find((item) => item.sourceKey === sourceKey),
        available = ctx.available.has(sourceKey) && !overlay?.inactive;
      return {
        sourceKey,
        revision: overlay?.revision ?? 0,
        mode: overlay?.mode ?? 'base',
        legacy: overlay?.legacy ?? false,
        inactive: overlay?.inactive ?? false,
        available,
        hasLocal: !!overlay && (overlay.mode !== 'base' || !!overlay.legacy),
        ...(available
          ? {
              name: overlay?.entity?.name ?? row?.name,
              category: overlay?.entity?.category ?? row?.category,
            }
          : {}),
      };
    }),
  };
}
export async function fixtureCampaignLoreAdoptionGuard(
  campaignId: string,
  baseId: string,
  adoptionId: string,
  releaseEpoch?: number,
) {
  const uid = fixtureOwner();
  return transaction(uid, { campaignId }, 'fixture-admission', (data) => {
    const key = scopeKey(uid, campaignId);
    data.guards ??= {};
    data.guardEpochs ??= {};
    const old = data.guards[key];
    if (releaseEpoch !== undefined) {
      if (old?.adoptionId !== adoptionId || old.epoch !== releaseEpoch)
        fail('A reserva pertence a outra atualização.');
      delete data.guards[key];
      data.guardEpochs[key] = old.epoch + 1;
      persist(data);
      return old.epoch + 1;
    }
    if (old) {
      if (old.adoptionId !== adoptionId || old.baseId !== baseId) conflict();
      return old.epoch;
    }
    const epoch = (data.guardEpochs[key] ?? 0) + 1;
    data.guardEpochs[key] = epoch;
    data.guards[key] = { adoptionId, baseId, epoch };
    persist(data);
    return epoch;
  });
}
export async function fixtureCampaignLoreApplyAdoption(input: {
  campaignId: string;
  oldBaseId: string;
  baseId: string;
  expectedRevision: number;
  adoptionId: string;
  epoch: number;
  candidateKeys: string[];
  choices: Record<string, 'keep-local' | 'use-candidate' | 'discard-local'>;
}) {
  const uid = fixtureOwner(),
    data = read(),
    ctx = await context(data, uid, { campaignId: input.campaignId, baseId: input.oldBaseId }),
    key = scopeKey(uid, input.campaignId);
  if (
    ctx.project.revision !== input.expectedRevision ||
    data.guards?.[key]?.adoptionId !== input.adoptionId ||
    data.guards[key].epoch !== input.epoch
  )
    conflict();
  const frozen = await fixtureCampaignComparisonCurrent(input.campaignId);
  current(uid);
  const project = ctx.project;
  project.anchors ??= {};
  for (const [sourceKey, old] of Object.entries(project.overlays)) {
    const present = input.candidateKeys.includes(sourceKey),
      choice = input.choices[sourceKey],
      wasLegacy = old.legacy === true;
    if (
      !present &&
      choice === 'keep-local' &&
      ctx.available.has(sourceKey) &&
      !project.anchors[sourceKey]
    ) {
      const captured = frozen.snapshot.items.find((value) => value.item.sourceKey === sourceKey);
      if (!captured) fail('A âncora congelada não foi encontrada.');
      project.anchors[sourceKey] = {
        baseId: input.oldBaseId,
        origin: structuredClone(captured.origin),
        entity: await baseEntity(input.campaignId, sourceKey),
      };
    }
    if (choice === 'use-candidate' || choice === 'discard-local') {
      project.overlays[sourceKey] = {
        revision: old.revision + 1,
        mode: 'base',
        legacy: false,
        inactive: !present,
        createdAt: old.createdAt,
        updatedAt: old.updatedAt + 1,
      };
    } else {
      const legacy = !present && (choice === 'keep-local' || wasLegacy);
      project.overlays[sourceKey] = {
        ...old,
        revision: old.revision + 1,
        legacy,
        inactive: !present && !legacy,
        updatedAt: old.updatedAt + 1,
      };
    }
    if (present) delete project.anchors[sourceKey];
  }
  project.baseId = input.baseId;
  project.revision++;
  data.projects[key] = project;
  persist(data);
}
export async function fixtureCampaignLoreRemoteList(
  input: R.ListCampaignLoreOperationsInput,
): Promise<R.CampaignLoreOperationsPage> {
  const uid = fixtureOwner();
  fixtureAssertCampaignWritable(input.campaignId, uid);
  const data = read();
  const rows = Object.values(data.operations)
    .filter(
      (value) =>
        value.descriptor.campaignId === input.campaignId &&
        value.descriptor.campaignToken === input.campaignToken &&
        value.descriptor.baseId === input.baseId,
    )
    .sort((a, b) => a.descriptor.operationId.localeCompare(b.descriptor.operationId));
  const scope = stable({ uid, ...input, cursor: undefined }),
    last = input.cursor ? (JSON.parse(input.cursor) as { scope: string; last: string }) : null;
  if (last && last.scope !== scope) fail('A página mudou.');
  const window = rows
    .filter((value) => !last || value.descriptor.operationId > last.last)
    .slice(0, input.limit ?? 25);
  const items: R.CampaignLoreRemoteControl[] = [];
  for (const value of window) {
    if (value.closed || value.state === 'canceled') continue;
    items.push({
      operationId: value.descriptor.operationId,
      state: value.state,
      revision: value.revision,
      statusToken: await hash({
        descriptor: value.descriptor,
        state: value.state,
        closed: value.closed ?? false,
        revision: value.revision,
      }),
    });
  }
  current(uid);
  return {
    schemaVersion: 1,
    ownerId: uid,
    campaignId: input.campaignId,
    campaignToken: input.campaignToken,
    baseId: input.baseId,
    items,
    nextCursor:
      rows.some(
        (value) => value.descriptor.operationId > (window.at(-1)?.descriptor.operationId ?? ''),
      ) && window.length
        ? JSON.stringify({ scope, last: window.at(-1)!.descriptor.operationId })
        : null,
  };
}
export async function fixtureCampaignLoreRemoteResolve(
  input: R.ResolveCampaignLoreRemoteInput,
): Promise<R.CampaignLoreRemoteResolution> {
  const uid = fixtureOwner();
  return transaction(uid, input, 'resolveCampaignLoreRemoteOperation', async (data) => {
    const value = data.operations[scopeKey(uid, input.operationId)];
    if (
      !value ||
      value.descriptor.campaignId !== input.campaignId ||
      value.descriptor.campaignToken !== input.campaignToken ||
      value.descriptor.baseId !== input.baseId
    )
      fail('Pedido indisponível.', 'not-found');
    const token = await hash({
      descriptor: value.descriptor,
      state: value.state,
      closed: value.closed ?? false,
      revision: value.revision,
    });
    current(uid);
    if (
      token !== input.statusToken ||
      value.closed ||
      (input.intent === 'confirm' ? value.state !== 'committed' : value.state !== 'prepared')
    )
      return {
        schemaVersion: 1,
        ownerId: uid,
        request: structuredClone(input),
        outcome: 'rejected',
        state: null,
        reason: 'operation-changed',
        revision: null,
      };
    if (value.state === 'prepared') value.state = 'canceled';
    value.closed = true;
    delete value.key;
    persist(data);
    return {
      schemaVersion: 1,
      ownerId: uid,
      request: structuredClone(input),
      outcome: 'resolved',
      state: value.state === 'committed' ? 'confirmed' : 'canceled',
      reason: null,
      revision: value.revision,
    };
  });
}

export function fixtureDeleteCampaignLore(
  uid: string,
  campaignId: string,
  phase: 'recovery' | 'bodies',
): void {
  current(uid);
  const data = read();
  if (phase === 'recovery') {
    for (const [key, operation] of Object.entries(data.operations)) {
      if (
        key !== scopeKey(uid, operation.descriptor.operationId) ||
        operation.descriptor.campaignId !== campaignId
      )
        continue;
      delete data.operations[key];
    }
  } else {
    delete data.projects[scopeKey(uid, campaignId)];
    delete data.guards?.[scopeKey(uid, campaignId)];
    delete data.guardEpochs?.[scopeKey(uid, campaignId)];
  }
  persist(data);
}
