import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import { firestore } from '@/shared/lib';
import type {
  CreateLoreEntityInput,
  LoreCategory,
  LoreEntity,
  LoreRelation,
  UpdateLoreEntityInput,
} from '../model/loreEntity';

interface StoredLoreDoc {
  bookId: string;
  name: string;
  aliases?: string[];
  category: LoreCategory;
  summary: string;
  details?: string;
  relations?: LoreRelation[];
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
}

export async function listLoreEntities(bookId: string): Promise<LoreEntity[]> {
  const loreRef = collection(firestore, 'books', bookId, 'lore');
  const q = query(loreRef, orderBy('name', 'asc'));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data() as StoredLoreDoc;
    return {
      id: docSnap.id,
      bookId,
      name: data.name ?? '',
      aliases: Array.isArray(data.aliases) ? data.aliases : [],
      category: data.category ?? 'other',
      summary: data.summary ?? '',
      details: data.details ?? '',
      relations: Array.isArray(data.relations) ? data.relations : [],
      isPublic: data.isPublic ?? true,
      createdAt: data.createdAt ?? Date.now(),
      updatedAt: data.updatedAt ?? Date.now(),
    };
  });
}

export async function getLoreEntity(bookId: string, entityId: string): Promise<LoreEntity | null> {
  const entityDocRef = doc(firestore, 'books', bookId, 'lore', entityId);
  const snap = await getDoc(entityDocRef);

  if (!snap.exists()) {
    return null;
  }

  const data = snap.data() as StoredLoreDoc;
  return {
    id: snap.id,
    bookId,
    name: data.name ?? '',
    aliases: Array.isArray(data.aliases) ? data.aliases : [],
    category: data.category ?? 'other',
    summary: data.summary ?? '',
    details: data.details ?? '',
    relations: Array.isArray(data.relations) ? data.relations : [],
    isPublic: data.isPublic ?? true,
    createdAt: data.createdAt ?? Date.now(),
    updatedAt: data.updatedAt ?? Date.now(),
  };
}

export async function createLoreEntity(
  bookId: string,
  input: CreateLoreEntityInput,
): Promise<LoreEntity> {
  const loreRef = collection(firestore, 'books', bookId, 'lore');
  const newEntityDoc = doc(loreRef);
  const now = Date.now();

  const entityDocData: StoredLoreDoc = {
    bookId,
    name: input.name.trim(),
    aliases: (input.aliases || []).map((a) => a.trim()).filter(Boolean),
    category: input.category,
    summary: input.summary.slice(0, 140).trim(),
    details: input.details?.trim() || '',
    relations: input.relations || [],
    isPublic: input.isPublic ?? true,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(newEntityDoc, entityDocData);

  return {
    id: newEntityDoc.id,
    ...entityDocData,
    aliases: entityDocData.aliases ?? [],
    details: entityDocData.details ?? '',
    relations: entityDocData.relations ?? [],
  };
}

export async function updateLoreEntity(
  bookId: string,
  entityId: string,
  input: UpdateLoreEntityInput,
): Promise<void> {
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
  if (input.relations !== undefined) updates.relations = input.relations;
  if (input.isPublic !== undefined) updates.isPublic = input.isPublic;

  await updateDoc(entityDocRef, updates);
}

export async function deleteLoreEntity(bookId: string, entityId: string): Promise<void> {
  const entityDocRef = doc(firestore, 'books', bookId, 'lore', entityId);
  await deleteDoc(entityDocRef);
}
