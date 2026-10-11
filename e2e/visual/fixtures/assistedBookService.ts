import type { AssistedCommit } from '../../../src/features/ai-assistant/services/assistedBookService';
import type {
  AssistedProposal,
  AssistedRequest,
  AssistedSession,
} from '../../../src/features/ai-assistant/model/assistedBook';
import { seedAssistedBook } from './bookService';
import { seedAssistedLore } from './loreService';
import { author } from './data';

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
  return Promise.resolve({ session, costs });
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
    session = {
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
  if (input.action === 'interview') {
    session.messages.push(
      ...(input.message ? [{ role: 'user' as const, text: input.message }] : []),
      { role: 'assistant', text: 'Que conflito move a protagonista?' },
    );
    session.brief =
      'Uma aventura entre ilhas, com uma navegadora em busca do último mar. Decisões restantes são sugestões.';
  }
  if (input.action === 'generate') {
    session.proposal = proposal();
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
export function commitAssistedBook(input: AssistedCommit) {
  seedAssistedBook({
    id: input.sessionId,
    authorId: author.uid,
    title: input.proposal.title,
    genre: input.proposal.genre,
    synopsis: input.proposal.synopsis,
    coverUrl: input.coverId ? session!.cover!.previewUrl : null,
    status: 'draft',
    wordCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  seedAssistedLore(input.sessionId, input.proposal.entities);
  return Promise.resolve({
    book: { id: input.sessionId },
    credits: author.credits - input.expectedCost,
  });
}
