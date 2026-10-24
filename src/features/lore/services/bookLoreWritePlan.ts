import { bookContentId } from '../../../../functions/src/bookBackupSchema.mjs';
import { loreReadFields, readHash, type LoreReadField } from './bookLoreReadContracts';

export interface BookLoreEditSource {
  readonly bookId: string;
  readonly id: string;
  readonly sourceToken: string;
  readonly data: Readonly<Record<string, unknown>>;
}
export type BookLoreEditChange =
  | { field: LoreReadField | 'relations'; value: unknown }
  | { field: LoreReadField | 'relations'; remove: true };
export type BookLoreUploadTarget =
  | { readonly field: LoreReadField }
  | { readonly field: 'relations'; readonly page: number; readonly count: number };
export interface BookLorePlannedUpload {
  readonly target: BookLoreUploadTarget;
  readonly value: unknown;
}
export interface BookLoreEditPlan {
  readonly bookId: string;
  readonly loreId: string;
  readonly sourceToken: string;
  readonly fields: readonly (
    | { readonly field: LoreReadField; readonly remove: true }
    | { readonly field: LoreReadField; readonly upload: number }
  )[];
  readonly relations: { readonly present: boolean; readonly count: number } | null;
  readonly uploads: readonly BookLorePlannedUpload[];
  readonly empty: boolean;
}
export function invalidLoreEdit(): never {
  throw new Error('Não foi possível preparar a edição literal do lore. Reabra a ficha.');
}
const plain = (v: unknown): v is Record<string, unknown> =>
  v !== null &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;
