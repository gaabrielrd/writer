import {
  getNarrativeContext,
  getNarrativeItem,
  listNarrativeItems,
  listNarrativeReferences,
  narrativeSource,
  type NarrativeItem,
  type NarrativePage,
  type NarrativeReference,
  type NarrativeResource,
  type NarrativeSource,
  type NarrativeTarget,
} from '@/features/narrative-planning';

type PortableItem<T extends NarrativeItem> = Omit<
  T,
  'ownerId' | 'deleting' | 'deletionOperationId' | 'referenceCount'
> & { references: NarrativeReference[] };
export interface NarrativeBookBackup {
  schemaVersion: 1;
  projectRevision: number;
  sceneRevision: number;
  arcs: PortableItem<Extract<NarrativeItem, { kind: 'arc' }>>[];
  milestones: PortableItem<Extract<NarrativeItem, { kind: 'milestone' }>>[];
  events: PortableItem<Extract<NarrativeItem, { kind: 'event' }>>[];
}

const changed = () =>
  new Error('O planejamento mudou durante o backup. Atualize e tente novamente.');

/** Capture only portable author data; labels from unavailable origins are never copied. */
export async function captureNarrativeBookBackup(
  bookId: string,
  expectedProjectRevision: number,
  expectedSceneRevision: number,
  signal?: AbortSignal,
): Promise<NarrativeBookBackup> {
  const target: NarrativeTarget = { kind: 'book', id: bookId };
  const assertContext = async () => {
    signal?.throwIfAborted();
    const context = await getNarrativeContext({ target });
    if (
      !context ||
      !context.hasResources ||
      context.projectRevision !== expectedProjectRevision ||
      context.sceneRevision !== expectedSceneRevision
    )
      throw changed();
  };
  const assertPage = <T>(page: NarrativePage<T>) => {
    signal?.throwIfAborted();
    if (
      page.projectRevision !== expectedProjectRevision ||
      page.sceneRevision !== expectedSceneRevision
    )
      throw changed();
  };
  const readPages = async <T>(read: (cursor: string | null) => Promise<NarrativePage<T>>) => {
    const items: T[] = [];
    const cursors = new Set<string>();
    let cursor: string | null = null;
    do {
      const page = await read(cursor);
      assertPage(page);
      items.push(...page.items);
      cursor = page.nextCursor;
      if (cursor && cursors.has(cursor)) throw changed();
      if (cursor) cursors.add(cursor);
    } while (cursor);
    return items;
  };
  const references = async (source: NarrativeSource): Promise<NarrativeReference[]> => {
    const items = await readPages((cursor) =>
      listNarrativeReferences({ target, source, cursor, limit: 50 }),
    );
    const ids = new Set<string>();
    return items.map((link) => {
      if (ids.has(link.id)) throw changed();
      ids.add(link.id);
      const ref = link.reference;
      // Deliberate whitelist: no resolved names, URLs, UID, index or operation metadata.
      return ref.kind === 'lore'
        ? {
            kind: 'lore',
            reference: {
              kind: ref.reference.kind,
              scopeId: ref.reference.scopeId,
              entityId: ref.reference.entityId,
            },
          }
        : ref.kind === 'scene'
          ? { kind: 'scene', sceneId: ref.sceneId }
          : { kind: 'event', eventId: ref.eventId };
    });
  };
  const backup: NarrativeBookBackup = {
    schemaVersion: 1,
    projectRevision: expectedProjectRevision,
    sceneRevision: expectedSceneRevision,
    arcs: [],
    milestones: [],
    events: [],
  };
  const readResource = async (resource: NarrativeResource) => {
    const summaries = await readPages((cursor) =>
      listNarrativeItems({ target, resource, cursor, limit: 50 }),
    );
    const ids = new Set<string>();
    for (const summary of summaries) {
      if (summary.deleting)
        throw new Error('Conclua a remoção dos itens narrativos antes de fazer o backup.');
      if (ids.has(summary.id)) throw changed();
      ids.add(summary.id);
      const source = narrativeSource(summary);
      const item = await getNarrativeItem({ target, source });
      if (
        !item ||
        item.deleting ||
        item.id !== summary.id ||
        item.revision !== summary.revision ||
        item.kind !== resource.kind ||
        (item.kind === 'milestone' &&
          (resource.kind !== 'milestone' || item.arcId !== resource.arcId))
      )
        throw changed();
      const links = await references(source);
      if (links.length !== item.referenceCount) throw changed();
      const base = {
        id: item.id,
        schemaVersion: item.schemaVersion,
        revision: item.revision,
        title: item.title,
        rank: item.rank,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        references: links,
      };
      if (item.kind === 'arc') {
        backup.arcs.push({
          ...base,
          kind: 'arc',
          initialState: item.initialState,
          objective: item.objective,
          plannedOutcome: item.plannedOutcome,
        });
      } else if (item.kind === 'event') {
        backup.events.push({
          ...base,
          kind: 'event',
          description: item.description,
          dateLabel: item.dateLabel,
        });
      } else {
        backup.milestones.push({
          ...base,
          kind: 'milestone',
          arcId: item.arcId,
          notes: item.notes,
        });
      }
    }
  };
  await assertContext();
  await readResource({ kind: 'arc' });
  for (const arc of backup.arcs) await readResource({ kind: 'milestone', arcId: arc.id });
  await readResource({ kind: 'event' });
  await assertContext();
  return backup;
}
