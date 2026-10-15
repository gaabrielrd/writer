import type * as Work from '../../../src/features/work-progress/model/workProgress';
import { countWords } from '../../../src/features/books/model/chapter';
import {
  fixtureReadBook,
  fixtureReadChapters,
  fixtureWriteBook,
  fixtureWriteChapter,
  seedAssistedBook,
} from './bookService';
import { fixtureGet, fixtureOwner, fixturePatchProject } from './studioStore';
import { fixtureSceneState } from './sceneStore';
import { FIXTURE_TIME, FIXTURE_BOOK_ID } from './data';

interface ProjectState {
  revision: number;
  editorialState: Work.EditorialState;
  wordGoal: number | null;
  ready: boolean;
  processed: number;
  cursor: string | null;
  operationId?: string;
  pauseNext?: boolean;
  checklistRevision: number;
  checklist: Work.ChecklistItem[];
}
interface UserState {
  preferences: Work.WorkPreferences;
  revision: number;
  activity: { target: Work.WorkTarget; resource: Work.WorkResource; accessedAt: number }[];
  receipts: Record<string, { fingerprint: string; result: unknown }>;
}
const key = 'writer.visual.work-progress';
const saved = JSON.parse(sessionStorage.getItem(key) ?? '{"projects":[],"users":[]}') as {
  projects: [string, ProjectState][];
  users: [string, UserState][];
};
const projects = new Map(saved.projects);
const users = new Map(saved.users);
const identity = (target: Work.WorkTarget, uid = fixtureOwner()) =>
  `${uid}:${target.kind}:${target.id}`;
