import { author } from './data';
import { validatePersona, type AIPersona } from '../../../src/features/ai-assistant/model/persona';

const listeners = new Set<(items: AIPersona[]) => void>();
const read = (): AIPersona[] =>
  JSON.parse(sessionStorage.getItem('writer_fixture_personas') ?? '[]') as AIPersona[];
function checkOwner(ownerId: string) {
  if (ownerId !== author.uid) throw new Error('A prévia permite somente a conta fictícia.');
}
export function subscribePersonas(
  ownerId: string,
  callback: (items: AIPersona[]) => void,
  onError: (error: Error) => void,
) {
  checkOwner(ownerId);
  if (sessionStorage.getItem('writer_fixture_personas_error') === 'true') {
    onError(new Error('Falha simulada da biblioteca.'));
    return () => undefined;
  }
  listeners.add(callback);
  callback(read());
  return () => {
    listeners.delete(callback);
  };
}
export function listPersonas(ownerId: string): Promise<AIPersona[]> {
  checkOwner(ownerId);
  return Promise.resolve(read());
}
export function savePersona(
  ownerId: string,
  input: AIPersona,
  expectedRevision: number | null,
): Promise<AIPersona> {
  checkOwner(ownerId);
  const items = read();
  const previous = items.find((item) => item.id === input.id);
  if ((previous?.revision ?? null) !== expectedRevision)
    return Promise.reject(new Error('Esta persona mudou em outra janela.'));
  const saved = validatePersona({
    ...input,
    revision: (previous?.revision ?? 0) + 1,
    createdAt: previous?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  });
  const next = [...items.filter((item) => item.id !== input.id), saved];
  sessionStorage.setItem('writer_fixture_personas', JSON.stringify(next));
  listeners.forEach((callback) => callback(structuredClone(next)));
  return Promise.resolve(saved);
}
