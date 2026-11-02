import { before, beforeEach, after, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, runTransaction } from 'firebase/firestore';
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
let environment;
const tokens = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-hover',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'input',
  'ring',
  'success',
  'success-foreground',
  'warning',
  'warning-foreground',
];
const theme = (i) => ({
  id: 'custom-' + i,
  name: 'Tema ' + i,
  base: 'light',
  highlight: '#227755',
  style: 'neutral',
  overrides: {},
  palette: Object.fromEntries(tokens.map((t) => [t, '#ffffff'])),
  generatorVersion: 1,
  revision: 1,
  createdAt: 1,
  updatedAt: 1,
});
const catalog = (count, revision = count) => ({
  schemaVersion: 1,
  revision,
  changedId: 'custom-' + (count - 1),
  themes: Object.fromEntries(Array.from({ length: count }, (_, i) => ['custom-' + i, theme(i)])),
});
const ref = (uid) =>
  doc(
    uid
      ? environment.authenticatedContext(uid).firestore()
      : environment.unauthenticatedContext().firestore(),
    'users/author/preferences/themes',
  );
before(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'demo-writer-custom-themes',
    firestore: { host, port: Number(port), rules: await readFile('firestore.rules', 'utf8') },
  });
});
beforeEach(async () => environment.clearFirestore());
after(async () => environment?.cleanup());
async function seed(count) {
  for (let i = 1; i <= count; i++) await assertSucceeds(setDoc(ref('author'), catalog(i)));
}
it('salva cinco temas privados e rejeita sexta vaga, intruso, anônimo e revisão antiga', async () => {
  await seed(5);
  await assertSucceeds(getDoc(ref('author')));
  await assertFails(getDoc(ref('intruder')));
  await assertFails(getDoc(ref(null)));
  await assertFails(setDoc(ref('author'), catalog(6)));
  await assertFails(setDoc(ref('author'), { ...catalog(5), revision: 5 }));
  await assertFails(setDoc(ref('intruder'), { ...catalog(5), revision: 6 }));
  const next = catalog(5, 6);
  delete next.themes['custom-4'];
  await assertSucceeds(setDoc(ref('author'), next));
});
it('nega CSS arbitrário, campos extras, tokens ausentes, tipos inválidos e alterações fora do ID declarado', async () => {
  for (const item of [
    { ...theme(0), palette: { ...theme(0).palette, background: 'url(https://invalid)' } },
    { ...theme(0), overrides: { background: '#000000' } },
    { ...theme(0), overrides: { unexpected: '#ffffff' } },
    { ...theme(0), palette: { background: '#ffffff' } },
    { ...theme(0), palette: { ...theme(0).palette, background: 123 } },
    { ...theme(0), palette: { ...theme(0).palette, background: ['#ffffff'] } },
    { ...theme(0), name: 'x'.repeat(41) },
    { ...theme(0), base: 'system' },
    { ...theme(0), apiKey: 'forged' },
  ])
    await assertFails(
      setDoc(ref('author'), {
        schemaVersion: 1,
        revision: 1,
        changedId: 'custom-0',
        themes: { 'custom-0': item },
      }),
    );
  await assertFails(setDoc(ref('author'), catalog(2, 1)));
  await assertSucceeds(
    setDoc(ref('author'), {
      schemaVersion: 1,
      revision: 1,
      changedId: 'custom-0',
      themes: { 'custom-0': { ...theme(0), overrides: { background: '#ffffff' } } },
    }),
  );
  await assertFails(
    setDoc(ref('author'), {
      ...catalog(2, 2),
      themes: { 'custom-0': { ...theme(0), name: 'Forjado' }, 'custom-1': theme(1) },
    }),
  );
});
it('duas transações concorrentes não criam seis temas', async () => {
  await seed(4);
  const target = ref('author');
  const add = async (i) =>
    runTransaction(target.firestore, async (tx) => {
      const snapshot = await tx.get(target),
        current = snapshot.data();
      tx.set(target, {
        ...current,
        revision: current.revision + 1,
        changedId: 'custom-' + i,
        themes: { ...current.themes, ['custom-' + i]: theme(i) },
      });
    });
  const results = await Promise.allSettled([add(4), add(5)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(Object.keys((await getDoc(ref('author'))).data().themes).length, 5);
});
