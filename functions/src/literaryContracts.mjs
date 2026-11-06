import { normalizeLiteraryCollaboration } from './literaryCollaborationProtocol.mjs';
import { normalizeLiteraryPublicationPolicy } from './literaryPublicationPolicyProtocol.mjs';
import { workClosed, workFail, workId, workRevision } from './workProgressContracts.mjs';

import {
  EDITORIAL_FIELDS,
  EDITORIAL_STATUSES,
  EDITORIAL_CATEGORIES,
  MAX_EDITORIAL_BYTES,
} from './literaryEditorialFields.mjs';
export {
  EDITORIAL_FIELDS,
  EDITORIAL_STATUSES,
  EDITORIAL_CATEGORIES,
  MAX_EDITORIAL_BYTES,
} from './literaryEditorialFields.mjs';

export function editorialText(value, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()))
    workFail('invalid-argument', 'Texto editorial vazio ou acima do limite.');
  return value;
}
export function editorialContract(value) {
  workClosed(value, [
    'schemaVersion',
    'fields',
    'decisions',
    'collaborationPolicy',
    'publicationPolicy',
  ]);
  if (value.schemaVersion !== 1)
    workFail('invalid-argument', 'Versão de contrato editorial desconhecida.');
  workClosed(value.fields, Object.keys(EDITORIAL_FIELDS));
  const fields = Object.fromEntries(
    Object.keys(EDITORIAL_FIELDS).map((key) => [
      key,
      editorialText(value.fields[key] ?? '', key === 'examples' ? 12000 : 6000),
    ]),
  );
  if (!Array.isArray(value.decisions) || value.decisions.length > 150)
    workFail('invalid-argument', 'Use até 150 decisões editoriais.');
  const ids = new Set();
  const decisions = value.decisions.map((row) => {
    workClosed(row, ['id', 'text', 'category', 'status', 'source', 'supersedes']);
    const id = workId(row.id);
    if (ids.has(id)) workFail('invalid-argument', 'Decisão duplicada.');
    ids.add(id);
    if (!EDITORIAL_STATUSES.includes(row.status) || !EDITORIAL_CATEGORIES.includes(row.category))
      workFail('invalid-argument', 'Classificação editorial inválida.');
    return {
      id,
      text: editorialText(row.text, 4000, true),
      category: row.category,
      status: row.status,
      source: editorialText(row.source, 1000, true),
      supersedes: row.supersedes == null ? null : workId(row.supersedes),
    };
  });
  for (const row of decisions)
    if (row.supersedes !== null && (row.supersedes === row.id || !ids.has(row.supersedes)))
      workFail('invalid-argument', 'Decisão substituída deve existir no contrato.');
  // Historical decisions stay present; replacement chains must be acyclic.
  for (const row of decisions) {
    const visited = new Set([row.id]);
    let next = row.supersedes;
    while (next !== null) {
      if (visited.has(next)) workFail('invalid-argument', 'Ciclo de decisões editoriais.');
      visited.add(next);
      next = decisions.find((item) => item.id === next).supersedes;
    }
  }
  const result = { schemaVersion: 1, fields, decisions };
  // Preserve legacy canonical payloads and idempotency fingerprints unchanged.
  if (value.collaborationPolicy !== undefined) {
    try {
      result.collaborationPolicy = normalizeLiteraryCollaboration(value.collaborationPolicy);
    } catch (cause) {
      workFail('invalid-argument', cause.message);
    }
  }
  if (value.publicationPolicy !== undefined) {
    try {
      result.publicationPolicy = normalizeLiteraryPublicationPolicy(value.publicationPolicy);
    } catch (cause) {
      workFail('invalid-argument', cause.message);
    }
  }
  if (Buffer.byteLength(JSON.stringify(result)) > MAX_EDITORIAL_BYTES)
    workFail('invalid-argument', 'Contrato editorial acima do limite.');
  return result;
}
export function emptyEditorialContract() {
  return {
    schemaVersion: 1,
    fields: Object.fromEntries(Object.keys(EDITORIAL_FIELDS).map((key) => [key, ''])),
    decisions: [],
  };
}
export function editorialStored(value) {
  if (!value) return { revision: 0, updatedAt: null, contract: emptyEditorialContract() };
  workRevision(value.revision);
  if (value.revision < 1 || !Number.isSafeInteger(value.updatedAt))
    workFail(
      'failed-precondition',
      'Registro editorial inválido; preserve os dados e solicite recuperação.',
    );
  return {
    revision: value.revision,
    updatedAt: value.updatedAt,
    contract: editorialContract(value.contract),
  };
}
