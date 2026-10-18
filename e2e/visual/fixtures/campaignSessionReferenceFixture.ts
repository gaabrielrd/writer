import type * as C from '../../../src/features/campaign-session-references/model/sessionReference';
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
  target?: { kind: 'lore'; sourceKey: string };
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
}
function decode(value: string | undefined, expected: unknown): Cursor | null {
  if (!value) return null;
  let cursor: Cursor;
  try {
    cursor = JSON.parse(atob(value)) as Cursor;
  } catch {
    fail('Página inválida.', undefined, 'invalid-argument');
  }
  if (stable(cursor.scope) !== stable(expected))
    fail('Os vínculos ou sua projeção mudaram.', 'cursor-invalidated');
  return cursor;
}
const encode = (value: Cursor) => btoa(JSON.stringify(value));
export async function listCampaignSessionReferences(
  input: C.ListSessionReferencesInput,
): Promise<C.SessionReferencePage> {
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
          (!cursor?.last ||
            row.createdAt > cursor.last.createdAt ||
            (row.createdAt === cursor.last.createdAt && row.id > cursor.last.id)),
      )
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    const window = rows.slice(0, size),
      items: C.SessionReferenceRow[] = [];
    for (const row of window) {
      const target =
        context && row.target ? await candidate(input, context, row.target.sourceKey) : null;
      const metadata = {
        id: row.id,
        revision: row.revision,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
      items.push(
        target
          ? { ...metadata, available: true, target: { ...target, kind: 'lore' } }
          : { ...metadata, available: false },
      );
    }
    const last = window.at(-1);
    return {
      ...envelope(uid, input, current),
      view: 'references' as const,
      sourceContext: context,
      items,
      nextCursor:
        rows.length > size && last
          ? encode({ scope: cursorScope, last: { id: last.id, createdAt: last.createdAt } })
          : null,
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
        if (!context || !(await candidate(input, context, added.target.sourceKey)))
          fail('Ficha indisponível.', undefined, 'not-found');
        if (
          Object.values(data.rows).some(
            (row) =>
              row.ownerId === uid &&
              row.campaignId === input.campaignId &&
              row.sessionId === input.sessionId &&
              !row.deleted &&
              row.target?.sourceKey === added.target.sourceKey,
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
