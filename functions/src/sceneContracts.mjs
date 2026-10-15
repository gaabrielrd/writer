import { createHash } from 'node:crypto';
import { GenerationError } from './generation.mjs';
import { countVisibleWords } from './visibleWordCount.mjs';

export function sceneFail(code, message, reason) {
  const error = new GenerationError(code, message);
  if (reason) error.details = { reason };
  throw error;
}
export const conflict = () =>
  sceneFail(
    'failed-precondition',
    'O recurso mudou. Atualize e compare antes de tentar novamente.',
    'revision-conflict',
  );
export function closed(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    sceneFail('invalid-argument', 'Dados da cena inválidos.');
  return value;
}
export function sceneId(value) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.includes('/') ||
    ['.', '..'].includes(value) ||
    Buffer.byteLength(value) > 1500
  )
    sceneFail('invalid-argument', 'Identificador inválido.');
  return value;
}
export const parentId = (value) => (value == null ? null : sceneId(value));
export function sceneTarget(value) {
  closed(value, ['kind', 'id']);
  if (!['book', 'adventure'].includes(value.kind))
    sceneFail('invalid-argument', 'Tipo de projeto inválido.');
  return { kind: value.kind, id: sceneId(value.id) };
}
export function sceneText(value, max, required = false) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()))
    sceneFail('invalid-argument', 'Preencha os campos dentro dos limites.');
  return value.trim();
}
export function sceneLimit(value = 25) {
  if (!Number.isInteger(value) || value < 1 || value > 50)
    sceneFail('invalid-argument', 'A página deve ter entre 1 e 50 itens.');
  return value;
}
export function sceneRevision(value) {
  if (!Number.isSafeInteger(value) || value < 0) sceneFail('invalid-argument', 'Revisão inválida.');
  return value;
}
export function sceneDate(now, previous = 0) {
  if (typeof previous !== 'number' || !Number.isFinite(previous) || previous < 0)
    sceneFail('failed-precondition', 'A data do projeto é inválida.');
  const value = Math.max(now(), previous + 1);
  if (!Number.isFinite(value) || value < 0 || !Number.isFinite(new Date(value).getTime()))
    sceneFail('failed-precondition', 'A data do projeto é inválida. Corrija-a antes de continuar.');
  return value;
}
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
export const digest = (value) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(canonical(value)))
    .digest('hex');
export function prose(content = '') {
  if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > 800000)
    sceneFail(
      'invalid-argument',
      'Texto acima de 800.000 bytes. Divida-o explicitamente; nenhum texto foi alterado.',
    );
  const body = { content, hash: digest(content) };
  assertSceneEnvelope(body);
  const words = countVisibleWords(content);
  return {
    body,
    wordCount: words,
    bodyHash: body.hash,
    bodyBytes: Buffer.byteLength(content, 'utf8'),
  };
}
export function assertSceneEnvelope(value) {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 900000)
    sceneFail(
      'invalid-argument',
      'Documento acima do orçamento de armazenamento. Divida o texto sem truncá-lo.',
    );
}
export function planning(value = {}, previous = { objective: '', conflict: '', pointOfView: '' }) {
  closed(value, ['objective', 'conflict', 'pointOfView']);
  return Object.fromEntries(
    Object.keys(previous).map((key) => [
      key,
      key in value ? sceneText(value[key], 4000) : previous[key],
    ]),
  );
}
export const encodeSceneCursor = (value) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');
export function decodeSceneCursor(value, context, { observeUpdatedAt = false } = {}) {
  if (value == null) return null;
  let result;
  if (typeof value !== 'string' || value.length > 12000 || !/^[A-Za-z0-9_-]+$/.test(value))
    sceneFail('invalid-argument', 'Página inválida.');
  try {
    result = JSON.parse(Buffer.from(value, 'base64url').toString());
  } catch {
    sceneFail('invalid-argument', 'Página inválida.');
  }
  closed(result, ['version', 'context', 'revision', 'key', 'id']);
  if (result.version !== 1)
    sceneFail('invalid-argument', 'Página pertence a outro escopo ou filtro.');
  sceneRevision(result.revision);
  sceneId(result.id);
  if (typeof result.key !== 'string' || Buffer.byteLength(result.key) > 1500)
    sceneFail('invalid-argument', 'Página inválida.');
  if (digest(result.context) !== digest(context)) {
    if (observeUpdatedAt && result.context && typeof result.context === 'object') {
      const { updatedAt: previousDate, ...previousScope } = result.context;
      const { updatedAt: currentDate, ...currentScope } = context;
      if (
        digest(previousScope) === digest(currentScope) &&
        (previousDate === undefined ||
          (typeof previousDate === 'number' &&
            previousDate >= 0 &&
            Number.isFinite(new Date(previousDate).getTime()))) &&
        previousDate !== currentDate
      )
        conflict();
    }
    sceneFail('invalid-argument', 'Página pertence a outro escopo ou filtro.');
  }
  return result;
}
