import type {
  LiteraryPlanState,
  LiteraryPlanPage,
} from '../../../src/features/literary-production/model/planning';
import type { SaveLiteraryPlan } from '../../../src/features/literary-production/model/planning';
const schema: LiteraryPlanPage['schema'] = {
  seriesBridge: {
    label: 'Continuidade entre volumes',
    fields: { inherited: 'Fatos e estado herdados', reserved: 'Reservas para outros volumes' },
  },
  bookOverview: { label: 'Visão geral do livro', fields: { question: 'Pergunta central' } },
};
let saved: LiteraryPlanState | null = null;
export const listLiteraryPlans = () =>
  Promise.resolve({
    schema,
    items: saved
      ? [
          {
            id: saved.id,
            title: saved.plan.title,
            kind: saved.plan.kind,
            status: saved.plan.status,
            revision: saved.revision,
          },
        ]
      : [],
    nextAfterId: null,
    projectUpdatedAt: 1,
  });
export const listLiteraryVolumeBooks = (_bookId: string, afterId: string | null = null) =>
  Promise.resolve({
    items:
      afterId === null
        ? [{ id: 'volume-a', title: 'O primeiro porto' }]
        : [{ id: 'volume-b', title: 'O segundo porto' }],
    nextAfterId: afterId === null ? 'volume-a' : null,
  });
export const listLiteraryReferences = (
  _bookId: string,
  kind: string,
  _afterId: string | null,
  _purpose: string,
  volume?: { bookId: string; kind: string },
) =>
  Promise.resolve({
    items:
      kind === 'volumeUnit' && volume
        ? [
            {
              reference: {
                kind: 'volumeUnit',
                id: JSON.stringify([volume.bookId, volume.kind, 'same']),
                scopeId: volume.bookId,
                sourceToken: (volume.bookId === 'volume-a' ? 'a' : 'b').repeat(64),
                revision: 1,
                purpose: 'source',
              },
              label:
                (volume.bookId === 'volume-a' ? 'O primeiro porto' : 'O segundo porto') +
                ' · Capítulo · A carta',
            },
          ]
        : kind === 'chapter'
          ? [
              {
                reference: {
                  kind: 'chapter',
                  id: 'chapter-continuous',
                  scopeId: _bookId,
                  sourceToken: 'c'.repeat(64),
                  revision: 1,
                  purpose: _purpose,
                },
                label: 'Capítulo preparado',
              },
              ...(new URLSearchParams(window.location.search).has('literarySequence')
                ? [
                    {
                      reference: {
                        kind: 'chapter',
                        id: 'sequence-next-chapter',
                        scopeId: _bookId,
                        sourceToken: 'd'.repeat(64),
                        revision: 1,
                        purpose: _purpose,
                      },
                      label: 'O retorno à enseada e a escolha que permanece em aberto',
                    },
                  ]
                : []),
            ]
          : [],
    nextAfterId: null,
  });
export const saveLiteraryPlan = (input: SaveLiteraryPlan) => {
  saved = {
    schemaVersion: 1,
    id: input.id,
    revision: input.expectedRevision + 1,
    createdAt: 1,
    updatedAt: 2,
    plan: structuredClone(input.plan),
    sources: input.plan.references.map((reference) => ({
      reference,
      currentReference: reference,
      available: true,
      changed: false,
      label:
        (reference.scopeId === 'volume-a' ? 'O primeiro porto' : 'O segundo porto') +
        ' · Capítulo · A carta',
    })),
  };
  return Promise.resolve({ id: saved.id, revision: saved.revision, updatedAt: saved.updatedAt });
};
export const getLiteraryPlan = () =>
  saved
    ? Promise.resolve(structuredClone(saved))
    : Promise.reject(new Error('Documento indisponível.'));
export const listLiteraryPlanVersions = () =>
  Promise.resolve({
    items: saved ? [{ id: saved.id, revision: saved.revision, updatedAt: saved.updatedAt }] : [],
    nextBeforeRevision: null,
  });
export const getLiteraryPlanVersion = getLiteraryPlan;
