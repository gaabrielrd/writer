import type {
  Adventure,
  CreateAdventureInput,
} from '../../../src/features/adventures/model/adventure';
import type {
  Campaign,
  CampaignPatch,
  CreateCampaignInput,
} from '../../../src/features/campaigns/model/campaign';
import { author, FIXTURE_LIBRARY_STATE_KEY, FIXTURE_TIME } from './data';

type Kind = 'adventure' | 'campaign';
type Project = Adventure | Campaign;
export function fixtureOwner(): string {
  return sessionStorage.getItem('writer.visual.account') === 'second'
    ? 'visual-second-author'
    : author.uid;
}
const seedCount = sessionStorage.getItem('writer.visual.studio-pagination') === 'true' ? 28 : 2;
const empty = sessionStorage.getItem(FIXTURE_LIBRARY_STATE_KEY) === 'empty';
const projectKey = (uid: string, id: string) => JSON.stringify([uid, id]);
const stores = { adventure: new Map<string, Adventure>(), campaign: new Map<string, Campaign>() };
if (!empty) {
  for (let index = 0; index < seedCount; index += 1) {
    const common = {
      ownerId: author.uid,
      schemaVersion: 1 as const,
      revision: 1,
      universeId: null,
      createdAt: FIXTURE_TIME - index * 86_400_000,
      updatedAt: FIXTURE_TIME - index * 86_400_000,
    };
    const adventure: Adventure = {
      ...common,
      id: `visual-adventure-${index + 1}`,
      title: index === 0 ? 'O farol entre as ilhas' : `Aventura das marés ${index + 1}`,
      synopsis: 'Uma passagem perdida entre as ilhas aguarda os aventureiros.',
      language: 'pt-BR',
      origin: { kind: 'authored' },
      status: index === 0 ? 'draft' : 'ready',
    };
    const campaign: Campaign = {
      ...common,
      id: `visual-campaign-${index + 1}`,
      title: index === 0 ? 'Crônicas do Porto das Lanternas' : `Campanha das marés ${index + 1}`,
      description: 'Anotações particulares para a próxima jornada.',
      provenance: { kind: 'independent' },
      status: index === 0 ? 'planning' : 'active',
    };
    stores.adventure.set(projectKey(adventure.ownerId, adventure.id), adventure);
    stores.campaign.set(projectKey(campaign.ownerId, campaign.id), campaign);
  }
}

const projectPatches = JSON.parse(
  sessionStorage.getItem('writer.visual.studio-patches') ?? '{}',
) as Record<string, Partial<Project>>;
for (const [key, patch] of Object.entries(projectPatches)) {
  const separator = key.indexOf(':');
  const [uid, kind, id] = key.startsWith('[')
    ? (JSON.parse(key) as [string, Kind, string])
    : [author.uid, key.slice(0, separator) as Kind, key.slice(separator + 1)];
  const value = stores[kind]?.get(projectKey(uid, id));
  if (value) Object.assign(value, patch);
}
interface ListInput {
  status?: string;
  editorialState?: 'all' | 'draft' | 'review' | 'ready';
  cursor?: string | null;
  limit?: number;
}
export function fixtureEditorialState(
  kind: 'book' | 'adventure',
  value: { editorialState?: unknown; status: string },
): 'draft' | 'review' | 'ready' {
  if (
    value.editorialState === 'draft' ||
    value.editorialState === 'review' ||
    value.editorialState === 'ready'
  )
    return value.editorialState;
  return kind === 'adventure' && value.status === 'ready' ? 'ready' : 'draft';
}
export function fixtureStudioPage<T extends { status: string; editorialState?: unknown }>(
  kind: 'book' | Kind,
  items: T[],
  input: ListInput,
): { items: T[]; nextCursor: string | null } {
  const editorialState = input.editorialState ?? 'all';
  if (kind === 'campaign' && editorialState !== 'all')
    throw new Error('Campanhas não possuem estado editorial.');
  const scope = JSON.stringify({
    uid: fixtureOwner(),
    kind,
    status: input.status ?? 'all',
    editorialState,
  });
  const cursor = input.cursor
    ? (JSON.parse(input.cursor) as { scope: string; offset: number })
    : { scope, offset: 0 };
  if (cursor.scope !== scope || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0)
    throw Object.assign(new Error('O cursor não corresponde aos filtros atuais.'), {
      code: 'functions/failed-precondition',
      details: { reason: 'cursor-invalidated' },
    });
  const limit = input.limit ?? 25;
  const window = items.slice(cursor.offset, cursor.offset + limit);
  return {
    items: window.filter(
      (item) =>
        editorialState === 'all' ||
        (kind !== 'campaign' && fixtureEditorialState(kind, item) === editorialState),
    ),
    nextCursor:
      cursor.offset + limit < items.length
        ? JSON.stringify({ scope, offset: cursor.offset + limit })
        : null,
  };
}
export function fixtureList(kind: Kind, input: ListInput) {
  if (sessionStorage.getItem('writer.visual.studio-error-kind') === kind) {
    return Promise.reject(new Error('Falha simulada de conexão. Tente novamente.'));
  }
  const items = [...stores[kind].values()]
    .filter((project) => project.ownerId === fixtureOwner())
    .filter((project) => kind !== 'campaign' || !fixtureCampaignDeletionReservation(project.id))
    .filter((project) => !input.status || input.status === 'all' || project.status === input.status)
    .sort((left, right) => right.updatedAt - left.updatedAt || right.id.localeCompare(left.id));
  const page = fixtureStudioPage(kind, items, input);
  return Promise.resolve({
    items: page.items.map((project) => ({
      id: project.id,
      kind,
      title: project.title,
      status: project.status,
      ...(kind === 'adventure'
        ? { editorialState: fixtureEditorialState('adventure', project) }
        : {}),
      revision: project.revision,
      universeId: project.universeId,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    })),
    nextCursor: page.nextCursor,
  });
}

