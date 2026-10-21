import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  runTransaction,
  onSnapshot,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { firestore, getFirebaseApp } from '@/shared/lib';
import { asLoreScope, loreEntityDocumentId, universeEntityId } from '../model/loreScope';
import type {
  CreateLoreEntityInput,
  LoreCategory,
  LoreDetails,
  LoreEntity,
  LoreRelation,
  LoreScope,
  UpdateLoreEntityInput,
} from '../model/loreEntity';

interface StoredLoreDoc {
  bookId: string;
  name: string;
  aliases?: string[];
  category: LoreCategory;
  summary: string;
  details?: string;
  structuredDetails?: LoreDetails;
  relations?: LoreRelation[];
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
}

function localLoreVersion(book: Record<string, unknown>): number {
  const value = 'localLoreVersion' in book ? book.localLoreVersion : 0;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Não foi possível verificar a versão do lore deste livro.');
  return value;
}

function nextLocalLoreVersion(book: Record<string, unknown>): number {
  const value = localLoreVersion(book);
  if (value === Number.MAX_SAFE_INTEGER)
    throw new Error('A versão do lore deste livro atingiu o limite seguro.');
  return value + 1;
}

function loreCollection(source: string | LoreScope) {
  const scope = asLoreScope(source);
  if (scope.kind === 'adventure') throw new Error('Use o contexto autorizado de lore da aventura.');
  return collection(firestore, scope.kind === 'book' ? 'books' : 'universes', scope.id, 'lore');
}

function mapLocal(id: string, bookId: string, data: Partial<StoredLoreDoc>): LoreEntity {
  return {
    id,
    bookId,
    name: data.name ?? '',
    aliases: Array.isArray(data.aliases) ? data.aliases : [],
    category: data.category ?? 'other',
    summary: data.summary ?? '',
    details: data.details ?? '',
    ...(data.structuredDetails ? { structuredDetails: data.structuredDetails } : {}),
    relations: Array.isArray(data.relations) ? data.relations : [],
    isPublic: data.isPublic ?? true,
    createdAt: data.createdAt ?? 0,
    updatedAt: data.updatedAt ?? 0,
  };
}

function mapGlobal(id: string, universeId: string, data: Partial<StoredLoreDoc>): LoreEntity {
  return {
    id: universeEntityId(universeId, id),
    universeId,
    name: data.name ?? '',
    aliases: data.aliases ?? [],
    category: data.category ?? 'other',
    summary: data.summary ?? '',
    details: data.details ?? '',
    relations: data.relations ?? [],
    isPublic: data.isPublic === true,
    ...(data.structuredDetails ? { structuredDetails: data.structuredDetails } : {}),
    createdAt: data.createdAt ?? 0,
    updatedAt: data.updatedAt ?? 0,
  };
}

async function globalCall<T>(name: string, data: unknown): Promise<T> {
  try {
    return (
      await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), name)(data)
    ).data;
  } catch (cause) {
    throw new Error(
      cause instanceof Error
        ? cause.message
        : 'Não foi possível salvar o lore global. Tente novamente.',
      { cause },
    );
  }
}

export function subscribeLoreEntities(
  source: string | LoreScope,
  onChange: (entities: LoreEntity[]) => void,
  onError: (error: unknown) => void,
) {
  const scope = asLoreScope(source);
  if (scope.kind === 'adventure') throw new Error('Use o contexto autorizado de lore da aventura.');
  return onSnapshot(
    query(loreCollection(source), orderBy('name', 'asc')),
    (snapshot) => {
      onChange(
        snapshot.docs.map((item) =>
          scope.kind === 'universe'
            ? mapGlobal(item.id, scope.id, item.data())
            : mapLocal(item.id, scope.id, item.data()),
        ),
      );
    },
    onError,
  );
}

export async function listLoreEntities(source: string | LoreScope): Promise<LoreEntity[]> {
  const scope = asLoreScope(source);
  if (scope.kind === 'adventure') throw new Error('Use o contexto autorizado de lore da aventura.');
  const bookId = scope.id;
  const loreRef = loreCollection(source);
  const q = query(loreRef, orderBy('name', 'asc'));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data() as StoredLoreDoc;
    if (scope.kind === 'universe') return mapGlobal(docSnap.id, scope.id, data);
    return mapLocal(docSnap.id, bookId, data);
  });
}

export async function getLoreEntity(
  source: string | LoreScope,
  entityId: string,
): Promise<LoreEntity | null> {
  const scope = asLoreScope(source);
  if (scope.kind === 'adventure') throw new Error('Use o contexto autorizado de lore da aventura.');
  const bookId = scope.id;
  const entityDocRef = doc(loreCollection(source), loreEntityDocumentId(scope, entityId));
  const snap = await getDoc(entityDocRef);

  if (!snap.exists()) {
    return null;
  }

  const data = snap.data() as StoredLoreDoc;
  if (scope.kind === 'universe') return mapGlobal(snap.id, scope.id, data);
  return mapLocal(snap.id, bookId, data);
}

