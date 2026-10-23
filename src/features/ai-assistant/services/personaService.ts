import { collection, doc, getDocs, getDoc, onSnapshot, runTransaction } from 'firebase/firestore';
import { firestore } from '@/shared/lib';
import { validatePersona, isDefaultPersona, type AIPersona } from '../model/persona';
import {
  projectPersonaRestoreOrigin,
  isPersonaRestoreBatchAvailable,
  type PersonaRestoreOrigin,
} from '../model/personaAvailability';

function personaCollection(ownerId: string) {
  if (!ownerId || ownerId.includes('/'))
    throw new Error('Entre na sua conta para gerenciar personas.');
  return collection(firestore, 'users', ownerId, 'aiPersonas');
}
const batchReference = (ownerId: string, id: string) =>
  doc(firestore, 'users', ownerId, 'aiPersonaRestoreBatches', id);
type Row = { persona: AIPersona; origin: PersonaRestoreOrigin | null };
function rows(docs: ReadonlyArray<{ id: string; data(): Record<string, unknown> }>): Row[] {
  return docs.map((item) => {
    const raw = { ...item.data(), id: item.id };
    return { persona: validatePersona(raw), origin: projectPersonaRestoreOrigin(raw) };
  });
}
const errorValue = (error: unknown) =>
  error instanceof Error ? error : new Error('Biblioteca de personas inválida.');
export function subscribePersonas(
  ownerId: string,
  onChange: (personas: AIPersona[]) => void,
  onError: (error: Error) => void,
): () => void {
  const reference = personaCollection(ownerId),
    batches = new Map<string, { value: unknown; stop: () => void }>();
  let current: Row[] = [],
    emitted: AIPersona[] | null = null,
    alive = true;
  const emit = () => {
    if (!alive) return;
    const visible = current
      .filter((row) =>
        isPersonaRestoreBatchAvailable(
          ownerId,
          row.origin,
          row.origin ? batches.get(row.origin.bookId)?.value : undefined,
        ),
      )
      .map((row) => row.persona);
    if (
      emitted &&
      emitted.length === visible.length &&
      emitted.every((profile, index) => JSON.stringify(profile) === JSON.stringify(visible[index]))
    )
      return;
    emitted = visible;
    onChange(visible);
  };
  const stop = onSnapshot(
    reference,
    (snapshot) => {
      if (!alive) return;
      try {
        current = rows(snapshot.docs);
        const wanted = new Set(current.flatMap((row) => (row.origin ? [row.origin.bookId] : [])));
        for (const [id, entry] of batches)
          if (!wanted.has(id)) {
            batches.delete(id);
            entry.stop();
          }
        for (const id of wanted)
          if (!batches.has(id)) {
            const entry: { value: unknown; stop: () => void } = {
              value: undefined,
              stop: () => {},
            };
            batches.set(id, entry);
            entry.stop = onSnapshot(
              batchReference(ownerId, id),
              (batch) => {
                if (!alive || batches.get(id) !== entry) return;
                entry.value = batch.exists() ? batch.data() : undefined;
                emit();
              },
              (error) => {
                if (!alive || batches.get(id) !== entry) return;
                entry.value = undefined;
                emit();
                onError(errorValue(error));
              },
            );
          }
        emit();
      } catch (error) {
        current = [];
        emit();
        onError(errorValue(error));
      }
    },
    (error) => {
      if (!alive) return;
      current = [];
      emit();
      onError(errorValue(error));
    },
  );
  return () => {
    if (!alive) return;
    alive = false;
    stop();
    for (const entry of batches.values()) entry.stop();
    batches.clear();
    current = [];
    emitted = null;
  };
}
export async function listPersonas(ownerId: string): Promise<AIPersona[]> {
  const snapshot = await getDocs(personaCollection(ownerId)),
    items = rows(snapshot.docs),
    ids = [...new Set(items.flatMap((row) => (row.origin ? [row.origin.bookId] : [])))],
    batches = new Map(
      await Promise.all(
        ids.map(async (id) => {
          const batch = await getDoc(batchReference(ownerId, id));
          return [id, batch.exists() ? batch.data() : undefined] as const;
        }),
      ),
    );
  return items
    .filter((row) =>
      isPersonaRestoreBatchAvailable(
        ownerId,
        row.origin,
        row.origin ? batches.get(row.origin.bookId) : undefined,
      ),
    )
    .map((row) => row.persona);
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
    const origin = snapshot.exists()
      ? projectPersonaRestoreOrigin({ ...snapshot.data(), id: snapshot.id })
      : null;
    if (origin) {
      const batch = await transaction.get(batchReference(ownerId, origin.bookId));
      if (
        !isPersonaRestoreBatchAvailable(ownerId, origin, batch.exists() ? batch.data() : undefined)
      )
        throw new Error('A restauração desta persona ainda não foi concluída.');
    }
    if ((previous?.revision ?? null) !== expectedRevision)
      throw new Error('Esta persona mudou em outra janela. Reabra a edição antes de salvar.');
    const now = Date.now();
    const saved = {
      ...persona,
      revision: (previous?.revision ?? 0) + 1,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    transaction.set(reference, { ...saved, ...(origin ? { restoreOrigin: origin } : {}) });
    return saved;
  });
}
