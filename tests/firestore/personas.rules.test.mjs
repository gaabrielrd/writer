import { after, before, beforeEach, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
let environment;
const persona = {
  id: 'custom-test',
  schemaVersion: 1,
  name: 'Minha voz',
  description: '',
  instructions: 'Use verbos fortes.',
  revision: 1,
  archived: false,
  createdAt: 1,
  updatedAt: 1,
  traits: [
    'sensory',
    'concision',
    'introspection',
    'humor',
    'solemnity',
    'tension',
    'ambiguity',
    'pace',
  ].map((id) => ({ id, name: id, description: '', low: 'Discreto', high: 'Intenso', value: 50 })),
};
const path = 'users/author/aiPersonas/custom-test';
const db = (id) =>
  id
    ? environment.authenticatedContext(id).firestore()
    : environment.unauthenticatedContext().firestore();
before(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'demo-writer-personas-tests',
    firestore: { host, port: Number(port), rules: await readFile('firestore.rules', 'utf8') },
  });
});
beforeEach(async () => environment.clearFirestore());
after(async () => environment?.cleanup());

it('permite personas privadas apenas ao dono e mantém revisão monotônica sem exclusão', async () => {
  await assertSucceeds(
    setDoc(doc(db('author'), path), {
      ...persona,
      traits: [
        ...persona.traits,
        ...Array.from({ length: 8 }, (_, i) => ({
          ...persona.traits[0],
          id: `custom-${i}`,
          name: `Custom ${i}`,
        })),
      ],
    }),
  );
  await assertSucceeds(getDoc(doc(db('author'), path)));
  await assertFails(getDoc(doc(db(), path)));
  await assertFails(getDoc(doc(db('intruder'), path)));
  await assertFails(updateDoc(doc(db('author'), path), { name: 'Nova voz' }));
  await assertSucceeds(
    updateDoc(doc(db('author'), path), { archived: true, revision: 2, updatedAt: 2 }),
  );
  await assertFails(deleteDoc(doc(db('author'), path)));
  await assertFails(setDoc(doc(db('intruder'), path), persona));
});

it('nega campos estranhos, perfis reservados, limites e atributos fora da escala', async () => {
  await assertFails(setDoc(doc(db('author'), path), { ...persona, apiKey: 'secret' }));
  await assertFails(
    setDoc(doc(db('author'), path), { ...persona, traits: [null, ...persona.traits.slice(1)] }),
  );
  await assertFails(
    setDoc(doc(db('author'), path), { ...persona, instructions: 'x'.repeat(6001) }),
  );
  await assertFails(
    setDoc(doc(db('author'), path), {
      ...persona,
      traits: persona.traits.map((trait) => ({ ...trait, value: 101 })),
    }),
  );
  await assertFails(
    setDoc(doc(db('author'), path), {
      ...persona,
      traits: persona.traits.map((trait) => ({ ...trait, value: 0.5 })),
    }),
  );
  await assertFails(
    setDoc(doc(db('author'), 'users/author/aiPersonas/preset-incisive'), {
      ...persona,
      id: 'preset-incisive',
    }),
  );
});

it('vincula apenas personas próprias ou padrões e valida substituições do capítulo', async () => {
  await assertSucceeds(setDoc(doc(db('author'), path), persona));
  const book = doc(db('author'), 'books/book');
  await assertSucceeds(
    setDoc(book, {
      authorId: 'author',
      title: 'Livro',
      status: 'draft',
      localLoreVersion: 0,
      createdAt: 1,
      updatedAt: 1,
      personaId: 'preset-incisive',
    }),
  );
  await assertSucceeds(updateDoc(book, { personaId: 'custom-test' }));
  await assertFails(updateDoc(book, { personaId: 'preset-unknown' }));
  await assertFails(
    setDoc(doc(db('intruder'), 'books/other'), {
      authorId: 'intruder',
      title: 'Outro',
      status: 'draft',
      localLoreVersion: 0,
      createdAt: 1,
      updatedAt: 1,
      personaId: 'custom-test',
    }),
  );
  const chapter = doc(db('author'), 'books/book/chapters/chapter');
  await assertSucceeds(
    setDoc(chapter, {
      title: 'Cena',
      content: '',
      personaComplement: {
        personaId: 'preset-unsettling',
        overrides: [{ traitId: 'tension', value: 0 }],
      },
    }),
  );
  await assertFails(
    updateDoc(chapter, { personaComplement: { personaId: 'custom-missing', overrides: [] } }),
  );
  await assertFails(
    updateDoc(chapter, {
      personaComplement: {
        personaId: 'preset-unsettling',
        overrides: [{ traitId: 'tension', value: -1 }],
      },
    }),
  );
  await assertSucceeds(updateDoc(chapter, { personaComplement: null }));
  await assertSucceeds(updateDoc(book, { personaId: null }));
});
