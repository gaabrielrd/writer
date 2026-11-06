import { validateLiteraryVolumeReference } from './literaryVolumeProtocol.mjs';
// Pure/browser-safe wire validation. Authorization belongs to literaryWritingContext.
const encoder = new TextEncoder();
const fail = () => {
  throw new TypeError('Contexto editorial inválido.');
};
function closed(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Reflect.ownKeys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    fail();
  for (const key of keys)
    if (!Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')) fail();
  return value;
}
const text = (value, max = 1500) => {
  if (typeof value !== 'string' || !value.isWellFormed() || encoder.encode(value).length > max)
    fail();
  return value;
};
const id = (value) => {
  text(value);
  if (!value || value.includes('/') || ['.', '..'].includes(value)) fail();
  return value;
};
const hash = (value) => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail();
  return value;
};
const revision = (value) => {
  if (!Number.isSafeInteger(value) || value < 0) fail();
  return value;
};
const one = (value, options) => {
  if (!options.includes(value)) fail();
  return value;
};
function array(value, limit, read) {
  if (!Array.isArray(value) || value.length > limit) fail();
  return value.map(read);
}
function reference(value) {
  closed(value, ['kind', 'id', 'scopeId', 'sourceToken', 'revision', 'purpose']);
  if (value.kind === 'volumeUnit') validateLiteraryVolumeReference(value);
  return {
    kind: one(value.kind, [
      'act',
      'chapter',
      'scene',
      'arc',
      'event',
      'localLore',
      'globalLore',
      'volumeUnit',
    ]),
    id: value.kind === 'volumeUnit' ? value.id : id(value.id),
    scopeId: value.scopeId === null ? null : id(value.scopeId),
    sourceToken: hash(value.sourceToken),
    revision: revision(value.revision),
    purpose: one(value.purpose, ['source', 'subject']),
  };
}
export function normalizeLiteraryWritingManifest(value) {
  closed(value, [
    'version',
    'target',
    'resource',
    'bookToken',
    'selection',
    'contractRevision',
    'planIds',
    'plans',
    'references',
  ]);
  if (value.version !== 1) fail();
  closed(value.target, ['kind', 'id']);
  closed(value.resource, ['kind', 'id']);
  if (value.target.kind !== 'book') fail();
  const result = {
    version: 1,
    target: { kind: 'book', id: id(value.target.id) },
    resource: { kind: one(value.resource.kind, ['chapter', 'scene']), id: id(value.resource.id) },
    bookToken: hash(value.bookToken),
    selection: one(value.selection, ['automatic', 'explicit']),
    contractRevision: revision(value.contractRevision),
    planIds: array(value.planIds, 8, id),
    plans: array(value.plans, 8, (plan) => {
      closed(plan, ['id', 'identityToken', 'revision']);
      return {
        id: id(plan.id),
        identityToken: hash(plan.identityToken),
        revision: revision(plan.revision),
      };
    }),
    references: array(value.references, 24, (item) => {
      closed(item, ['reference', 'identityToken', 'versionToken']);
      return {
        reference: reference(item.reference),
        identityToken: hash(item.identityToken),
        versionToken: hash(item.versionToken),
      };
    }),
  };
  if (
    new Set(result.planIds).size !== result.planIds.length ||
    result.plans.length !== result.planIds.length ||
    result.plans.some((plan, index) => plan.id !== result.planIds[index]) ||
    encoder.encode(JSON.stringify(result)).length > 48000
  )
    fail();
  return result;
}
export function normalizeLiteraryWritingSnapshot(value) {
  closed(value, [
    'version',
    'manifest',
    'stateToken',
    'mode',
    'instruction',
    'documents',
    'coverage',
  ]);
  if (value.version !== 1) fail();
  const manifest = normalizeLiteraryWritingManifest(value.manifest);
  closed(value.coverage, ['scope', 'completeForSelection', 'wholeBook', 'omittedFields']);
  if (
    value.coverage.scope !== 'selected-editorial-sources' ||
    value.coverage.wholeBook !== false ||
    typeof value.coverage.completeForSelection !== 'boolean'
  )
    fail();
  const result = {
    version: 1,
    manifest,
    stateToken: hash(value.stateToken),
    mode: one(value.mode, ['chat', 'autocomplete']),
    instruction: text(value.instruction, 220000),
    documents: array(value.documents, 34, (document) => {
      closed(document, ['id', 'label', 'revision', 'text']);
      return {
        id: text(document.id, 4500),
        label: text(document.label, 1500),
        revision: revision(document.revision),
        text: text(document.text, 500000),
      };
    }),
    coverage: {
      scope: 'selected-editorial-sources',
      completeForSelection: value.coverage.completeForSelection,
      wholeBook: false,
      omittedFields: array(value.coverage.omittedFields, 200, (item) => text(item, 5000)),
    },
  };
  if (
    encoder.encode(JSON.stringify(result)).length >
    (result.mode === 'autocomplete' ? 48000 : 300000)
  )
    fail();
  return result;
}
