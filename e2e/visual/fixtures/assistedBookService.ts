import type { AssistedCommit } from '../../../src/features/ai-assistant/services/assistedBookService';
import type {
  AssistedProposal,
  AssistedRequest,
  AssistedSession,
} from '../../../src/features/ai-assistant/model/assistedBook';
import { seedAssistedBook } from './bookService';
import { seedAssistedLore } from './loreService';
import { fixtureCreate, fixtureCreatedOperation, fixtureOwner } from './studioStore';
import { author } from './data';
import { fixtureLibraryImage } from './imageLibraryService';

export class AssistedBookError extends Error {
  readonly uncertain = false;
}
const costs = { text: 2, cover: 5 };
const key = 'writer.visual.assisted';
let session: AssistedSession | null = JSON.parse(
  sessionStorage.getItem(key) ?? 'null',
) as AssistedSession | null;
function save() {
  sessionStorage.setItem(key, JSON.stringify(session));
  return Promise.resolve(structuredClone(session!));
}
export function loadAssistedBook() {
  if (sessionStorage.getItem('writer.visual.assisted-owner') !== fixtureOwner())
    return Promise.resolve({ session: null, costs });
  return Promise.resolve({
    project: JSON.parse(sessionStorage.getItem('writer.visual.assisted-project') ?? 'null') as {
      kind: 'book' | 'adventure' | 'campaign';
      id: string;
    } | null,
    session:
      sessionStorage.getItem('writer.visual.assisted-committed') === session?.id ? null : session,
    costs,
  });
}
function proposal(): AssistedProposal {
  return {
    title: 'O último mar',
    genre: 'Aventura',
    synopsis: 'Uma navegadora atravessa ilhas para descobrir por que o oceano está desaparecendo.',
    coverDirection: 'Navegadora diante de um oceano seco, bronze e azul.',
    entities: Array.from({ length: 12 }, (_, index) => ({
      id: `entity-${String(index).padStart(12, '0')}`,
      name: index === 0 ? 'Marina' : `Ilha ${index}`,
      category: index === 0 ? 'character' : 'location',
      aliases: [],
      summary:
        index === 0 ? 'Navegadora em busca do último mar.' : 'Uma ilha no caminho da navegadora.',
      details: 'História privada desta entidade.',
      structuredDetails: {
        appearance: 'Traços marcantes.',
        personality: '',
        history: '',
        notes: 'Um segredo.',
      },
      relations:
        index === 0 ? [{ targetEntityId: 'entity-000000000001', relationType: 'Viaja para' }] : [],
    })),
  };
}
export function requestAssistedBook(input: AssistedRequest) {
  if (input.action === 'start')
    sessionStorage.setItem('writer.visual.assisted-owner', fixtureOwner());
  if (input.action === 'start')
    session = {
      ...(input.flowVersion === 2
        ? {
            flowVersion: 2,
            kind: input.kind,
            method: input.method,
            universeId: input.universeId,
            personaId: input.personaId,
          }
        : {}),
      id: input.sessionId,
      idea: input.idea!,
      messages: [{ role: 'user', text: input.idea! }],
      brief: input.idea!,
      ready: false,
      revision: 0,
      proposal: null,
      proposalExpiresAt: null,
      cover: null,
      expiresAt: Date.now() + 7 * 86400000,
      costs,
    };
  if (!session) throw new Error('Sessão ausente.');
  if (input.action !== 'interview') {
    session.suggestedAction = null;
    session.suggestedActionRequestId = null;
  }
  if (input.action === 'interview') {
    const match = /gere.*proposta/i.test(input.message ?? '')
      ? 'Revisar proposta inicial'
      : /abra.*detalhes/i.test(input.message ?? '')
        ? 'Premissa e detalhes'
        : /gênero|genero/i.test(input.message ?? '')
          ? 'Gênero ou estilo'
          : null;
    const capability = input.capabilities?.find((c) => match && c.label.startsWith(match));
    session.suggestedAction = capability
      ? {
          id: capability.id,
          ...(capability.kind === 'field' ? { value: 'Fantasia marítima' } : {}),
        }
      : null;
    session.suggestedActionRequestId = input.requestId;

    session.messages.push(
      ...(input.message ? [{ role: 'user' as const, text: input.message }] : []),
      { role: 'assistant', text: 'Que conflito move a protagonista?' },
    );
    session.brief =
      'Uma aventura entre ilhas, com uma navegadora em busca do último mar. Decisões restantes são sugestões.';
  }
  if (input.action === 'generate') {
    session.proposal = session.flowVersion === 2 ? { ...proposal(), entities: [] } : proposal();
    session.brief = input.brief!;
    session.proposalExpiresAt = Date.now() + 3600000;
  }
  if (input.action === 'brief') session.brief = input.brief!;
  if (input.proposal) session.proposal = input.proposal;
  if (input.action === 'cover') {
    const p = session.proposal!;
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1800"><rect width="1200" height="1800" fill="#38566a"/><circle cx="600" cy="700" r="320" fill="#b18b54"/><path d="M0 1600L1200 1100V1800H0Z" fill="#1c3341"/></svg>';
    session.cover = {
      id: input.requestId,
      previewUrl: `data:image/svg+xml,${encodeURIComponent(svg)}`,
      contextHash: 'fixture',
      context: {
        title: p.title,
        genre: p.genre,
        synopsis: p.synopsis,
        direction: p.coverDirection,
      },
      expiresAt: Date.now() + 3600000,
    };
  }
  session.revision++;
  return save();
}
export async function commitAssistedBook(input: AssistedCommit) {
  if (session?.flowVersion === 2 && session.kind && session.kind !== 'book') {
    const common = {
      operationId: input.sessionId,
      title: input.proposal.title,
      universeId: session.universeId ?? null,
    };
    const project = await (async () => {
      try {
        return session.kind === 'campaign'
          ? await fixtureCreate('campaign', { ...common, description: input.proposal.synopsis })
          : await fixtureCreate('adventure', { ...common, synopsis: input.proposal.synopsis });
      } catch (error) {
        const result = fixtureCreatedOperation(input.sessionId);
        if (result) {
          sessionStorage.setItem(
            'writer.visual.assisted-project',
            JSON.stringify({ kind: session.kind, id: result.id }),
          );
          sessionStorage.setItem('writer.visual.assisted-committed', session.id);
        }
        throw error;
      }
    })();
    sessionStorage.setItem(
      'writer.visual.assisted-project',
      JSON.stringify({ kind: session.kind, id: project.id }),
    );
    sessionStorage.setItem('writer.visual.assisted-committed', session.id);
    return {
      book: { id: project.id },
      project: { kind: session.kind, id: project.id },
      credits: author.credits - input.expectedCost,
    };
  }
  seedAssistedBook({
    id: input.sessionId,
    authorId: author.uid,
    universeId: session?.universeId ?? null,
    personaId: session?.personaId ?? null,
    title: input.proposal.title,
    genre: input.proposal.genre,
    synopsis: input.proposal.synopsis,
    coverImageId: input.imageId,
    coverUrl: input.coverId
      ? session!.cover!.previewUrl
      : input.imageId
        ? fixtureLibraryImage(input.imageId).url
        : null,
    status: 'draft',
    wordCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  seedAssistedLore(input.sessionId, input.proposal.entities);
  sessionStorage.setItem('writer.visual.assisted-committed', input.sessionId);
  sessionStorage.setItem(
    'writer.visual.assisted-project',
    JSON.stringify({ kind: 'book', id: input.sessionId }),
  );
  return Promise.resolve({
    book: { id: input.sessionId },
    credits: author.credits - input.expectedCost,
  });
}
