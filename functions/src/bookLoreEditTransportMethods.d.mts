export const BOOK_LORE_EDIT_CALLABLE: 'bookLoreEdit';
export const BOOK_LORE_EDIT_ROUTES: readonly {
  readonly key: 'inspectionId' | 'uploadId' | 'editId';
  readonly prefix: 'lore-source' | 'lore-field' | 'lore-edit';
  readonly methods: readonly string[];
}[];
