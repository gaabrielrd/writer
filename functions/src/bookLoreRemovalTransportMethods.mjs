// Browser-safe wire names; removal never widens existing edition journals.
export const BOOK_LORE_REMOVAL_CALLABLE = 'bookLoreRemoval';
const route = (key, prefix, methods) =>
  Object.freeze({ key, prefix, methods: Object.freeze(methods) });
export const BOOK_LORE_REMOVAL_ROUTES = Object.freeze([
  route('inspectionId', 'lore-removal-source', [
    'startBookLoreSourceInspection',
    'getBookLoreSourceInspection',
    'advanceBookLoreSourceInspection',
    'cancelBookLoreSourceInspection',
  ]),
  route('removalId', 'lore-removal', [
    'startBookLoreRemoval',
    'getBookLoreRemoval',
    'advanceBookLoreRemoval',
  ]),
]);
