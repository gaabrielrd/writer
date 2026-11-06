import type {
  BookMapPage,
  BookMapResource,
  BookMapData,
  BookMapPlan,
} from '../../../src/features/literary-production/model/bookMap';
import type { LiteraryReference } from '../../../src/features/literary-production/model/planning';
const base = { revision: 1, version: 'fixture-native-version' };
const reference = (
  bookId: string,
  kind: LiteraryReference['kind'],
  id: string,
): LiteraryReference => ({
  kind,
  id,
  scopeId: bookId,
  purpose: 'subject',
  sourceToken: 'a'.repeat(64),
  revision: 1,
});
export function readLiteraryBookMapPage(
  bookId: string,
  resource: BookMapResource,
  fence: string | null,
  afterId: string | null,
): Promise<BookMapPage> {
  if (fence !== null && fence !== 'f'.repeat(64))
    return Promise.reject(new Error('As fontes mudaram.'));
  if (afterId !== null) return Promise.reject(new Error('A página visual já foi concluída.'));
  const knowledge: BookMapPlan = {
    ...base,
    resource: 'plans',
    fieldLabels: {
      known: 'Informação disponível',
      acquired: 'Aquisição e origem',
      realTime: 'Momento real',
      readingPosition: 'Posição na ordem de leitura',
      belief: 'Crença e grau de certeza',
    },
    id: 'knowledge',
    plan: {
      kind: 'knowledgeState',
      title: 'Ana recebe a notícia',
      status: 'proposal',
      fields: {
        known: 'A irmã ainda vive',
        acquired: 'Uma carta entregue no porto',
        realTime: 'Antes da viagem',
        readingPosition: 'Segundo encontro com Ana',
        belief: 'Ana acredita na carta; o narrador não confirma',
      },
      references: [
        reference(bookId, 'chapter', 'visual-chapter-1'),
        reference(bookId, 'event', 'early'),
        reference(bookId, 'localLore', 'ana'),
      ],
    },
    sources: [],
  };
  knowledge.sources = knowledge.plan.references.map((ref) => ({
    reference: ref,
    label:
      ref.kind === 'localLore'
        ? 'Ana'
        : ref.kind === 'chapter'
          ? 'A carta no porto'
          : 'Antes da partida',
    available: true,
    changed: false,
  }));
  const brief: BookMapPlan = {
    ...base,
    resource: 'plans',
    fieldLabels: {
      function: 'Função singular',
      realTime: 'Momento real',
      apparentTime: 'Pista temporal do leitor',
      decision: 'Decisão',
      consequence: 'Consequência',
    },
    id: 'brief',
    plan: {
      kind: 'chapterBrief',
      title: 'A escolha de partir',
      status: 'working',
      fields: {
        function: 'A carta obriga Ana a escolher',
        realTime: 'Antes da viagem',
        apparentTime: 'O leitor ainda não sabe a data',
        decision: 'Ana parte',
        consequence: 'O porto fica para trás',
      },
      references: [reference(bookId, 'chapter', 'visual-chapter-1')],
    },
    sources: [
      {
        reference: reference(bookId, 'chapter', 'visual-chapter-1'),
        label: 'A carta no porto',
        available: true,
        changed: false,
      },
    ],
  };
  const data: BookMapData = {
    acts: [{ ...base, resource: 'acts', id: 'opening', name: 'O porto das cartas', order: 1 }],
    chapters: [
      {
        ...base,
        resource: 'chapters',
        id: 'visual-chapter-1',
        title: 'A carta no porto',
        order: 2,
        actId: 'opening',
        contentMode: 'legacy',
      },
      {
        ...base,
        resource: 'chapters',
        id: 'visual-chapter-2',
        title: 'A travessia',
        order: 1,
        actId: null,
        contentMode: 'legacy',
      },
    ],
    events: [
      {
        ...base,
        resource: 'events',
        id: 'early',
        title: 'Antes da partida',
        rank: 'B',
        dateLabel: 'Três dias antes da chegada',
        description: 'A carta é entregue no porto.',
      },
      {
        ...base,
        resource: 'events',
        id: 'late',
        title: 'A chegada',
        rank: 'a',
        dateLabel: 'No primeiro degelo',
        description: 'A travessia termina.',
      },
    ],
    plans: [brief, knowledge],
  };
  return Promise.resolve({
    resource,
    fence: 'f'.repeat(64),
    items: data[resource],
    nextAfterId: null,
    coverage: { kind: 'root-fenced-metadata-read', manuscriptRead: false },
  });
}
