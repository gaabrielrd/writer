import type {
  PublicBook,
  PublicChapter,
  PublicLoreEntity,
  ReaderGuideBoundary,
} from './publicBook';
const boundary = (
  raw: unknown,
  book: PublicBook,
  chapters: ReadonlySet<string>,
): ReaderGuideBoundary | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  return Object.keys(v).sort().join(',') === 'bookId,chapterId,revisionId,version' &&
    v.version === 1 &&
    v.bookId === book.id &&
    v.revisionId === book.revisionId &&
    typeof v.chapterId === 'string' &&
    chapters.has(v.chapterId)
    ? { version: 1, bookId: book.id, revisionId: book.revisionId, chapterId: v.chapterId }
    : null;
};
const text = (raw: unknown, max: number, empty = false): raw is string =>
  typeof raw === 'string' && raw.length <= max && (empty || !!raw.trim());
const certain = (raw: unknown): raw is 'fact' | 'uncertain' =>
  raw === 'fact' || raw === 'uncertain';
export function parseReaderGuideFields(
  book: PublicBook,
  chapters: readonly PublicChapter[],
  data: Record<string, unknown>,
): Pick<
  PublicLoreEntity,
  'readerGuide' | 'certainty' | 'disambiguation' | 'facts' | 'relationships' | 'appearances'
> | null {
  const ids = new Set(chapters.map((chapter) => chapter.id)),
    reveal = boundary(data.readerGuide, book, ids);
  if (
    !reveal ||
    !certain(data.certainty) ||
    !text(data.disambiguation, 140, true) ||
    !Array.isArray(data.facts) ||
    data.facts.length > 12 ||
    !Array.isArray(data.relationships) ||
    data.relationships.length > 12 ||
    !Array.isArray(data.appearances) ||
    data.appearances.length > 24
  )
    return null;
  const facts: NonNullable<PublicLoreEntity['facts']> = [],
    relationships: NonNullable<PublicLoreEntity['relationships']> = [],
    appearances: NonNullable<PublicLoreEntity['appearances']> = [];
  for (const raw of data.facts) {
    if (!raw || typeof raw !== 'object') return null;
    const v = raw as Record<string, unknown>,
      r = boundary(v.readerGuide, book, ids);
    if (!r || !text(v.text, 300) || !certain(v.certainty)) return null;
    facts.push({ text: v.text, certainty: v.certainty, readerGuide: r });
  }
  for (const raw of data.relationships) {
    if (!raw || typeof raw !== 'object') return null;
    const v = raw as Record<string, unknown>,
      r = boundary(v.readerGuide, book, ids);
    if (!r || !text(v.targetId, 1500) || !text(v.description, 300) || !certain(v.certainty))
      return null;
    relationships.push({
      targetId: v.targetId,
      description: v.description,
      certainty: v.certainty,
      readerGuide: r,
    });
  }
  for (const raw of data.appearances) {
    if (!raw || typeof raw !== 'object') return null;
    const v = raw as Record<string, unknown>,
      r = boundary(v.readerGuide, book, ids);
    if (!r || !['direct', 'document', 'mention', 'uncertain'].includes(String(v.kind))) return null;
    appearances.push({
      kind: v.kind as 'direct' | 'document' | 'mention' | 'uncertain',
      readerGuide: r,
    });
  }
  return {
    readerGuide: reveal,
    certainty: data.certainty,
    disambiguation: data.disambiguation,
    facts,
    relationships,
    appearances,
  };
}
export function visibleReaderGuide(
  book: PublicBook,
  chapters: readonly PublicChapter[],
  entities: readonly PublicLoreEntity[],
  throughChapterId: string,
): PublicLoreEntity[] {
  if (book.readerGuideVersion !== 1) return entities.filter((entity) => entity.isPublic);
  const positions = new Map(chapters.map((chapter, index) => [chapter.id, index])),
    through = positions.get(throughChapterId);
  if (through === undefined) return [];
  const unlocked = (r: ReaderGuideBoundary | undefined) =>
    !!r &&
    r.version === 1 &&
    r.bookId === book.id &&
    r.revisionId === book.revisionId &&
    positions.has(r.chapterId) &&
    (positions.get(r.chapterId) ?? Infinity) <= through;
  const visible = entities.filter((entity) => entity.isPublic && unlocked(entity.readerGuide)),
    byId = new Map(visible.map((entity) => [entity.id, entity]));
  return visible.map((entity) => ({
    ...entity,
    facts: entity.facts?.filter((fact) => unlocked(fact.readerGuide)),
    relationships: entity.relationships
      ?.filter((relation) => unlocked(relation.readerGuide) && byId.has(relation.targetId))
      .map((relation) => {
        const target = byId.get(relation.targetId)!;
        return {
          ...relation,
          targetName: target.name + (target.disambiguation ? ' · ' + target.disambiguation : ''),
        };
      }),
    appearances: entity.appearances
      ?.filter((appearance) => unlocked(appearance.readerGuide))
      .map((appearance) => ({
        ...appearance,
        chapterTitle: chapters.find((chapter) => chapter.id === appearance.readerGuide.chapterId)
          ?.title,
      })),
  }));
}
