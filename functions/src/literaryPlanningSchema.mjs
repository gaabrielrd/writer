import { validateLiteraryVolumeReference } from './literaryVolumeProtocol.mjs';
import { workClosed, workFail, workId, workRevision } from './workProgressContracts.mjs';
import { editorialText, EDITORIAL_STATUSES } from './literaryContracts.mjs';

import { LITERARY_PLAN_SCHEMA, LITERARY_REFERENCE_KINDS } from './literaryPlanFields.mjs';
export { LITERARY_PLAN_SCHEMA, LITERARY_REFERENCE_KINDS } from './literaryPlanFields.mjs';

export function literaryReference(value) {
  workClosed(value, ['kind', 'id', 'scopeId', 'sourceToken', 'revision', 'purpose']);
  if (value.purpose !== undefined && !['source', 'subject'].includes(value.purpose))
    workFail('invalid-argument', 'Finalidade da referência inválida.');
  if (!LITERARY_REFERENCE_KINDS.includes(value.kind))
    workFail('invalid-argument', 'Tipo de referência editorial inválido.');
  if (typeof value.sourceToken !== 'string' || !/^[a-f0-9]{64}$/.test(value.sourceToken))
    workFail('invalid-argument', 'Escolha uma referência atual da lista.');
  if (value.kind === 'volumeUnit') {
    try {
      validateLiteraryVolumeReference(value);
    } catch {
      workFail('invalid-argument', 'Escolha o livro e a unidade de origem como fonte.');
    }
  }
  return {
    kind: value.kind,
    id: value.kind === 'volumeUnit' ? value.id : workId(value.id),
    scopeId: value.scopeId == null ? null : workId(value.scopeId),
    sourceToken: value.sourceToken,
    revision: workRevision(value.revision),
    purpose: value.purpose ?? 'source',
  };
}
export function literaryPlan(value) {
  workClosed(value, ['kind', 'title', 'status', 'fields', 'references']);
  const schema = LITERARY_PLAN_SCHEMA[value.kind];
  if (!schema || !Object.hasOwn(LITERARY_PLAN_SCHEMA, value.kind))
    workFail('invalid-argument', 'Tipo de documento editorial inválido.');
  if (!EDITORIAL_STATUSES.includes(value.status))
    workFail('invalid-argument', 'Situação editorial inválida.');
  workClosed(value.fields, Object.keys(schema.fields));
  if (!Array.isArray(value.references) || value.references.length > 12)
    workFail('invalid-argument', 'Use até 12 referências explícitas.');
  const references = value.references.map(literaryReference);
  if (
    new Set(references.map((ref) => JSON.stringify([ref.kind, ref.scopeId, ref.id]))).size !==
    references.length
  )
    workFail('invalid-argument', 'Referência repetida.');
  const result = {
    kind: value.kind,
    title: editorialText(value.title, 300, true),
    status: value.status,
    fields: Object.fromEntries(
      Object.keys(schema.fields).map((key) => [key, editorialText(value.fields[key] ?? '', 6000)]),
    ),
    references,
  };
  if (Buffer.byteLength(JSON.stringify(result)) > 140000)
    workFail('invalid-argument', 'Documento editorial acima do limite.');
  return result;
}
