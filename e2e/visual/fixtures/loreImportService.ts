import { extractLoreDocument } from '../../../src/features/document-import';
import type {
  LoreImportExisting,
  LoreImportReview,
  LoreImportSubmission,
} from '../../../src/features/universes/model/loreImport';
import { validateLoreImportFiles } from '../../../src/features/universes/model/loreImport';
import { createUniverse } from './universeService';
import { createLoreEntity, listLoreEntities, updateLoreEntity } from './loreService';
const key = (uid: string, world?: string) => `writer.visual.loreImport:${uid}:${world ?? 'new'}`;
export const getPendingLoreImport = (uid: string, world?: string) =>
  sessionStorage.getItem(key(uid, world));
export const clearPendingLoreImport = (uid: string, world?: string) =>
  sessionStorage.removeItem(key(uid, world));
export const rememberLoreImport = (uid: string, id: string, world?: string) =>
  sessionStorage.setItem(key(uid, world), id);
const read = (id: string) =>
  JSON.parse(sessionStorage.getItem(`writer.visual.import:${id}`) ?? 'null') as LoreImportReview;
const write = (review: LoreImportReview) =>
  sessionStorage.setItem(`writer.visual.import:${review.id}`, JSON.stringify(review));
export function getLoreImport(id: string) {
  return Promise.resolve(read(id));
}
export function advanceLoreImport(id: string) {
  return Promise.resolve(read(id));
}
export async function uploadLoreImport(input: {
  id: string;
  universeId?: string;
  files: File[];
  signal: AbortSignal;
  onProgress: (value: string) => void;
}) {
  validateLoreImportFiles(input.files);
  const candidates: LoreImportReview['candidates'] = [];
  for (const file of input.files) {
    const pages = await extractLoreDocument(file, { signal: input.signal });
    for (const page of pages) {
      for (const [name, category] of [
        ['Arthur', 'character'],
        ['Porto Azul', 'location'],
      ] as const) {
        if (!page.text.includes(name) || candidates.some((v) => v.name === name)) continue;
        candidates.push({
          id: `candidate-${candidates.length}`,
          name,
          category,
          summary: name === 'Arthur' ? 'O rei retornou ao porto.' : 'Porto de comércio.',
          details: name === 'Arthur' ? 'Nova história do rei.' : 'Os navios chegam ao porto.',
          aliases: [],
          evidence: page.text,
          fileName: file.name,
          page: page.page,
        });
      }
    }
  }
  const existing = input.universeId
    ? await listLoreEntities({ kind: 'universe', id: input.universeId })
    : [];
  const review: LoreImportReview = {
    id: input.id,
    state: 'ready',
    cursor: 1,
    total: 1,
    universeId: input.universeId ?? null,
    cost: 1,
    candidates,
    existing: existing.map((v) => ({ ...v, id: v.id.split(':').at(-1)! })),
  };
  write(review);
  return review;
}
export async function getLoreImportTarget(
  id: string,
  targetId: string,
): Promise<LoreImportExisting> {
  const review = read(id);
  const values = await listLoreEntities({ kind: 'universe', id: review.universeId! });
  return { ...values.find((v) => v.id.endsWith(':' + targetId))!, id: targetId };
}
export function saveLoreImportReview(input: LoreImportSubmission) {
  const review = read(input.id);
  review.pendingReview = input;
  write(review);
  return Promise.resolve();
}
export async function applyLoreImport(input: LoreImportSubmission) {
  const review = read(input.id);
  if (review.result) return review.result;
  const universeId = review.universeId ?? `import-${input.id}`;
  if (!review.universeId)
    await createUniverse({ name: input.name, description: input.description }, universeId);
  for (const change of input.changes) {
    if (change.targetId)
      await updateLoreEntity(
        { kind: 'universe', id: universeId },
        `universe:${universeId}:${change.targetId}`,
        change.input,
      );
    else
      await createLoreEntity(
        { kind: 'universe', id: universeId },
        { ...change.input, isPublic: false },
      );
  }
  const result = {
    universeId,
    created: input.changes.filter((v) => !v.targetId).length,
    updated: input.changes.filter((v) => v.targetId).length,
  };
  review.state = 'applied';
  review.result = result;
  write(review);
  return result;
}
export function cancelLoreImport(id: string) {
  sessionStorage.removeItem(`writer.visual.import:${id}`);
  return Promise.resolve();
}
