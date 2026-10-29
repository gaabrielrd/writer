import { workFail } from './workProgressContracts.mjs';

export const PORTABLE_VARIANT_BODY_CODEC = 'portable-relations-v1';
const bad = () =>
  workFail('failed-precondition', 'O corpo portátil da variante está inconsistente.');
const limit = () =>
  workFail(
    'failed-precondition',
    'A ficha com as relações preservadas ultrapassa 50 relações ou 900.000 bytes. Nenhum conteúdo foi truncado.',
  );
const closed = (v, names) =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).length === names.length &&
  names.every((name) => Object.hasOwn(v, name));
const opaque = (r) => r.available === false;

/** Serialization metadata only: ownership, source and storage authorization remain mandatory. */
export function variantBodyCodec(record) {
  if (!Object.hasOwn(record, 'bodyCodec')) return undefined;
  const mode = record.mode === 'removed' ? record.previousMode : record.mode;
  if (record.bodyCodec !== PORTABLE_VARIANT_BODY_CODEC || mode !== 'override') bad();
  return record.bodyCodec;
}
function portable(value, key, validate) {
  if (!value || !Array.isArray(value.relations) || value.relations.length > 50) bad();
  const known = [];
  for (const r of value.relations) {
    if (r?.available === false) {
      if (
        !closed(r, ['targetKey', 'available']) ||
        typeof r.targetKey !== 'string' ||
        !/^[a-f0-9]{64}$/.test(r.targetKey) ||
        r.targetKey === key
      )
        bad();
    } else if (r?.available === true) {
      if (!closed(r, ['targetKey', 'relationType', 'description', 'available'])) bad();
      known.push({
        targetKey: r.targetKey,
        relationType: r.relationType,
        description: r.description,
      });
    } else bad();
  }
  const native = validate({ ...value, relations: known }, key);
  let index = 0;
  const canonical = {
    ...native,
    relations: value.relations.map((r) =>
      opaque(r)
        ? { targetKey: r.targetKey, available: false }
        : { ...native.relations[index++], available: true },
    ),
  };
  if (Buffer.byteLength(JSON.stringify(canonical)) > 900000) limit();
  return canonical;
}
/** Native validation is injected to avoid a cycle with the C2 contracts. */
export function parseVariantBody(content, record, validate) {
  const codec = variantBodyCodec(record);
  let value;
  try {
    value = JSON.parse(content);
  } catch {
    bad();
  }
  const canonical = codec
    ? portable(value, record.sourceKey, validate)
    : validate(value, record.sourceKey);
  if (JSON.stringify(canonical) !== content) bad();
  if (!codec) return canonical;
  return {
    ...canonical,
    relations: canonical.relations.map((r) => {
      if (opaque(r)) return r;
      return { targetKey: r.targetKey, relationType: r.relationType, description: r.description };
    }),
  };
}
export function serializeVariantBody(entity, key, codec, validate) {
  if (codec === undefined) return JSON.stringify(entity);
  if (codec !== PORTABLE_VARIANT_BODY_CODEC) bad();
  return JSON.stringify(
    portable(
      {
        ...entity,
        relations: entity.relations.map((r) => (opaque(r) ? r : { ...r, available: true })),
      },
      key,
      validate,
    ),
  );
}
/** Incoming descriptors already passed native validation and current target authorization. */
export function mergeVariantRelations(incoming, previous) {
  const relations = [],
    explicit = new Set(),
    known = new Map();
  const descriptor = (r) => JSON.stringify([r.targetKey, r.relationType, r.description]);
  for (const old of previous.relations)
    if (!opaque(old)) known.set(descriptor(old), (known.get(descriptor(old)) ?? 0) + 1);
  for (const r of incoming.relations) {
    const token = descriptor(r),
      count = known.get(token) ?? 0;
    if (count) known.set(token, count - 1);
    else explicit.add(r.targetKey);
  }
  let cursor = 0;
  for (const old of previous.relations) {
    if (opaque(old)) {
      if (!explicit.has(old.targetKey))
        relations.push({ targetKey: old.targetKey, available: false });
    } else {
      const next = incoming.relations.findIndex(
        (r, i) =>
          i >= cursor && r.targetKey === old.targetKey && r.relationType === old.relationType,
      );
      while (cursor <= next) relations.push(incoming.relations[cursor++]);
    }
  }
  relations.push(...incoming.relations.slice(cursor));
  if (relations.length > 50) limit();
  return { ...incoming, relations };
}