export async function createLoreEntity(
  source: string | LoreScope,
  input: CreateLoreEntityInput,
): Promise<LoreEntity> {
  const scope = asLoreScope(source);
  if (scope.kind === 'adventure') throw new Error('Use o contexto autorizado de lore da aventura.');
  const bookId = scope.id;
  if (scope.kind === 'universe')
    return globalCall('saveUniverseLore', {
      universeId: scope.id,
      id: input.creationId ?? crypto.randomUUID(),
      create: true,
      input,
    });
  const loreRef = collection(firestore, 'books', bookId, 'lore');
  if (input.creationId && !/^[a-zA-Z0-9-]{16,80}$/.test(input.creationId))
    throw new Error('Identificador de criação inválido.');
  const newEntityDoc = input.creationId ? doc(loreRef, input.creationId) : doc(loreRef);
  const now = Date.now();

  const entityDocData: StoredLoreDoc = {
    bookId,
    name: input.name.trim(),
    aliases: (input.aliases || []).map((a) => a.trim()).filter(Boolean),
    category: input.category,
    summary: input.summary.slice(0, 140).trim(),
    details: input.details?.trim() || '',
    ...(input.structuredDetails ? { structuredDetails: input.structuredDetails } : {}),
    relations: input.relations || [],
    isPublic: input.isPublic ?? true,
    createdAt: now,
    updatedAt: now,
  };

  const bookRef = doc(firestore, 'books', bookId);
  return runTransaction(firestore, async (transaction) => {
    const [book, existing] = await Promise.all([
      transaction.get(bookRef),
      transaction.get(newEntityDoc),
    ]);
    if (!book.exists() || book.data().deleting) throw new Error('Livro indisponível.');
    localLoreVersion(book.data());
    if (existing.exists()) return mapLocal(newEntityDoc.id, bookId, existing.data());
    const version = nextLocalLoreVersion(book.data());
    transaction.set(newEntityDoc, entityDocData);
    transaction.update(bookRef, { localLoreVersion: version });
    return mapLocal(newEntityDoc.id, bookId, entityDocData);
  });
}

export async function updateLoreEntity(
  source: string | LoreScope,
  entityId: string,
  input: UpdateLoreEntityInput,
): Promise<void> {
  const scope = asLoreScope(source);
  if (scope.kind === 'adventure') throw new Error('Use o contexto autorizado de lore da aventura.');
  const bookId = scope.id;
  if (scope.kind === 'universe') {
    const existing = await getLoreEntity(source, entityId);
    if (!existing) throw new Error('Entidade indisponível.');
    await globalCall('saveUniverseLore', {
      universeId: scope.id,
      id: loreEntityDocumentId(scope, entityId),
      input: { ...existing, ...input },
    });
    return;
  }
  const entityDocRef = doc(firestore, 'books', bookId, 'lore', entityId);

  const updates: Partial<StoredLoreDoc> = {
    updatedAt: Date.now(),
  };

  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.aliases !== undefined) {
    updates.aliases = input.aliases.map((a) => a.trim()).filter(Boolean);
  }
  if (input.category !== undefined) updates.category = input.category;
  if (input.summary !== undefined) updates.summary = input.summary.slice(0, 140).trim();
  if (input.details !== undefined) updates.details = input.details.trim();
  if (input.structuredDetails !== undefined) updates.structuredDetails = input.structuredDetails;
  if (input.relations !== undefined) updates.relations = input.relations;
  if (input.isPublic !== undefined) updates.isPublic = input.isPublic;

  const bookRef = doc(firestore, 'books', bookId);
  await runTransaction(firestore, async (transaction) => {
    const [book, current] = await Promise.all([
      transaction.get(bookRef),
      transaction.get(entityDocRef),
    ]);
    if (!book.exists() || book.data().deleting) throw new Error('Livro indisponível.');
    if (!current.exists()) throw new Error('Entidade indisponível.');
    const version = nextLocalLoreVersion(book.data());
    const revokePublication = input.isPublic === false && current.data().isPublic === true;
    transaction.update(bookRef, {
      localLoreVersion: version,
      ...(revokePublication
        ? {
            status: 'draft',
            updatedAt: Date.now(),
            publicationPrivacyVersion: (Number(book.data().publicationPrivacyVersion) || 0) + 1,
          }
        : {}),
    });
    if (revokePublication) transaction.delete(doc(firestore, 'publicBooks', bookId));
    transaction.update(entityDocRef, updates);
  });
}

export async function deleteLoreEntity(
  source: string | LoreScope,
  entityId: string,
): Promise<void> {
  const scope = asLoreScope(source);
  if (scope.kind === 'adventure') throw new Error('Use o contexto autorizado de lore da aventura.');
  const bookId = scope.id;
  if (scope.kind === 'universe') {
    await globalCall('deleteUniverseLore', {
      universeId: scope.id,
      id: loreEntityDocumentId(scope, entityId),
    });
    return;
  }
  const entityDocRef = doc(firestore, 'books', bookId, 'lore', entityId);
  const bookRef = doc(firestore, 'books', bookId);
  await runTransaction(firestore, async (transaction) => {
    const [book, current] = await Promise.all([
      transaction.get(bookRef),
      transaction.get(entityDocRef),
    ]);
    if (!book.exists() || book.data().deleting) throw new Error('Livro indisponível.');
    localLoreVersion(book.data());
    if (!current.exists()) return;
    const version = nextLocalLoreVersion(book.data());
    const revokePublication = current.data().isPublic === true;
    transaction.update(bookRef, {
      localLoreVersion: version,
      ...(revokePublication
        ? {
            status: 'draft',
            updatedAt: Date.now(),
            publicationPrivacyVersion: (Number(book.data().publicationPrivacyVersion) || 0) + 1,
          }
        : {}),
    });
    if (revokePublication) transaction.delete(doc(firestore, 'publicBooks', bookId));
    transaction.delete(entityDocRef);
  });
}