const text = (v: unknown): v is string =>
  typeof v === 'string' &&
  !/(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/u.test(v);
const keys = (
  v: unknown,
  required: string[],
  optional: readonly string[] = [],
): Record<string, unknown> => {
  if (
    !plain(v) ||
    required.some((k) => !Object.hasOwn(v, k)) ||
    Object.keys(v).some((k) => !required.includes(k) && !optional.includes(k))
  )
    invalidLoreEdit();
  return v;
};
/** Clone only data properties; never invoke getters/toJSON or retain mutable editor input. */
export function freezeLoreEditValue(value: unknown, depth = 0): unknown {
  if (text(value) || typeof value === 'boolean' || value === null) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (depth > 8 || (!plain(value) && !Array.isArray(value))) invalidLoreEdit();
  if (Object.getOwnPropertySymbols(value as object).length) invalidLoreEdit();
  const descriptors = Object.getOwnPropertyDescriptors(value as object);
  if (Array.isArray(value)) {
    if (
      Object.getPrototypeOf(value) !== Array.prototype ||
      Object.keys(descriptors).length !== value.length + 1
    )
      invalidLoreEdit();
    const result = [];
    for (let i = 0; i < value.length; i++) {
      const entry = descriptors[String(i)];
      if (!entry || !entry.enumerable || !Object.hasOwn(entry, 'value')) invalidLoreEdit();
      result.push(freezeLoreEditValue(entry.value, depth + 1));
    }
    return Object.freeze(result);
  }
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(descriptors)) {
    if (!entry.enumerable || !Object.hasOwn(entry, 'value')) invalidLoreEdit();
    Object.defineProperty(result, key, {
      value: freezeLoreEditValue(entry.value, depth + 1),
      enumerable: true,
    });
  }
  return Object.freeze(result);
}
const assertText = (v: unknown) => {
  if (!text(v)) invalidLoreEdit();
};
const count = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
function validateData(data: unknown) {
  const d = keys(
    data,
    ['name', 'category'],
    [...loreReadFields, 'relations', 'createdAt', 'updatedAt'],
  );
  assertText(d.name);
  if (!['character', 'location', 'concept', 'other'].includes(d.category as string))
    invalidLoreEdit();
  for (const field of ['summary', 'details']) if (Object.hasOwn(d, field)) assertText(d[field]);
  if (Object.hasOwn(d, 'isPublic') && typeof d.isPublic !== 'boolean') invalidLoreEdit();
  if (Object.hasOwn(d, 'aliases')) {
    if (!Array.isArray(d.aliases)) invalidLoreEdit();
    (d.aliases as unknown[]).forEach(assertText);
  }
  if (Object.hasOwn(d, 'structuredDetails'))
    Object.values(
      keys(d.structuredDetails, [], ['appearance', 'personality', 'history', 'notes']),
    ).forEach(assertText);
  for (const field of ['createdAt', 'updatedAt'])
    if (Object.hasOwn(d, field)) {
      const value = d[field];
      if (!count(value) || !Number.isFinite(new Date(value).getTime())) invalidLoreEdit();
    }
  if (Object.hasOwn(d, 'relations')) {
    if (!Array.isArray(d.relations)) invalidLoreEdit();
    for (const value of d.relations as unknown[]) {
      const r = keys(value, ['targetEntityId', 'relationType'], ['description']);
      assertText(r.targetEntityId);
      assertText(r.relationType);
      const qualified = /^(adventure|universe):([^:]+):(.+)$/u.exec(r.targetEntityId as string);
      if (qualified) {
        bookContentId(qualified[2]);
        bookContentId(qualified[3]);
      } else bookContentId(r.targetEntityId);
      if (Object.hasOwn(r, 'description')) assertText(r.description);
    }
  }
}
/** In-memory observed CAS only. The server independently reauthorizes every operation. */
export function freezeBookLoreEditSource(input: unknown): BookLoreEditSource {
  const source = keys(freezeLoreEditValue(input), ['bookId', 'id', 'sourceToken', 'data']);
  bookContentId(source.bookId);
  bookContentId(source.id);
  readHash(source.sourceToken);
  validateData(source.data);
  return source as unknown as BookLoreEditSource;
}
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => same(v, b[i]));
  if (plain(a) && plain(b)) {
    const names = Object.keys(a);
    return (
      names.length === Object.keys(b).length &&
      names.every((k) => Object.hasOwn(b, k) && same(a[k], b[k]))
    );
  }
  return false;
}
/** Explicit touched fields only; normalized UI models are not an edit source. */
export function planBookLoreEdit(
  input: BookLoreEditSource,
  inputChanges: readonly BookLoreEditChange[],
): BookLoreEditPlan {
  const source = freezeBookLoreEditSource(input),
    changes = freezeLoreEditValue(inputChanges);
  if (!Array.isArray(changes)) invalidLoreEdit();
  const seen = new Set<string>(),
    after: Record<string, unknown> = { ...source.data };
  for (const change of changes as unknown[]) {
    const c = keys(change, ['field'], ['value', 'remove']),
      field = c.field;
    if (
      typeof field !== 'string' ||
      ![...loreReadFields, 'relations'].includes(field) ||
      seen.has(field) ||
      Object.hasOwn(c, 'value') === Object.hasOwn(c, 'remove') ||
      (Object.hasOwn(c, 'remove') && c.remove !== true)
    )
      invalidLoreEdit();
    seen.add(field);
    if (Object.hasOwn(c, 'remove')) {
      if (field === 'name' || field === 'category') invalidLoreEdit();
      delete after[field];
    } else after[field] = c.value;
  }
  validateData(after);
  const fields: BookLoreEditPlan['fields'][number][] = [],
    uploads: BookLorePlannedUpload[] = [];
  for (const field of loreReadFields) {
    if (!seen.has(field)) continue;
    const beforePresent = Object.hasOwn(source.data, field),
      present = Object.hasOwn(after, field);
    if (beforePresent === present && (!present || same(source.data[field], after[field]))) continue;
    if (!present) fields.push(Object.freeze({ field, remove: true }));
    else {
      fields.push(Object.freeze({ field, upload: uploads.length }));
      uploads.push(Object.freeze({ target: Object.freeze({ field }), value: after[field] }));
    }
  }
  let relations: BookLoreEditPlan['relations'] = null;
  if (seen.has('relations')) {
    const beforePresent = Object.hasOwn(source.data, 'relations'),
      present = Object.hasOwn(after, 'relations'),
      old = (source.data.relations ?? []) as unknown[],
      next = (after.relations ?? []) as unknown[];
    if (beforePresent !== present || !same(old, next)) {
      relations = Object.freeze({ present, count: next.length });
      for (let page = 0; page < Math.ceil(next.length / 64); page++) {
        const value = next.slice(page * 64, (page + 1) * 64),
          previous = old.slice(page * 64, (page + 1) * 64);
        if (same(value, previous)) continue;
        uploads.push(
          Object.freeze({
            target: Object.freeze({ field: 'relations', page, count: value.length }),
            value: Object.freeze(value),
          }),
        );
      }
    }
  }
  return Object.freeze({
    bookId: source.bookId,
    loreId: source.id,
    sourceToken: source.sourceToken,
    fields: Object.freeze(fields),
    relations,
    uploads: Object.freeze(uploads),
    empty: fields.length === 0 && relations === null,
  });
}

/** Validate one field/page without allocating a full UTF-8 encoding of its text. */
export function freezeBookLoreUpload(input: BookLorePlannedUpload): BookLorePlannedUpload {
  const upload = keys(freezeLoreEditValue(input), ['target', 'value']),
    target = keys(upload.target, ['field'], ['page', 'count']);
  if (target.field === 'relations') {
    keys(target, ['field', 'page', 'count']);
    if (
      !count(target.page) ||
      !count(target.count) ||
      target.count < 1 ||
      target.count > 64 ||
      !Array.isArray(upload.value) ||
      upload.value.length !== target.count
    )
      invalidLoreEdit();
    validateData({ name: '', category: 'other', relations: upload.value });
  } else {
    keys(target, ['field']);
    if (!loreReadFields.includes(target.field as LoreReadField)) invalidLoreEdit();
    validateData({ name: '', category: 'other', [target.field as string]: upload.value });
  }
  return upload as unknown as BookLorePlannedUpload;
}