export function fixtureGet(kind: 'adventure', id: string): Promise<Adventure | null>;
export function fixtureGet(kind: 'campaign', id: string): Promise<Campaign | null>;
export function fixtureGet(kind: Kind, id: string): Promise<Project | null> {
  if (kind === 'campaign' && fixtureCampaignDeletionReservation(id)) return Promise.resolve(null);
  const project = stores[kind].get(projectKey(fixtureOwner(), id));
  return Promise.resolve(structuredClone(project?.ownerId === fixtureOwner() ? project : null));
}

const storageKey = 'writer.visual.studio-projects';
const savedProjects = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as {
  adventures: Adventure[];
  campaigns: Campaign[];
  receipts: [string, { payload: string; project: Project }][];
  sequence: number;
} | null;
for (const project of savedProjects?.adventures ?? [])
  stores.adventure.set(projectKey(project.ownerId, project.id), project);
for (const project of savedProjects?.campaigns ?? [])
  stores.campaign.set(projectKey(project.ownerId, project.id), project);
const receipts = new Map<string, { payload: string; project: Project }>(
  savedProjects?.receipts ?? [],
);
let sequence = savedProjects?.sequence ?? 0;
function persistStudio() {
  sessionStorage.setItem(
    storageKey,
    JSON.stringify({
      adventures: [...stores.adventure.values()],
      campaigns: [...stores.campaign.values()],
      receipts: [...receipts],
      sequence,
    }),
  );
}
export function fixtureCreate(kind: 'adventure', input: CreateAdventureInput): Promise<Adventure>;
export function fixtureCreate(kind: 'campaign', input: CreateCampaignInput): Promise<Campaign>;
export async function fixtureCreate(
  kind: Kind,
  input: CreateAdventureInput | CreateCampaignInput,
): Promise<Project> {
  const ownerId = fixtureOwner();
  const receiptKey = `${ownerId}:${input.operationId}`;
  const payload = JSON.stringify({ kind, ...input });
  const terminal = deletedCreationReceipts[receiptKey];
  if (terminal) {
    if (terminal.payloadHash !== creationHash(payload))
      throw new Error('Esta operação já foi usada com outros dados.');
    fixtureAssertCampaignWritable(terminal.campaignId, ownerId);
  }
  const previous = receipts.get(receiptKey);
  if (previous) {
    if (previous.payload !== payload)
      throw new Error('Esta operação já foi usada com outros dados.');
    if (kind === 'campaign') fixtureAssertCampaignWritable(previous.project.id, ownerId);
    const current = stores[kind].get(projectKey(ownerId, previous.project.id));
    if (!current)
      throw Object.assign(new Error('Projeto indisponível.'), { code: 'functions/not-found' });
    return structuredClone(current);
  }
  const common = {
    id: `visual-created-${kind}-${++sequence}`,
    ownerId,
    schemaVersion: 1 as const,
    revision: 1,
    title: input.title.trim(),
    universeId: input.universeId ?? null,
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  };
  if (kind === 'campaign') fixtureAssertCampaignWritable(common.id, ownerId);
  const project =
    kind === 'adventure'
      ? {
          ...common,
          synopsis: (input as CreateAdventureInput).synopsis ?? '',
          language: 'pt-BR' as const,
          origin: { kind: 'authored' as const },
          status: 'draft' as const,
        }
      : {
          ...common,
          description: (input as CreateCampaignInput).description ?? '',
          provenance: { kind: 'independent' as const },
          status: 'planning' as const,
        };
  if (kind === 'adventure')
    stores.adventure.set(projectKey(ownerId, project.id), project as Adventure);
  else stores.campaign.set(projectKey(ownerId, project.id), project as Campaign);
  receipts.set(receiptKey, { payload, project });
  persistStudio();
  // Simulate a response lost after persistence; retry must resolve the receipt.
  if (sessionStorage.getItem('writer.visual.studio-lost-response') === kind) {
    sessionStorage.removeItem('writer.visual.studio-lost-response');
    throw new Error('A resposta se perdeu. Tente novamente com os mesmos dados.');
  }
  if (sessionStorage.getItem('writer.visual.studio-hold-create') === kind) {
    await new Promise<void>((resolve) =>
      window.addEventListener('writer.visual.release-create', () => resolve(), { once: true }),
    );
  }
  return structuredClone(project);
}

