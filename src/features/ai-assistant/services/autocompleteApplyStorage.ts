import type { PendingAutocompleteApply, AutocompleteScope } from '../model/atomicAutocomplete';
export const AUTOCOMPLETE_APPLY_EVENT = 'writer:autocomplete-apply:change';
const prefix = (actorId: string, scope: AutocompleteScope) =>
  'writer:autocomplete-apply:' + JSON.stringify([actorId, scope.bookId, scope.chapterId]) + ':';
const key = (value: PendingAutocompleteApply) => prefix(value.actorId, value) + value.operationId;
function read(raw: string): PendingAutocompleteApply {
  if (raw.length > 12000)
    throw new Error('Controle de autocomplete inválido; preserve a pendência.');
  const value = JSON.parse(raw) as PendingAutocompleteApply;
  if (
    !value ||
    Object.keys(value).sort().join(',') !==
      'actorId,afterHash,beforeHash,bookId,chapterId,operationId,requestId,version' ||
    value.version !== 1 ||
    ![value.actorId, value.bookId, value.chapterId].every(
      (id) => typeof id === 'string' && id.length > 0 && id.length <= 1500,
    ) ||
    ![value.requestId, value.operationId].every(
      (id) => typeof id === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(id),
    ) ||
    ![value.beforeHash, value.afterHash].every(
      (hash) => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash),
    )
  )
    throw new Error('Controle de autocomplete inválido; preserve a pendência.');
  return value;
}
export function readPendingAutocompleteApplies(actorId: string, scope: AutocompleteScope) {
  const result: PendingAutocompleteApply[] = [],
    start = prefix(actorId, scope);
  for (let index = 0; index < localStorage.length; index++) {
    const name = localStorage.key(index);
    if (!name?.startsWith(start)) continue;
    const value = read(localStorage.getItem(name) ?? '');
    if (
      value.actorId !== actorId ||
      value.bookId !== scope.bookId ||
      value.chapterId !== scope.chapterId ||
      key(value) !== name
    )
      throw new Error('A pendência pertence a outro contexto. Preserve os dados.');
    result.push(value);
  }
  return result;
}
async function locked<T>(value: PendingAutocompleteApply, work: () => T): Promise<T> {
  if (!navigator.locks)
    throw new Error(
      'Este navegador não oferece o controle necessário para confirmar o autocomplete.',
    );
  return navigator.locks.request(prefix(value.actorId, value), work);
}
export async function beginAutocompleteApply(value: PendingAutocompleteApply) {
  read(JSON.stringify(value));
  await locked(value, () => {
    const old = localStorage.getItem(key(value));
    if (old !== null && old !== JSON.stringify(value))
      throw new Error('A operação tem outro conteúdo. Preserve a pendência.');
    localStorage.setItem(key(value), JSON.stringify(value));
  });
  window.dispatchEvent(new Event(AUTOCOMPLETE_APPLY_EVENT));
}
export async function finishAutocompleteApply(value: PendingAutocompleteApply) {
  await locked(value, () => {
    const old = localStorage.getItem(key(value));
    if (old !== null && old !== JSON.stringify(value))
      throw new Error('O controle da aplicação mudou. Preserve a pendência.');
    localStorage.removeItem(key(value));
  });
  window.dispatchEvent(new Event(AUTOCOMPLETE_APPLY_EVENT));
}
