export const BOOK_LORE_EDIT_CALLABLE: 'bookLoreEdit';
export const BOOK_LORE_EDIT_ROUTES: readonly {
  readonly key: 'inspectionId' | 'uploadId' | 'editId';
  readonly prefix: 'lore-source' | 'lore-field' | 'lore-edit';
  readonly methods: readonly string[];
}[];
export const BOOK_LORE_CREATION_ROUTE: {
  readonly key: 'creationId';
  readonly prefix: 'lore-creation';
  readonly methods: readonly string[];
};
export const BOOK_LORE_MANUAL_ROUTES: readonly (
  typeof BOOK_LORE_CREATION_ROUTE | (typeof BOOK_LORE_EDIT_ROUTES)[number]
)[];
