import { after, before, beforeEach, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { setPersonaWithCatalog, updatePersonaWithCatalog } from './helpers/personaCatalog.mjs';

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
const setPersona = (database, path, value) =>
  setPersonaWithCatalog(database, doc(database, path), value);
const updatePersona = (database, path, value) =>
  updatePersonaWithCatalog(database, doc(database, path), value);
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
    setPersona(db('author'), path, {
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
  await assertFails(updatePersona(db('author'), path, { name: 'Nova voz' }));
  await assertSucceeds(
    updatePersona(db('author'), path, { archived: true, revision: 2, updatedAt: 2 }),
  );
  await assertFails(deleteDoc(doc(db('author'), path)));
  await assertFails(setDoc(doc(db('intruder'), path), persona));
});

it('nega campos estranhos, perfis reservados, limites e atributos fora da escala', async () => {
  await assertFails(setPersona(db('author'), path, { ...persona, apiKey: 'secret' }));
  await assertFails(
    setPersona(db('author'), path, { ...persona, traits: [null, ...persona.traits.slice(1)] }),
  );
  await assertFails(setPersona(db('author'), path, { ...persona, instructions: 'x'.repeat(6001) }));
  await assertFails(
    setPersona(db('author'), path, {
      ...persona,
      traits: persona.traits.map((trait) => ({ ...trait, value: 101 })),
    }),
  );
  await assertFails(
    setPersona(db('author'), path, {
      ...persona,
      traits: persona.traits.map((trait) => ({ ...trait, value: 0.5 })),
    }),
  );
  await assertFails(
    setPersona(db('author'), 'users/author/aiPersonas/preset-incisive', {
      ...persona,
      id: 'preset-incisive',
    }),
  );
});

it('vincula apenas personas próprias ou padrões e valida substituições do capítulo', async () => {
  const firestore = db('author');
  await assertSucceeds(setPersona(firestore, path, persona));
  const book = doc(firestore, 'books/book');
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
  const chapter = doc(firestore, 'books/book/chapters/chapter');
  const create = writeBatch(firestore);
  create.set(chapter, {
    title: 'Cena',
    content: '',
    personaComplement: {
      personaId: 'preset-unsettling',
      overrides: [{ traitId: 'tension', value: 0 }],
    },
  });
  create.update(book, { updatedAt: 2 });
  await assertSucceeds(create.commit());
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
  const clear = writeBatch(firestore);
  clear.update(chapter, { personaComplement: null });
  clear.update(book, { updatedAt: 3 });
  await assertSucceeds(clear.commit());
  await assertSucceeds(updateDoc(book, { personaId: null }));
});

it('exige o avanço do catálogo na mesma gravação e protege seu escopo e formato', async () => {
  const own = db('author'),
    profile = doc(own, path),
    catalog = doc(own, 'users/author/aiPersonaCatalog/current');
  await assertFails(setDoc(profile, persona));
  await assertSucceeds(setPersona(own, path, persona));
  await assertFails(updateDoc(profile, { revision: 2, name: 'Sem catálogo' }));
  await assertSucceeds(updatePersona(own, path, { revision: 2, name: 'Com catálogo' }));
  await assertFails(setDoc(catalog, { schemaVersion: 1, revision: 100 }));
  await assertFails(updateDoc(catalog, { instructions: 'private' }));
  await assertFails(deleteDoc(catalog));
  await assertFails(getDoc(doc(db('intruder'), 'users/author/aiPersonaCatalog/current')));
  await assertFails(getDoc(doc(db(), 'users/author/aiPersonaCatalog/current')));
});
