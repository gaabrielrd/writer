import { LORE_CATEGORIES, type LoreCategory } from '../model/loreEntity';
import type { BookLoreSummary } from '../model/bookLorePresentation';
import { invalidLoreRead, readCount, readList, readObject } from './bookLoreReadContracts';

export function readBookLoreSummaryPage(value: unknown, bookId: string, token?: string) {
  const page = readObject(value, ['schemaVersion', 'bookId', 'listToken', 'items', 'nextCursor']);
  if (page.schemaVersion !== 2 || !Array.isArray(page.items)) throw invalidLoreRead();
  const rows: BookLoreSummary[] = page.items.map((value) => {
    const row = readObject(value, [
      'id',
      'readToken',
      'name',
      'category',
      'aliases',
      'summary',
      'isPublic',
      'relationCount',
    ]);
    if (
      typeof row.name !== 'string' ||
      typeof row.summary !== 'string' ||
      !LORE_CATEGORIES.some((c) => c.value === row.category) ||
      !Array.isArray(row.aliases) ||
      row.aliases.some((a) => typeof a !== 'string') ||
      typeof row.isPublic !== 'boolean'
    )
      throw invalidLoreRead();
    return {
      bookId,
      id: row.id as string,
      sourceToken: row.readToken as string,
      name: row.name,
      category: row.category as LoreCategory,
      aliases: [...(row.aliases as string[])],
      summary: row.summary,
      isPublic: row.isPublic,
      relationCount: readCount(row.relationCount),
    };
  });
  const metadata = readList(
    {
      ...page,
      schemaVersion: 1,
      items: rows.map((row) => ({ id: row.id, readToken: row.sourceToken })),
    },
    bookId,
    token,
  );
  return { ...metadata, rows };
}