function persist() {
  sessionStorage.setItem(key, JSON.stringify({ projects: [...projects], users: [...users] }));
}
function user(uid = fixtureOwner()): UserState {
  let value = users.get(uid);
  if (!value) {
    value = {
      preferences: { revision: 0, timeZone: null },
      revision: 0,
      activity: [],
      receipts: {},
    };
    users.set(uid, value);
    if (sessionStorage.getItem('writer.visual.work-resume-pages') === 'true') {
      const base = fixtureReadBook(FIXTURE_BOOK_ID);
      if (base)
        for (let index = 0; index < 28; index++) {
          const id = `work-recent-${String(index + 1).padStart(2, '0')}`;
          seedAssistedBook({ ...base, id, authorId: uid, title: `Projeto recente ${index + 1}` });
          fixtureWriteBook(id, {});
          value.activity.push({
            target: { kind: 'book', id },
            resource: { kind: 'project' },
            accessedAt: FIXTURE_TIME + 28 - index,
          });
        }
    }
  }
  return value;
}
function failure(message: string, code = 'failed-precondition', reason = 'revision-conflict') {
  return Object.assign(new Error(message), { code: `functions/${code}`, details: { reason } });
}
async function root(target: Work.WorkTarget, uid = fixtureOwner()) {
  const value =
    target.kind === 'book'
      ? fixtureReadBook(target.id)
      : target.kind === 'adventure'
        ? await fixtureGet('adventure', target.id)
        : await fixtureGet('campaign', target.id);
  const ownerId = value && ('authorId' in value ? value.authorId : value.ownerId);
  if (
    !value ||
    ownerId !== uid ||
    ('deleting' in value && value.deleting) ||
    sessionStorage.getItem('writer.visual.work-revoked-target') === `${target.kind}:${target.id}`
  )
    throw failure('Projeto indisponível.', 'not-found');
  return value;
}
async function state(target: Work.WorkTarget) {
  const uid = fixtureOwner();
  const value = await root(target, uid);
  let current = projects.get(identity(target, uid));
  if (!current) {
    current = {
      revision: 0,
      editorialState: target.kind === 'adventure' && value.status === 'ready' ? 'ready' : 'draft',
      wordGoal: null,
      ready: false,
      processed: 0,
      cursor: null,
      checklistRevision: 0,
      checklist: [],
    };
    projects.set(identity(target, uid), current);
    if (target.kind === 'book')
      fixtureWriteBook(target.id, {
        hasProgressResources: true,
        editorialState: current.editorialState,
      });
    if (
      sessionStorage.getItem('writer.visual.work-checklist-pages') === 'true' &&
      target.kind !== 'book'
    ) {
      current.checklist = Array.from({ length: 28 }, (_, index) => ({
        id: `work-task-${String(index + 1).padStart(2, '0')}`,
        title: `Preparar encontro ${index + 1}`,
        completed: index % 2 === 0,
        revision: 1,
        createdAt: FIXTURE_TIME,
        updatedAt: FIXTURE_TIME,
      }));
    }
    if (
      sessionStorage.getItem('writer.visual.work-prepare-pages') === 'true' &&
      target.kind === 'book'
    ) {
      for (let index = 0; index < 28; index++)
        fixtureWriteChapter({
          id: `work-legacy-${String(index + 1).padStart(2, '0')}`,
          bookId: target.id,
          title: `Capítulo de preparo ${index + 1}`,
          order: index + 20,
          content: `<p>Lua <strong>cheia</strong> do capítulo ${index + 1}.</p>`,
          wordCount: 5,
          createdAt: FIXTURE_TIME,
          updatedAt: FIXTURE_TIME,
        });
    }
    persist();
  }
  return { current, value, uid };
}
async function sources(target: Work.ManuscriptTarget) {
  const sceneState = await fixtureSceneState({ kind: target.kind, id: target.id });
  const result: { id: string; content: string; confirmedWords?: number }[] =
    target.kind === 'book'
      ? fixtureReadChapters(target.id)
          .filter((chapter) => !chapter.deleting && chapter.contentMode !== 'scenes')
          .map((chapter) => ({ id: `chapter:${chapter.id}`, content: chapter.content }))
      : [];
  for (const scene of Object.values(sceneState.scenes)) {
    const group = scene.parentId === null ? null : sceneState.groups[scene.parentId];
    if (scene.archived || !group || group.deleting || group.contentMode !== 'scenes') continue;
    const content = sceneState.bodies[scene.id];
    if (typeof content !== 'string') throw failure('O texto da fonte está indisponível.');
    result.push({
      id: `scene:${scene.id}`,
      content,
      ...(target.kind === 'adventure' ? { confirmedWords: scene.wordCount } : {}),
    });
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}
async function total(target: Work.ManuscriptTarget) {
  return (await sources(target)).reduce(
    (sum, source) => sum + (source.confirmedWords ?? countWords(source.content)),
    0,
  );
}
function totals(current: ProjectState) {
  return {
    checklistRevision: current.checklistRevision,
    total: current.checklist.length,
    completed: current.checklist.filter((item) => item.completed).length,
  };
}
function fingerprint(input: unknown) {
  return JSON.stringify(input);
}
function previous(input: { operationId: string }, uid: string) {
  const receipt = user(uid).receipts[input.operationId];
  if (receipt && receipt.fingerprint !== fingerprint(input))
    throw failure('O identificador já foi usado com outro pedido.', 'invalid-argument');
  return receipt;
}
async function response<T>(
  input: { operationId: string },
  uid: string,
  result: T,
  method: string,
): Promise<T> {
  user(uid).receipts[input.operationId] = {
    fingerprint: fingerprint(input),
    result: structuredClone(result),
  };
  persist();
  if (sessionStorage.getItem('writer.visual.work-lost-response') === method) {
    sessionStorage.removeItem('writer.visual.work-lost-response');
    throw failure('Não foi possível confirmar esta operação. Tente novamente.', 'unavailable');
  }
  if (sessionStorage.getItem('writer.visual.work-delay') === method) {
    await new Promise<void>((resolve) =>
      window.addEventListener('writer.visual.work-release', () => resolve(), { once: true }),
    );
  }
  return structuredClone(result);
}
function pageCursor(input: { cursor?: string | null }, scope: string, revision: number) {
  if (!input.cursor) return 0;
  const cursor = JSON.parse(input.cursor) as { scope: string; revision: number; offset: number };
  if (cursor.scope !== scope || cursor.revision !== revision)
    throw failure('A lista mudou. Atualize antes de carregar outra página.');
  return cursor.offset;
}
export async function getWorkProgress({
  target,
}: {
  target: Work.WorkTarget;
}): Promise<Work.WorkProgress | null> {
  try {
    const { current, value, uid } = await state(target);
    const words =
      current.ready && target.kind !== 'campaign'
        ? await total({ kind: target.kind, id: target.id })
        : null;
    return {
      target,
      ownerId: uid,
      title: value.title,
      revision: current.revision,
      activityRevision: user(uid).revision,
      archived: value.status === 'archived',
      editorialState: target.kind === 'campaign' ? null : current.editorialState,
      wordGoal: target.kind === 'campaign' ? null : current.wordGoal,
      manuscript:
        target.kind === 'campaign'
          ? null
          : {
              ready: current.ready,
              wordCount: words,
              ...(!current.ready && current.operationId
                ? { operationId: current.operationId, processed: current.processed }
                : {}),
            },
      checklist:
        target.kind === 'book'
          ? null
          : { total: totals(current).total, completed: totals(current).completed },
    };
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'functions/not-found')
      return null;
    throw error;
  }
}
export async function updateWorkProgress(
  input: Work.UpdateWorkProgressInput,
): Promise<Work.WorkProgressMutation> {
  const { current, uid } = await state(input.target);
  const receipt = previous(input, uid);
  if (receipt) return structuredClone(receipt.result) as Work.WorkProgressMutation;
  if (sessionStorage.getItem('writer.visual.work-conflict') === 'progress') {
    sessionStorage.removeItem('writer.visual.work-conflict');
    current.revision++;
    current.wordGoal = 700;
    current.editorialState = 'review';
    persist();
  }
  if (current.revision !== input.expectedRevision)
    throw failure('O recurso mudou. Atualize e compare antes de tentar novamente.');
  if (
    input.patch.wordGoal !== null &&
    input.patch.wordGoal !== undefined &&
    (!Number.isSafeInteger(input.patch.wordGoal) || input.patch.wordGoal < 1)
  )
    throw failure('Informe uma meta inteira positiva.', 'invalid-argument');
  Object.assign(current, input.patch);
  current.revision++;
  if (input.target.kind === 'book')
    fixtureWriteBook(input.target.id, { editorialState: current.editorialState });
  else
    fixturePatchProject('adventure', input.target.id, { editorialState: current.editorialState });
  return response(
    input,
    uid,
    {
      revision: current.revision,
      editorialState: current.editorialState,
      wordGoal: current.wordGoal,
    },
    'updateWorkProgress',
  );
}
export async function prepareWorkWordCount(
  input: Work.PrepareWorkWordCountInput,
): Promise<Work.WorkWordPreparation> {
  const { current } = await state(input.target);
  current.operationId ??= input.operationId;
  if (current.pauseNext) {
    current.pauseNext = false;
    persist();
    throw failure(
      'Verificação interrompida. Retome a partir das fontes confirmadas.',
      'unavailable',
    );
  }
  if (!current.ready) {
    const values = await sources(input.target);
    const page = values
      .filter((value) => current.cursor === null || value.id.localeCompare(current.cursor) > 0)
      .slice(0, input.limit ?? 25);
    current.processed += page.length;
    if (page.length) current.cursor = page.at(-1)!.id;
    current.ready =
      values.filter(
        (value) => current.cursor === null || value.id.localeCompare(current.cursor) > 0,
      ).length === 0;
    if (
      !current.ready &&
      sessionStorage.getItem('writer.visual.work-prepare-interrupted') === 'true'
    ) {
      sessionStorage.removeItem('writer.visual.work-prepare-interrupted');
      current.pauseNext = true;
    }
    persist();
  }
  const wordCount = current.ready ? await total(input.target) : null;
  if (input.target.kind === 'book' && wordCount !== null)
    fixtureWriteBook(input.target.id, {
      wordCount,
      updatedAt: Math.max(FIXTURE_TIME, (fixtureReadBook(input.target.id)?.updatedAt ?? 0) + 1),
    });
  return {
    complete: current.ready,
    processed: current.processed,
    wordCount,
  };
}
export async function listWorkChecklist(
  input: Work.WorkChecklistListInput,
): Promise<Work.ChecklistPage> {
  const { current, uid } = await state(input.target);
  const filter = input.filter ?? 'all';
  const scope = `${identity(input.target, uid)}:${filter}`;
  const offset = pageCursor(input, scope, current.checklistRevision),
    limit = input.limit ?? 25;
  if (input.cursor && sessionStorage.getItem('writer.visual.work-list-error') === 'checklist') {
    sessionStorage.removeItem('writer.visual.work-list-error');
    throw failure('Falha ao carregar mais tarefas.', 'unavailable');
  }
  const items = current.checklist.filter(
    (item) => filter === 'all' || item.completed === (filter === 'completed'),
  );
  return {
    items: structuredClone(items.slice(offset, offset + limit)),
    ...totals(current),
    nextCursor:
      offset + limit < items.length
        ? JSON.stringify({ scope, revision: current.checklistRevision, offset: offset + limit })
        : null,
  };
}
export async function createWorkChecklistItem(
  input: Work.CreateWorkChecklistInput,
): Promise<Work.ChecklistMutation> {
  const { current, uid } = await state(input.target);
  const receipt = previous(input, uid);
  if (receipt) return structuredClone(receipt.result) as Work.ChecklistMutation;
  const item = {
    id: input.operationId,
    title: input.title.trim(),
    completed: false,
    revision: 1,
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  };
  current.checklist.push(item);
  current.checklistRevision++;
  return response(input, uid, { item, ...totals(current) }, 'createWorkChecklistItem');
}
export async function updateWorkChecklistItem(
  input: Work.UpdateWorkChecklistInput,
): Promise<Work.ChecklistMutation> {
  const { current, uid } = await state(input.target);
  const receipt = previous(input, uid);
  if (receipt) return structuredClone(receipt.result) as Work.ChecklistMutation;
  const item = current.checklist.find((item) => item.id === input.id);
  if (!item) throw failure('Item indisponível.', 'not-found');
  if (sessionStorage.getItem('writer.visual.work-conflict') === 'checklist') {
    sessionStorage.removeItem('writer.visual.work-conflict');
    item.title = 'Título atualizado em outra aba';
    item.revision++;
    persist();
  }
  if (item.revision !== input.expectedRevision)
    throw failure('O recurso mudou. Atualize e compare antes de tentar novamente.');
  Object.assign(item, input.patch);
  item.revision++;
  item.updatedAt++;
  current.checklistRevision++;
  return response(input, uid, { item, ...totals(current) }, 'updateWorkChecklistItem');
}
export async function deleteWorkChecklistItem(
  input: Work.DeleteWorkChecklistInput,
): Promise<Work.ChecklistDeletion> {
  const { current, uid } = await state(input.target);
  const receipt = previous(input, uid);
  if (receipt) return structuredClone(receipt.result) as Work.ChecklistDeletion;
  const item = current.checklist.find((item) => item.id === input.id);
  if (!item || item.revision !== input.expectedRevision)
    throw failure('O recurso mudou. Atualize e compare antes de tentar novamente.');
  current.checklist = current.checklist.filter((item) => item.id !== input.id);
  current.checklistRevision++;
  return response(input, uid, totals(current), 'deleteWorkChecklistItem');
}
export function getWorkPreferences(): Promise<Work.WorkPreferences> {
  return Promise.resolve(structuredClone(user().preferences));
}
export async function saveWorkPreferences(
  input: Work.SaveWorkPreferencesInput,
): Promise<Work.WorkPreferences> {
  const uid = fixtureOwner(),
    current = user(uid),
    receipt = previous(input, uid);
  if (receipt) return structuredClone(receipt.result) as Work.WorkPreferences;
  if (
    input.expectedRevision === 0 &&
    sessionStorage.getItem('writer.visual.work-preference-race') === 'true'
  ) {
    sessionStorage.removeItem('writer.visual.work-preference-race');
    current.preferences = { revision: 1, timeZone: 'Europe/Lisbon' };
    persist();
  }
  if (current.preferences.revision !== input.expectedRevision)
    throw failure('A preferência mudou. Atualize antes de salvar.');
  const timeZone = new Intl.DateTimeFormat('pt-BR', { timeZone: input.timeZone }).resolvedOptions()
    .timeZone;
  current.preferences = { revision: current.preferences.revision + 1, timeZone };
  return response(input, uid, current.preferences, 'saveWorkPreferences');
}
export async function recordWorkActivity(
  input: Work.RecordWorkActivityInput,
): Promise<Work.WorkActivityResult> {
  const actor = fixtureOwner();
  await root(input.target, actor);
  const uid = actor,
    current = user(uid),
    receipt = previous(input, uid);
  if (receipt) return structuredClone(receipt.result) as Work.WorkActivityResult;
  if (sessionStorage.getItem('writer.visual.work-activity-error') === 'true')
    throw failure('A escrita foi salva, mas não foi possível registrar a retomada.', 'unavailable');
  if (current.revision !== input.expectedActivityRevision)
    throw failure('Outra visita foi registrada mais recentemente.');
  const accessedAt = FIXTURE_TIME + ++current.revision;
  current.activity = current.activity.filter(
    (item) => identity(item.target, uid) !== identity(input.target, uid),
  );
  current.activity.unshift({ target: input.target, resource: input.resource, accessedAt });
  return response(
    input,
    uid,
    { activityRevision: current.revision, accessedAt },
    'recordWorkActivity',
  );
}
async function resourceExists(target: Work.WorkTarget, resource: Work.WorkResource) {
  if (resource.kind === 'project') return true;
  if (sessionStorage.getItem('writer.visual.work-missing-resource') === resource.kind) return false;
  if (resource.kind === 'chapter')
    return fixtureReadChapters(target.id).some(
      (chapter) => chapter.id === resource.id && !chapter.deleting,
    );
  if (target.kind === 'campaign') return false;
  const state = await fixtureSceneState({ kind: target.kind, id: target.id });
  return Boolean(state.scenes[resource.id]);
}
export async function resolveWorkResume({
  target,
}: {
  target: Work.WorkTarget;
}): Promise<Work.ResolvedResume | null> {
  try {
    const uid = fixtureOwner();
    await root(target, uid);
    const record = user(uid).activity.find(
      (item) => identity(item.target, uid) === identity(target, uid),
    );
    const resource = record?.resource ?? { kind: 'project' as const },
      available = await resourceExists(target, resource);
    return {
      target,
      title: (await root(target, uid)).title,
      resource: available ? resource : { kind: 'project' },
      fallback: !available,
    };
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'functions/not-found')
      return null;
    throw error;
  }
}
export async function listWorkResume(
  input: Work.WorkResumeListInput = {},
): Promise<Work.ResumePage> {
  const uid = fixtureOwner(),
    current = user(uid),
    scope = `${uid}:${input.kind ?? 'all'}`;
  const offset = pageCursor(input, scope, current.revision),
    limit = input.limit ?? 25;
  const rows = current.activity.filter((item) => !input.kind || item.target.kind === input.kind),
    items: Work.ResumeSummary[] = [];
  for (const row of rows.slice(offset, offset + limit)) {
    const resolved = await resolveWorkResume({ target: row.target });
    if (resolved)
      items.push({
        target: row.target,
        title: resolved.title,
        resource: resolved.resource,
        accessedAt: row.accessedAt,
      });
  }
  return {
    items,
    activityRevision: current.revision,
    nextCursor:
      offset + limit < rows.length
        ? JSON.stringify({ scope, revision: current.revision, offset: offset + limit })
        : null,
  };
}
