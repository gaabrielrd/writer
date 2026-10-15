import type {
  Adventure,
  CreateAdventureInput,
} from '../../../src/features/adventures/model/adventure';
import type { Campaign, CreateCampaignInput } from '../../../src/features/campaigns/model/campaign';
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
    stores.adventure.set(adventure.id, adventure);
    stores.campaign.set(campaign.id, campaign);
  }
}

const projectPatches = JSON.parse(
  sessionStorage.getItem('writer.visual.studio-patches') ?? '{}',
) as Record<string, Partial<Project>>;
for (const [key, patch] of Object.entries(projectPatches)) {
  const separator = key.indexOf(':');
  const kind = key.slice(0, separator) as Kind;
  const value = stores[kind]?.get(key.slice(separator + 1));
  if (value) Object.assign(value, patch);
}
interface ListInput {
  status?: string;
  cursor?: string | null;
  limit?: number;
}
export function fixtureList(kind: Kind, input: ListInput) {
  if (sessionStorage.getItem('writer.visual.studio-error-kind') === kind) {
    return Promise.reject(new Error('Falha simulada de conexão. Tente novamente.'));
  }
  const items = [...stores[kind].values()]
    .filter((project) => project.ownerId === fixtureOwner())
    .filter((project) => !input.status || input.status === 'all' || project.status === input.status)
    .sort((left, right) => right.updatedAt - left.updatedAt || right.id.localeCompare(left.id));
  const offset = Number(input.cursor ?? 0);
  const limit = input.limit ?? 25;
  return Promise.resolve({
    items: items.slice(offset, offset + limit).map((project) => ({
      id: project.id,
      kind,
      title: project.title,
      status: project.status,
      ...(kind === 'adventure'
        ? { editorialState: (project as Adventure).editorialState ?? 'draft' }
        : {}),
      revision: project.revision,
      universeId: project.universeId,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    })),
    nextCursor: offset + limit < items.length ? String(offset + limit) : null,
  });
}

export function fixtureGet(kind: 'adventure', id: string): Promise<Adventure | null>;
export function fixtureGet(kind: 'campaign', id: string): Promise<Campaign | null>;
export function fixtureGet(kind: Kind, id: string): Promise<Project | null> {
  const project = stores[kind].get(id);
  return Promise.resolve(structuredClone(project?.ownerId === fixtureOwner() ? project : null));
}

const receipts = new Map<string, { payload: string; project: Project }>();
let sequence = 0;
export function fixtureCreate(kind: 'adventure', input: CreateAdventureInput): Promise<Adventure>;
export function fixtureCreate(kind: 'campaign', input: CreateCampaignInput): Promise<Campaign>;
export async function fixtureCreate(
  kind: Kind,
  input: CreateAdventureInput | CreateCampaignInput,
): Promise<Project> {
  const ownerId = fixtureOwner();
  const receiptKey = `${ownerId}:${input.operationId}`;
  const payload = JSON.stringify({ kind, ...input });
  const previous = receipts.get(receiptKey);
  if (previous) {
    if (previous.payload !== payload)
      throw new Error('Esta operação já foi usada com outros dados.');
    return structuredClone(previous.project);
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
  if (kind === 'adventure') stores.adventure.set(project.id, project as Adventure);
  else stores.campaign.set(project.id, project as Campaign);
  receipts.set(receiptKey, { payload, project });
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
  const value = stores[kind].get(id);
  if (value?.ownerId === fixtureOwner()) {
    Object.assign(value, patch);
    projectPatches[kind + ':' + id] = { ...projectPatches[kind + ':' + id], ...patch };
    sessionStorage.setItem('writer.visual.studio-patches', JSON.stringify(projectPatches));
  }
}