export function fixturePatchProject(kind: Kind, id: string, patch: Partial<Project>): void {
  if (kind === 'campaign') fixtureAssertCampaignWritable(id);
  const value = stores[kind].get(projectKey(fixtureOwner(), id));
  if (value?.ownerId === fixtureOwner()) {
    Object.assign(value, patch);
    const key = JSON.stringify([fixtureOwner(), kind, id]);
    projectPatches[key] = { ...projectPatches[key], ...patch } as Partial<Project>;
    sessionStorage.setItem('writer.visual.studio-patches', JSON.stringify(projectPatches));
    persistStudio();
  }
}
export function fixtureCommitCampaign(
  id: string,
  expectedRevision: number,
  patch: CampaignPatch,
): Campaign {
  fixtureAssertCampaignWritable(id);
  const key = projectKey(fixtureOwner(), id),
    current = stores.campaign.get(key);
  if (!current || ('deleting' in current && current.deleting))
    throw Object.assign(new Error('Campanha indisponível.'), { code: 'functions/not-found' });
  if (
    current.provenance.kind !== 'independent' &&
    !(
      current.provenance.kind === 'original' &&
      [current.provenance.adventureId, current.provenance.baseId].every(
        (value) =>
          typeof value === 'string' &&
          !!value &&
          !value.includes('/') &&
          !['.', '..'].includes(value) &&
          new TextEncoder().encode(value).length <= 1500,
      ) &&
      current.activeBaseId === current.provenance.baseId
    )
  )
    throw Object.assign(new Error('Procedência de campanha não suportada.'), {
      code: 'functions/failed-precondition',
    });
  if (current.revision !== expectedRevision)
    throw Object.assign(new Error('A campanha mudou. Compare a versão atual antes de continuar.'), {
      code: 'functions/failed-precondition',
      details: { reason: 'revision-conflict' },
    });
  const confirmed: Campaign = {
    ...current,
    ...patch,
    revision: current.revision + 1,
    updatedAt: Math.max(FIXTURE_TIME, current.updatedAt + 1),
  };
  stores.campaign.set(key, confirmed);
  persistStudio();
  return structuredClone(confirmed);
}

export function fixtureActivateCapturedCampaign(campaign: Campaign): Campaign {
  fixtureAssertCampaignWritable(campaign.id, campaign.ownerId);
  if (
    campaign.ownerId !== fixtureOwner() ||
    campaign.provenance.kind !== 'original' ||
    campaign.activeBaseId !== campaign.provenance.baseId
  )
    throw Object.assign(new Error('Campanha indisponível.'), {
      code: 'functions/permission-denied',
    });
  const key = projectKey(campaign.ownerId, campaign.id);
  if (stores.campaign.has(key))
    throw Object.assign(new Error('Identificador já utilizado.'), {
      code: 'functions/already-exists',
    });
  stores.campaign.set(key, structuredClone(campaign));
  persistStudio();
  return structuredClone(campaign);
}

