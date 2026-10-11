import { collection, doc, getDocs, onSnapshot, runTransaction } from 'firebase/firestore';
import { firestore } from '@/shared/lib';
import { validatePersona, isDefaultPersona, type AIPersona } from '../model/persona';

function personaCollection(ownerId: string) {
  if (!ownerId || ownerId.includes('/'))
    throw new Error('Entre na sua conta para gerenciar personas.');
  return collection(firestore, 'users', ownerId, 'aiPersonas');
}

export function subscribePersonas(
  ownerId: string,
  onChange: (personas: AIPersona[]) => void,
  onError: (error: Error) => void,
): () => void {
  return onSnapshot(
    personaCollection(ownerId),
    (snapshot) => {
      try {
        onChange(snapshot.docs.map((item) => validatePersona({ ...item.data(), id: item.id })));
      } catch (error) {
        onError(error instanceof Error ? error : new Error('Biblioteca de personas inválida.'));
      }
    },
    onError,
  );
}

export async function listPersonas(ownerId: string): Promise<AIPersona[]> {
  const snapshot = await getDocs(personaCollection(ownerId));
  return snapshot.docs.map((item) => validatePersona({ ...item.data(), id: item.id }));
}

export async function savePersona(
  ownerId: string,
  input: AIPersona,
  expectedRevision: number | null,
): Promise<AIPersona> {
  const persona = validatePersona(input);
  if (isDefaultPersona(persona.id) || persona.id.startsWith('preset-'))
    throw new Error('Duplique uma persona padrão para personalizar.');
  const reference = doc(personaCollection(ownerId), persona.id);
  return runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(reference);
    const previous = snapshot.exists()
      ? validatePersona({ ...snapshot.data(), id: snapshot.id })
      : null;
    if ((previous?.revision ?? null) !== expectedRevision)
      throw new Error('Esta persona mudou em outra janela. Reabra a edição antes de salvar.');
    const now = Date.now();
    const saved = {
      ...persona,
      revision: (previous?.revision ?? 0) + 1,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    transaction.set(reference, saved);
    return saved;
  });
}
