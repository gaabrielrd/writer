// Pure wire contract: safe to import in the browser without Admin or Node APIs.
export const BOOK_LORE_EDIT_CALLABLE = 'bookLoreEdit';
const route = (key, prefix, methods) =>
  Object.freeze({ key, prefix, methods: Object.freeze(methods) });
export const BOOK_LORE_CREATION_ROUTE = route('creationId', 'lore-creation', [
  'startBookLoreCreationReservation',
  'getBookLoreCreationReservation',
  'cancelBookLoreCreationReservation',
  'advanceBookLoreCreationCleanup',
]);
// Existing edit journals intentionally retain their original closed method set.
export const BOOK_LORE_EDIT_ROUTES = Object.freeze([
  route('inspectionId', 'lore-source', [
    'startBookLoreSourceInspection',
    'getBookLoreSourceInspection',
    'advanceBookLoreSourceInspection',
    'cancelBookLoreSourceInspection',
  ]),
  route('uploadId', 'lore-field', [
    'startBookLoreFieldUpload',
    'getBookLoreFieldUpload',
    'appendBookLoreFieldUpload',
    'advanceBookLoreFieldSeal',
    'cancelBookLoreFieldUpload',
    'advanceBookLoreFieldCleanup',
  ]),
  route('editId', 'lore-edit', [
    'startBookLoreEditReservation',
    'getBookLoreEditReservation',
    'initializeBookLoreEditGeneration',
    'reserveBookLoreEditUpload',
    'advanceBookLoreEditCompilation',
    'adoptBookLoreEditGeneration',
    'cancelBookLoreEditReservation',
    'advanceBookLoreEditReservationCleanup',
  ]),
]);

export const BOOK_LORE_MANUAL_ROUTES = Object.freeze([
  BOOK_LORE_CREATION_ROUTE,
  ...BOOK_LORE_EDIT_ROUTES,
]);
