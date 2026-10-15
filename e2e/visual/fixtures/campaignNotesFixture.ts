import type * as C from '../../../src/features/campaign-notes/model/campaignNote';
import { fixtureGet, fixtureOwner } from './studioStore';
import { FIXTURE_TIME } from './data';

type StoredNote = {
  id: string;
  ownerId: string;
  campaignId: string;
  schemaVersion: 1;
  campaignToken: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
  title?: string;
  content?: string;
};
interface Project {
  token: string;
  revision?: number;
  notes: Record<string, StoredNote>;
}
interface Receipt {
  campaignId: string;
  token: string;
  method: string;
  noteId: string;
  fingerprint: string;
  confirmedHash: string;
}
interface Data {
  projects: Record<string, Project>;
  receipts: Record<string, Receipt>;
  calls: {
    uid: string;
    campaignId: string;
    method: string;
    noteId?: string;
    operationId?: string;
    expectedRevision?: number;
  }[];
}
const storageKey = 'writer.visual.campaign-notes';
const read = (): Data =>
  JSON.parse(
    localStorage.getItem(storageKey) ?? '{"projects":{},"receipts":{},"calls":[]}',
  ) as Data;
const persist = (data: Data) => localStorage.setItem(storageKey, JSON.stringify(data));
const key = (...parts: string[]) => JSON.stringify(parts);
function fail(message: string, code = 'failed-precondition', reason?: string): never {
  throw Object.assign(new Error(message), {
    code: 'functions/' + code,
    ...(reason ? { details: { reason } } : {}),
  });
}
const conflict = () =>
  fail(
    'A nota mudou. Compare a versão atual antes de continuar.',
    'failed-precondition',
    'revision-conflict',
  );
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
function closed(value: unknown, fields: string[]): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((field) => !fields.includes(field))
  )
    fail('Pedido de nota inválido.', 'invalid-argument');
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([field, item]) => [field, canonical(item)]),
    );
  return value;
}
function hash(value: unknown) {
  let valueHash = 2166136261;
  for (const char of JSON.stringify(canonical(value)))
    valueHash = Math.imul(valueHash ^ char.codePointAt(0)!, 16777619);
  return (valueHash >>> 0).toString(16).padStart(8, '0').repeat(8);
}
function token(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    fail('Identidade da campanha inválida.', 'invalid-argument');
}
function budget<T>(value: T): T {
  if (new TextEncoder().encode(JSON.stringify(value)).length > 4 * 1024 * 1024)
    fail('Resposta acima do orçamento.');
  return structuredClone(value);
}
async function authorize(campaignId: string, uid: string) {
  const campaign = await fixtureGet('campaign', campaignId);
  if (
    !campaign ||
    campaign.ownerId !== uid ||
    campaign.schemaVersion !== 1 ||
    ('deleting' in campaign && campaign.deleting)
  )
    fail('Campanha indisponível.', 'not-found');
  if (
    campaign.provenance.kind !== 'independent' &&
    !(
      campaign.provenance.kind === 'original' &&
      !!campaign.provenance.adventureId &&
      !!campaign.provenance.baseId &&
      campaign.activeBaseId === campaign.provenance.baseId
    )
  )
    fail('Procedência de campanha não suportada.');
  // Deliberately no adventure, base, universe or lore lookup for author-owned notes.
}
async function server<T>(
  uid: string,
  campaignId: string,
  method: string,
  input: { noteId?: string; operationId?: string; expectedRevision?: number },
  work: (data: Data, project: Project) => T,
): Promise<T> {
  await authorize(campaignId, uid);
  const run = () => {
    const data = read(),
      projectKey = key(uid, campaignId);
    let project = data.projects[projectKey];
    if (!project) {
      // Fictional immutable root identity, independent of mutable metadata. SDK proves Firestore createTime.
      project = {
        token: (crypto.randomUUID() + crypto.randomUUID()).replaceAll('-', ''),
        notes: {},
      };
      data.projects[projectKey] = project;
    }
    if (project.revision === undefined && Object.keys(project.notes).length)
      fail('Controle das notas inconsistente.');
    data.calls.push({
      uid,
      campaignId,
      method,
      ...('noteId' in input ? { noteId: input.noteId } : {}),
      ...('operationId' in input ? { operationId: input.operationId } : {}),
      ...('expectedRevision' in input ? { expectedRevision: input.expectedRevision } : {}),
    });
    persist(data);
    return work(data, project);
  };
  // Only the simulated server transaction is serialized here. The real product uses its own lock/journal.
  return navigator.locks
    ? navigator.locks.request('writer.visual.notes-server:' + key(uid, campaignId), run)
    : run();
}
function expected(project: Project, value: string | undefined) {
  if (value !== undefined) {
    token(value);
    if (value !== project.token)
      fail(
        'A campanha mudou. Reabra antes de continuar.',
        'failed-precondition',
        'campaign-changed',
      );
  }
}
const envelope = (uid: string, campaignId: string, project: Project): C.CampaignNotesEnvelope => ({
  ownerId: uid,
  campaignId,
  schemaVersion: 1,
  campaignToken: project.token,
  collectionRevision: project.revision ?? 0,
});
function validateNote(note: StoredNote, uid: string, campaignId: string, project: Project) {
  if (
    note.ownerId !== uid ||
    note.campaignId !== campaignId ||
    note.schemaVersion !== 1 ||
    note.campaignToken !== project.token
  )
    fail('Identidade da nota inválida.');
}
const summary = (note: StoredNote): C.CampaignNoteSummary => ({
  id: note.id,
  title: note.title!,
  revision: note.revision,
  createdAt: note.createdAt,
  updatedAt: note.updatedAt,
});
const full = (note: StoredNote): C.CampaignNote => ({
  ...summary(note),
  ownerId: note.ownerId,
  campaignId: note.campaignId,
  schemaVersion: 1,
  content: note.content!,
});
const holds = new Map<string, Promise<void>>();
async function response<T>(
  uid: string,
  method: string,
  input: { campaignId: string; operationId: string },
  value: T,
): Promise<T> {
  const scope = key(uid, input.campaignId, input.operationId);
  if (sessionStorage.getItem('writer.visual.campaign-note-hold-response') === method) {
    sessionStorage.removeItem('writer.visual.campaign-note-hold-response');
    let pending = holds.get(scope);
    if (!pending) {
      pending = new Promise<void>((resolve) =>
        window.addEventListener(
          'writer.visual.release-campaign-note',
          () => {
            holds.delete(scope);
            resolve();
          },
          { once: true },
        ),
      );
      holds.set(scope, pending);
    }
    await pending;
  }
  if (sessionStorage.getItem('writer.visual.campaign-note-lost-response') === method) {
    sessionStorage.removeItem('writer.visual.campaign-note-lost-response');
    fail('A resposta se perdeu. Confirme o mesmo pedido.', 'unavailable');
  }
  // An HTTP response retains the original request identity even when the active browser UID changes.
  return budget(value);
}
function checkMutation(input: C.SaveCampaignNoteInput | C.DeleteCampaignNoteInput, method: string) {
  const fields = [
    'campaignId',
    'campaignToken',
    'noteId',
    'operationId',
    'expectedRevision',
    ...(method === 'saveCampaignNote' ? ['title', 'content'] : []),
  ];
  closed(input, fields);
  id(input.campaignId);
  id(input.noteId);
  id(input.operationId);
  token(input.campaignToken);
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0)
    fail('Revisão inválida.', 'invalid-argument');
  if (method === 'deleteCampaignNote' && input.expectedRevision === 0)
    fail('Revisão inválida.', 'invalid-argument');
  if (method === 'saveCampaignNote') {
    const save = input as C.SaveCampaignNoteInput;
    if (
      typeof save.title !== 'string' ||
      !save.title.trim() ||
      save.title.length > 300 ||
      typeof save.content !== 'string' ||
      save.content.length > 150000 ||
      new TextEncoder().encode(save.content).length > 512 * 1024
    )
      fail('Título ou texto da nota inválido.', 'invalid-argument');
    if (save.expectedRevision === 0 && save.noteId !== save.operationId)
      fail('A identidade da nova nota deve ser a operação.', 'invalid-argument');
  }
}
function receipt(
  data: Data,
  project: Project,
  uid: string,
  method: string,
  input: C.SaveCampaignNoteInput | C.DeleteCampaignNoteInput,
) {
  const receiptKey = key(uid, input.operationId),
    fingerprint = hash({ method, input }),
    previous = data.receipts[receiptKey],
    note = project.notes[input.noteId];
  if (previous) {
    if (
      previous.fingerprint !== fingerprint ||
      previous.campaignId !== input.campaignId ||
      previous.method !== method
    )
      fail('Pedido já utilizado com outros dados.', 'invalid-argument');
    if (previous.token !== project.token)
      fail('A campanha mudou.', 'failed-precondition', 'campaign-changed');
    if (!note || hash(note) !== previous.confirmedHash) conflict();
    validateNote(note, uid, input.campaignId, project);
    return { note, replayed: true, commit: () => undefined };
  }
  return {
    note,
    replayed: false,
    commit: (confirmed: StoredNote) => {
      data.receipts[receiptKey] = {
        campaignId: input.campaignId,
        token: project.token,
        method,
        noteId: confirmed.id,
        fingerprint,
        confirmedHash: hash(confirmed),
      };
      persist(data);
    },
  };
}
export function listCampaignNotes(input: C.ListCampaignNotesInput): Promise<C.CampaignNotesPage> {
  closed(input, ['campaignId', 'campaignToken', 'cursor', 'limit']);
  id(input.campaignId);
  const uid = fixtureOwner(),
    size = input.limit ?? 25;
  if (!Number.isInteger(size) || size < 1 || size > 50)
    fail('Página inválida.', 'invalid-argument');
  return server(uid, input.campaignId, 'listCampaignNotes', {}, (data, project) => {
    void data;
    expected(project, input.campaignToken);
    const scope = {
      uid,
      campaignId: input.campaignId,
      token: project.token,
      revision: project.revision ?? 0,
    };
    let cursor: { version: number; scope: unknown; date: number; id: string } | null = null;
    if (input.cursor) {
      try {
        cursor = JSON.parse(input.cursor) as {
          version: number;
          scope: unknown;
          date: number;
          id: string;
        };
      } catch {
        fail('Página inválida.', 'invalid-argument');
      }
      closed(cursor, ['version', 'scope', 'date', 'id']);
      if (
        !cursor ||
        cursor.version !== 1 ||
        !Number.isFinite(cursor.date) ||
        typeof cursor.id !== 'string'
      )
        fail('Página inválida.', 'invalid-argument');
      if (hash(cursor.scope) !== hash(scope))
        fail('A lista mudou. Recarregue as notas.', 'failed-precondition', 'cursor-invalidated');
    }
    const notes = Object.values(project.notes)
      .filter((note) => !note.deleted)
      .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
    for (const note of notes) validateNote(note, uid, input.campaignId, project);
    const rows = cursor
      ? notes.filter(
          (note) =>
            note.createdAt < cursor.date || (note.createdAt === cursor.date && note.id > cursor.id),
        )
      : notes;
    const page = rows.slice(0, size),
      last = page.at(-1);
    return budget({
      ...envelope(uid, input.campaignId, project),
      items: page.map(summary),
      nextCursor:
        rows.length > size && last
          ? JSON.stringify({ version: 1, scope, date: last.createdAt, id: last.id })
          : null,
    });
  });
}
export function getCampaignNote(input: C.GetCampaignNoteInput): Promise<C.CampaignNoteResult> {
  closed(input, ['campaignId', 'campaignToken', 'noteId']);
  id(input.campaignId);
  id(input.noteId);
  token(input.campaignToken);
  const uid = fixtureOwner();
  return server(uid, input.campaignId, 'getCampaignNote', input, (data, project) => {
    void data;
    expected(project, input.campaignToken);
    const note = project.notes[input.noteId];
    if (note) validateNote(note, uid, input.campaignId, project);
    return budget({
      ...envelope(uid, input.campaignId, project),
      note: note && !note.deleted ? full(note) : null,
    });
  });
}
export async function saveCampaignNote(
  input: C.SaveCampaignNoteInput,
): Promise<C.SavedCampaignNote> {
  checkMutation(input, 'saveCampaignNote');
  const uid = fixtureOwner();
  const value = await server(uid, input.campaignId, 'saveCampaignNote', input, (data, project) => {
    expected(project, input.campaignToken);
    const operation = receipt(data, project, uid, 'saveCampaignNote', input);
    if (operation.replayed)
      return { ...envelope(uid, input.campaignId, project), note: full(operation.note) };
    let old = operation.note;
    if (old) validateNote(old, uid, input.campaignId, project);
    if (
      sessionStorage.getItem('writer.visual.campaign-note-conflict') === input.noteId &&
      old &&
      !old.deleted
    ) {
      sessionStorage.removeItem('writer.visual.campaign-note-conflict');
      old = {
        ...old,
        revision: old.revision + 1,
        title: 'Nota alterada em outro dispositivo',
        updatedAt: old.updatedAt + 1,
      };
      project.notes[input.noteId] = old;
      project.revision = (project.revision ?? 0) + 1;
      persist(data);
    }
    if (
      old?.deleted ||
      (!old && input.expectedRevision !== 0) ||
      (old && old.revision !== input.expectedRevision)
    )
      conflict();
    const time = Math.max(FIXTURE_TIME + (project.revision ?? 0) + 1, (old?.updatedAt ?? 0) + 1);
    const note: StoredNote = {
      id: input.noteId,
      ownerId: uid,
      campaignId: input.campaignId,
      schemaVersion: 1,
      campaignToken: project.token,
      revision: (old?.revision ?? 0) + 1,
      title: input.title.trim(),
      content: input.content,
      createdAt: old?.createdAt ?? time,
      updatedAt: time,
      deleted: false,
    };
    project.notes[input.noteId] = note;
    project.revision = (project.revision ?? 0) + 1;
    operation.commit(note);
    return { ...envelope(uid, input.campaignId, project), note: full(note) };
  });
  return response(uid, 'saveCampaignNote', input, value);
}
export async function deleteCampaignNote(
  input: C.DeleteCampaignNoteInput,
): Promise<C.CampaignNoteDeleted> {
  checkMutation(input, 'deleteCampaignNote');
  const uid = fixtureOwner();
  const value = await server(
    uid,
    input.campaignId,
    'deleteCampaignNote',
    input,
    (data, project) => {
      expected(project, input.campaignToken);
      const operation = receipt(data, project, uid, 'deleteCampaignNote', input),
        old = operation.note;
      if (operation.replayed)
        return {
          ...envelope(uid, input.campaignId, project),
          noteId: old.id,
          revision: old.revision,
          deleted: true as const,
        };
      if (!old) fail('Nota indisponível.', 'not-found');
      validateNote(old, uid, input.campaignId, project);
      if (old.deleted || old.revision !== input.expectedRevision) conflict();
      const tombstone: StoredNote = {
        id: old.id,
        ownerId: uid,
        campaignId: input.campaignId,
        schemaVersion: 1,
        campaignToken: project.token,
        revision: old.revision + 1,
        createdAt: old.createdAt,
        updatedAt: Math.max(FIXTURE_TIME + (project.revision ?? 0) + 1, old.updatedAt + 1),
        deleted: true,
      };
      project.notes[input.noteId] = tombstone;
      project.revision = (project.revision ?? 0) + 1;
      operation.commit(tombstone);
      return {
        ...envelope(uid, input.campaignId, project),
        noteId: old.id,
        revision: tombstone.revision,
        deleted: true as const,
      };
    },
  );
  return response(uid, 'deleteCampaignNote', input, value);
}
