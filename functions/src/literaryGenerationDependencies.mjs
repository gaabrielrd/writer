import { validateLiteraryVolumeReference } from './literaryVolumeProtocol.mjs';
import { workClosed, workId, workRevision, workFail } from './workProgressContracts.mjs';
const hash = (value) => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    workFail('failed-precondition', 'Prova de origem editorial inválida.');
  return value;
};
const closed = (value, keys) => {
  workClosed(value, keys);
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key)))
    workFail('failed-precondition', 'Metadados de origem editorial incompletos.');
};
const list = (value, max) => {
  if (!Array.isArray(value) || value.length > max)
    workFail('failed-precondition', 'Metadados editoriais excedem o limite.');
  return value;
};
function bookBirth(value) {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !Number.isSafeInteger(value[0]) ||
    value[0] < 0 ||
    !Number.isSafeInteger(value[1]) ||
    value[1] < 0 ||
    value[1] >= 1e9
  )
    workFail('failed-precondition', 'Identidade nativa do livro indisponível.');
  return [...value];
}
function reference(value) {
  closed(value, ['kind', 'id', 'scopeId', 'sourceToken', 'revision', 'purpose']);
  if (
    !['act', 'chapter', 'scene', 'arc', 'event', 'localLore', 'globalLore', 'volumeUnit'].includes(
      value.kind,
    ) ||
    !['source', 'subject'].includes(value.purpose)
  )
    workFail('failed-precondition', 'Referência editorial inválida.');
  if (value.kind === 'volumeUnit') {
    try {
      validateLiteraryVolumeReference(value);
    } catch {
      workFail('failed-precondition', 'Origem de volume inválida.');
    }
  }
  return {
    kind: value.kind,
    id: value.kind === 'volumeUnit' ? value.id : workId(value.id),
    scopeId: value.scopeId === null ? null : workId(value.scopeId),
    sourceToken: hash(value.sourceToken),
    revision: workRevision(value.revision),
    purpose: value.purpose,
  };
}
export function normalizeLiteraryGenerationDependencies(value) {
  closed(value, ['version', 'bookBirth', 'contractRevision', 'plans', 'references']);
  if (value.version !== 1)
    workFail('failed-precondition', 'Versão das dependências editoriais não suportada.');
  const normalized = {
    version: 1,
    bookBirth: bookBirth(value.bookBirth),
    contractRevision: workRevision(value.contractRevision),
    plans: list(value.plans, 8).map((plan) => {
      closed(plan, ['id', 'identityToken', 'revision']);
      return {
        id: workId(plan.id),
        identityToken: hash(plan.identityToken),
        revision: workRevision(plan.revision),
      };
    }),
    references: list(value.references, 24).map((item) => {
      closed(item, ['reference', 'identityToken', 'versionToken', 'bodyToken']);
      return {
        reference: reference(item.reference),
        identityToken: hash(item.identityToken),
        versionToken: hash(item.versionToken),
        bodyToken: item.bodyToken === null ? null : hash(item.bodyToken),
      };
    }),
  };
  if (
    new Set(normalized.plans.map((plan) => plan.id)).size !== normalized.plans.length ||
    new Set(
      normalized.references.map(({ reference }) =>
        JSON.stringify([reference.kind, reference.scopeId, reference.id, reference.purpose]),
      ),
    ).size !== normalized.references.length
  )
    workFail('failed-precondition', 'Dependência editorial duplicada.');
  return normalized;
}
// Called only after the native capture. Copy an allowlist, excluding labels,
// documents, prose, author notes and provider transport configuration.
export function captureLiteraryGenerationDependencies(proof) {
  return normalizeLiteraryGenerationDependencies({
    version: 1,
    bookBirth: proof.bookBirth,
    contractRevision: proof.contractRevision,
    plans: proof.plans.map(({ id, identityToken, revision }) => ({ id, identityToken, revision })),
    references: proof.references.map(({ reference, identityToken, versionToken, bodyToken }) => ({
      reference,
      identityToken,
      versionToken,
      bodyToken,
    })),
  });
}