// One simulated immutable root identity across fixture transports; SDK proves real createTime.
export function fixtureCampaignToken(uid: string, campaignId: string): string {
  const storageKey = 'writer.visual.campaign-identities',
    key = JSON.stringify([uid, campaignId]);
  const identities = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Record<string, string>;
  if (identities[key]) return identities[key];
  // Migrate only a previously issued C1 identity, without resetting notes or reading their bodies.
  const legacy = JSON.parse(
    localStorage.getItem('writer.visual.campaign-notes') ?? '{"projects":{}}',
  ) as { projects: Record<string, { token?: string }> };
  const previous = legacy.projects[key]?.token;
  const token =
    previous && /^[a-f0-9]{64}$/.test(previous)
      ? previous
      : (crypto.randomUUID() + crypto.randomUUID()).replaceAll('-', '');
  identities[key] = token;
  localStorage.setItem(storageKey, JSON.stringify(identities));
  return token;
}

// Simulated permanent deletion barrier, shared by the fixture transports only.
export interface FixtureCampaignDeletionReservation {
  ownerId: string;
  campaignId: string;
  campaignToken: string;
  deletionId: string;
  state: 'deleting' | 'deleted';
}
const deletionReservationsKey = 'writer.visual.campaign-deletion-reservations';
export function fixtureCampaignDeletionReservation(
  campaignId: string,
): FixtureCampaignDeletionReservation | null {
  const values = JSON.parse(localStorage.getItem(deletionReservationsKey) ?? '{}') as Record<
    string,
    FixtureCampaignDeletionReservation
  >;
  return structuredClone(values[campaignId] ?? null);
}
export function fixtureAssertCampaignWritable(campaignId: string, uid = fixtureOwner()): void {
  const reservation = fixtureCampaignDeletionReservation(campaignId);
  if (!reservation) return;
  if (reservation.ownerId !== uid)
    throw Object.assign(new Error('Campanha indisponível.'), { code: 'functions/not-found' });
  throw Object.assign(new Error('Campanha em exclusão ou já excluída.'), {
    code: 'functions/failed-precondition',
    details: {
      reason:
        reservation.ownerId === uid && reservation.state === 'deleted'
          ? 'campaign-deleted'
          : 'campaign-deleting',
    },
  });
}
export function fixtureReserveCampaignDeletion(
  reservation: FixtureCampaignDeletionReservation,
): void {
  if (
    reservation.ownerId !== fixtureOwner() ||
    fixtureCampaignToken(reservation.ownerId, reservation.campaignId) !== reservation.campaignToken
  )
    throw new Error('Identidade de exclusão inválida.');
  const values = JSON.parse(localStorage.getItem(deletionReservationsKey) ?? '{}') as Record<
    string,
    FixtureCampaignDeletionReservation
  >;
  const current = values[reservation.campaignId];
  if (current && JSON.stringify(current) !== JSON.stringify(reservation))
    fixtureAssertCampaignWritable(reservation.campaignId);
  values[reservation.campaignId] = structuredClone(reservation);
  localStorage.setItem(deletionReservationsKey, JSON.stringify(values));
}
export function fixtureFinishCampaignDeletion(
  uid: string,
  campaignId: string,
  token: string,
  deletionId: string,
): void {
  const reservation = fixtureCampaignDeletionReservation(campaignId);
  if (
    uid !== fixtureOwner() ||
    !reservation ||
    reservation.ownerId !== uid ||
    reservation.campaignToken !== token ||
    reservation.deletionId !== deletionId
  )
    throw new Error('Reserva de exclusão inválida.');
  const project = stores.campaign.get(projectKey(uid, campaignId));
  if (project && fixtureCampaignToken(uid, campaignId) !== token)
    throw new Error('Outra encarnação.');
  stores.campaign.delete(projectKey(uid, campaignId));
  for (const [key, receipt] of receipts) {
    if (receipt.project.ownerId === uid && receipt.project.id === campaignId) {
      deletedCreationReceipts[key] = { campaignId, payloadHash: creationHash(receipt.payload) };
      receipts.delete(key);
    }
  }
  localStorage.setItem(deletedCreationKey, JSON.stringify(deletedCreationReceipts));
  delete projectPatches[JSON.stringify([uid, 'campaign', campaignId])];
  sessionStorage.setItem('writer.visual.studio-patches', JSON.stringify(projectPatches));
  persistStudio();
  const values = JSON.parse(localStorage.getItem(deletionReservationsKey) ?? '{}') as Record<
    string,
    FixtureCampaignDeletionReservation
  >;
  values[campaignId] = { ...reservation, state: 'deleted' };
  localStorage.setItem(deletionReservationsKey, JSON.stringify(values));
}

const deletedCreationKey = 'writer.visual.studio-creation-terminals';
const deletedCreationReceipts = JSON.parse(
  localStorage.getItem(deletedCreationKey) ?? '{}',
) as Record<string, { campaignId: string; payloadHash: string }>;
function creationHash(value: string): string {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0').repeat(8);
}
