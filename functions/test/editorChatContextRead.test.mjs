import test from 'node:test';
import assert from 'node:assert/strict';
import { editorChatFixture, uid, reason } from './helpers/editorChatFixture.mjs';
import {
  readEditorChatSource,
  readEditorChatEnvironment,
  readEditorChatPersona,
  authorizeEditorChatManifest,
} from '../src/editorChatContextRead.mjs';
import { DEFAULT_PERSONAS } from '../src/personaProfile.mjs';

for (const [kind, block] of [
  ['book', false],
  ['adventure', false],
  ['adventure', true],
])
  test(`native source identity matches public history (${kind}/${block ? 'block' : 'scene'})`, async () => {
    const f = await editorChatFixture(kind, block);
    const read = () =>
      f.db.runTransaction((tx) =>
        readEditorChatSource(tx, f.db, uid, f.scope, { withContent: true }),
      );
    const source = await read();
    assert.equal(source.source.sourceToken, f.prepare.base.sourceToken);
    assert.equal(source.source.bodyHash, f.prepare.base.bodyHash);
    assert.equal(source.source.revision, f.prepare.base.revision);
    assert.notEqual(f.prepare.capture.editorHash, source.source.bodyHash);
    assert.equal(source.source.containerScene !== null, block);
    const bodyPath = source.bodySnapshot.ref.path;
    f.metadata.set(bodyPath, { createdAtNanoseconds: 999 });
    const recreated = await read();
    assert.notEqual(recreated.source.resourceToken, source.source.resourceToken);
    assert.equal(recreated.source.sourceToken, source.source.sourceToken);
  });

test('block token binds the native scene even when old block/body remain', async () => {
  const f = await editorChatFixture('adventure', true);
  const read = () => f.db.runTransaction((tx) => readEditorChatSource(tx, f.db, uid, f.scope));
  const before = await read();
  f.metadata.set(before.scene.snapshot.ref.path, { createdAtNanoseconds: 222 });
  const after = await read();
  assert.notEqual(after.source.containerScene.token, before.source.containerScene.token);
  assert.notEqual(after.source.resourceToken, before.source.resourceToken);
});

test('legacy book clock zero never claims an empty local library', async () => {
  const f = await editorChatFixture('book');
  f.records.set(`${f.path}/lore/old`, {
    name: 'Aria',
    aliases: [],
    category: 'character',
    details: 'história',
  });
  const value = await f.db.runTransaction(async (tx) =>
    readEditorChatEnvironment(tx, f.db, await readEditorChatSource(tx, f.db, uid, f.scope)),
  );
  assert.equal(value.localVersion, 0);
  assert.equal(f.records.get(f.path).localLoreVersion, undefined);
  f.records.get(f.path).localLoreVersion = null;
  await assert.rejects(
    f.db.runTransaction(async (tx) =>
      readEditorChatEnvironment(tx, f.db, await readEditorChatSource(tx, f.db, uid, f.scope)),
    ),
    reason('inconsistent'),
  );
});

test('book persona inherits base plus chapter, never an independent scene override', async () => {
  const f = await editorChatFixture('book');
  f.records.get(f.path).personaId = DEFAULT_PERSONAS[0].id;
  const scene = f.records.get(`${f.path}/scenes/${f.resource.id}`);
  scene.parentId = 'chapter';
  scene.personaComplement = { personaId: 'missing', overrides: [] };
  f.records.set(`${f.path}/chapters/chapter`, {
    ownerId: uid,
    contentMode: 'scenes',
    personaComplement: { personaId: DEFAULT_PERSONAS[1].id, overrides: [] },
  });
  const persona = await f.db.runTransaction(async (tx) =>
    readEditorChatPersona(tx, f.db, await readEditorChatSource(tx, f.db, uid, f.scope), {
      full: true,
    }),
  );
  assert.equal(persona.snapshot.base.id, DEFAULT_PERSONAS[0].id);
  assert.equal(persona.snapshot.complement.id, DEFAULT_PERSONAS[1].id);
  assert.match(persona.snapshot.instruction, /Complemento do capítulo/);
});

test('malformed or unbound manifests fail before any context body', async () => {
  const f = await editorChatFixture();
  await assert.rejects(
    f.db.runTransaction((tx) =>
      authorizeEditorChatManifest(
        tx,
        f.db,
        uid,
        f.scope,
        { version: 1, leaves: [] },
        '0'.repeat(64),
      ),
    ),
  );
  assert.equal(
    f.events.some((e) => e.path?.includes('editorChatContextBodies') && e.method === 'get'),
    false,
  );
});
