import { sourceInspectionFixture } from './bookLoreSourceInspectionFixture.mjs';
import { removalFixture } from './bookLoreRemovalFixture.mjs';

/** All original sources are inspected before any selected fiche is withdrawn. */
export async function tokenSelectionFixture(db, { count = 3, tokenVersion = 2 } = {}) {
  const members = [];
  for (let i = 0; i < count; i++) {
    const id = 'selected-' + String(i).padStart(3, '0'),
      source = await sourceInspectionFixture(db, {
        id,
        mode: 'inline',
        tokenVersion,
        inspectionId: 'inspection-' + id,
        data: { name: id, category: 'other', isPublic: i === 0, updatedAt: 1000 },
      });
    members.push(await removalFixture(db, { source, removalId: 'remove-' + id }));
  }
  return { db, uid: 'author', bookId: 'book', members };
}
