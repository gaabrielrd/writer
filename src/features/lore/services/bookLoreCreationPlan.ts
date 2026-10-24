import { readObject, readId, loreReadFields } from './bookLoreReadContracts';
import { freezeLoreEditValue, freezeBookLoreCreationData } from './bookLoreWritePlan';
import {
  bookLoreWriteHash as hash,
  prepareBookLoreWritePayload,
  type BookLoreWriteOptions,
} from './bookLoreWritePayload';

export interface BookLoreCreationInput {
  readonly uid: string;
  readonly writeId: string;
  readonly bookId: string;
  readonly data: Readonly<Record<string, unknown>>;
}
/** Immutable input is captured before hashing yields; no server access. */
export async function prepareBookLoreCreationPlan(
  input: BookLoreCreationInput,
  options: BookLoreWriteOptions,
) {
  const value = readObject(freezeLoreEditValue(input), ['uid', 'writeId', 'bookId', 'data']);
  const uid = readId(value.uid),
    writeId = readId(value.writeId),
    bookId = readId(value.bookId);
  if (uid.length > 128) throw Error('Conta inválida.');
  const data = freezeBookLoreCreationData(value.data);
  const creationId =
    'lore-creation-' + hash({ domain: 'writer-book-lore-creation-client', uid, bookId, writeId });
  const intent = Object.freeze({ bookId, creationId });
  const loreId = 'lore-' + hash({ domain: 'book-lore-creation-id', uid, intent });
  const identity = { uid, writeId, bookId, loreId };
  const derived = (kind: string, index = 0) =>
    kind + '-' + hash({ domain: 'writer-book-lore-client-job', ...identity, kind, index });
  const fields: { field: (typeof loreReadFields)[number]; upload: number }[] = [];
  const planned: {
    target:
      | { field: (typeof loreReadFields)[number] }
      | { field: 'relations'; page: number; count: number };
    value: unknown;
  }[] = [];
  for (const field of loreReadFields)
    if (Object.hasOwn(data, field)) {
      fields.push({ field, upload: planned.length });
      planned.push({ target: { field }, value: data[field] });
    }
  const relations = {
    present: Object.hasOwn(data, 'relations'),
    count: ((data.relations ?? []) as unknown[]).length,
  };
  for (let page = 0; page < Math.ceil(relations.count / 64); page++) {
    const values = (data.relations as unknown[]).slice(page * 64, (page + 1) * 64);
    planned.push({ target: { field: 'relations', page, count: values.length }, value: values });
  }
  const uploads = [];
  for (const [index, item] of planned.entries()) {
    const id = derived('lore-field', index);
    const codec = await prepareBookLoreWritePayload(
      { uid, bookId, loreId, uploadId: id, ...item },
      options,
    );
    uploads.push({ id, codec, target: codec.target, manifest: codec.manifest });
  }
  return {
    ...identity,
    creationId,
    intent,
    fields,
    relations,
    uploads,
    editId: derived('lore-edit'),
    startHash: hash({ domain: 'book-lore-creation-start', intent }),
    intentHash: hash({
      domain: 'writer-book-lore-creation-intent',
      ...identity,
      creationId,
      fields,
      relations,
      uploads: uploads.map((u) => ({ target: u.target, manifest: u.manifest })),
    }),
  };
}
