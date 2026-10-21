import test from 'node:test';
import assert from 'node:assert/strict';
import { editorChatFixture, uid, reason, signed } from './helpers/editorChatFixture.mjs';
import { createEditorChatContextService } from '../src/editorChatContext.mjs';
import { createAdventureLoreService } from '../src/adventureLore.mjs';
import { DEFAULT_PERSONAS } from '../src/personaProfile.mjs';
import { createWorkHistoryService } from '../src/workHistory.mjs';
const ctx = (f, id) => `users/${uid}/editorChatContexts/${id}`;
const body = (f, id) => `users/${uid}/editorChatContextBodies/${id}`;
const opened = (f) =>
  f.events.filter((e) => e.method === 'get' && e.path?.includes('/editorChatContextBodies/'));
const ownLore = (name = 'Aria') => ({
  name,
  aliases: [],
  category: 'character',
  summary: 'Resumo',
  details: 'Prosa privada',
  structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
  relations: [],
  isPublic: false,
});
async function addLocal(f, id = 'context-lore-local') {
  const api = createAdventureLoreService({ db: f.db, now: () => 400 });
  const list = await api.listAdventureLore(uid, { adventureId: f.target.id, scope: 'adventure' });
  return api.saveAdventureLore(uid, {
    adventureId: f.target.id,
    adventureToken: list.adventureToken,
    entityId: id,
    operationId: id,
    expectedRevision: 0,
    expectedCollectionRevision: list.collectionRevision,
    entity: ownLore(),
  });
}
for (const [kind, block] of [
  ['book', false],
  ['adventure', false],
  ['adventure', true],
])
  test(`prepare/advance/inspect is private and exact for ${kind}/${block ? 'block' : 'scene'}`, async () => {
    const f = await editorChatFixture(kind, block);
    const prepared = await f.call(f.prepare);
    assert.equal(prepared.current.phase, 'local');
    assert.equal(prepared.current.matchedEntityCount, null);
    assert.equal(JSON.stringify(prepared).includes('Aria'), false);
    const ready = await f.advance(prepared.current);
    assert.equal(ready.current.phase, 'ready');
    const inspection = await f.inspect(ready.current);
    assert.equal(inspection.freshness, 'current');
    assert.equal(inspection.frozen.capture.text, 'Aria');
    assert.equal(inspection.frozen.source.sourceToken, f.prepare.base.sourceToken);
    await assert.rejects(
      f.call({ ...f.prepare, operationId: 'intruder', contextId: 'intruder' }, 'other'),
    );
    assert.deepEqual(await f.call(f.prepare), { receipt: prepared.receipt, current: null });
    assert.deepEqual(
      await f.call({
        action: 'getContext',
        ...f.scope,
        contextId: ready.current.contextId,
        contextToken: ready.current.contextToken,
      }),
      ready.current,
    );
    await assert.rejects(f.inspect({ ...ready.current, revision: 1 }), reason('revision-conflict'));
    assert.ok(f.records.get(ctx(f, ready.current.contextId)).birthNonce);
  });

test('full local pages win aliases before global and unrelated catalog size is not capped', async () => {
  const f = await editorChatFixture('book');
  const root = f.records.get(f.path);
  root.universeId = 'world';
  f.records.set('universes/world', { authorId: uid, loreVersion: 0, privacyVersion: 0 });
  for (let i = 0; i < 100; i++)
    f.records.set(`${f.path}/lore/${String(i).padStart(3, '0')}`, { ...ownLore('Unrelated ' + i) });
  f.records.set(`${f.path}/lore/zz`, { ...ownLore('Local'), aliases: ['Aria'] });
  f.records.set('universes/world/lore/zz', {
    ...ownLore('Global'),
    aliases: ['Aria'],
    isPublic: true,
  });
  let current = (await f.call(f.prepare)).current;
  const phases = [];
  for (let i = 0; i < 10 && current.phase !== 'ready'; i++) {
    current = (await f.advance(current, 'page-' + i)).current;
    phases.push(current.phase);
  }
  assert.deepEqual(phases, ['local', 'local', 'global', 'ready']);
  assert.equal(current.scannedLocal, 101);
  assert.equal(current.scannedGlobal, 1);
  const { frozen } = await f.inspect(current);
  assert.equal(frozen.lore.length, 1);
  assert.equal(frozen.lore[0].reference.kind, 'book');
  assert.equal(frozen.lore[0].name, 'Local');
  assert.ok(
    f.reads.filter((e) => e.collectionPath.endsWith('/lore')).every((e) => e.maximum <= 50),
  );
});

test('advance marks stale before opening prior derived terms when clock or source changes', async () => {
  for (const changed of ['clock', 'source', 'recreated']) {
    const f = await editorChatFixture('book');
    const prepared = (await f.call(f.prepare)).current;
    if (changed === 'clock') f.records.get(f.path).localLoreVersion = 1;
    if (changed === 'source')
      f.metadata.set(`${f.path}/scenes/${f.resource.id}`, { updatedAt: 99 });
    if (changed === 'recreated') f.metadata.set(f.path, { createdAtNanoseconds: 987 });
    f.events.length = 0;
    const stale = await f.advance(prepared);
    assert.equal(stale.current.phase, 'stale');
    assert.equal(opened(f).length, 0);
    assert.equal(stale.receipt.result.phase, 'stale');
  }
});

test('ordinary lore edit preserves frozen inspection as stale; deletion/recreation blocks before body', async () => {
  const f = await editorChatFixture();
  await addLocal(f);
  const prepared = (await f.call(f.prepare)).current,
    ready = (await f.advance(prepared)).current;
  const original = (await f.inspect(ready)).frozen;
  f.records.get(`${f.path}/lore/context-lore-local`).name = 'Nome novo';
  f.records.get(f.path).loreVersion++;
  const stale = await f.inspect(ready);
  assert.equal(stale.freshness, 'stale');
  assert.deepEqual(stale.frozen, original);
  f.records.get(`${f.path}/lore/context-lore-local`).deleted = true;
  f.events.length = 0;
  await assert.rejects(f.inspect(ready), reason('provenance-revoked'));
  assert.equal(opened(f).length, 0);
  f.records.get(`${f.path}/lore/context-lore-local`).deleted = false;
  f.metadata.set(`${f.path}/lore/context-lore-local`, { createdAtNanoseconds: 123 });
  f.events.length = 0;
  await assert.rejects(f.inspect(ready), reason('provenance-revoked'));
  assert.equal(opened(f).length, 0);
});

test('a corrupt manifest cannot be used to discover dependencies by opening the body', async () => {
  const f = await editorChatFixture();
  const ready = (await f.advance((await f.call(f.prepare)).current)).current;
  f.records.get(ctx(f, ready.contextId)).closureManifest.leaves = [];
  f.events.length = 0;
  await assert.rejects(f.inspect(ready));
  assert.equal(opened(f).length, 0);
  assert.ok(f.records.has(body(f, ready.contextId)));
});

test('non-ready inspection also rejects same-ID source recreation', async () => {
  const f = await editorChatFixture(),
    prepared = (await f.call(f.prepare)).current;
  f.metadata.set(f.path, { createdAtNanoseconds: 999 });
  f.events.length = 0;
  await assert.rejects(f.inspect(prepared), reason('identity-changed'));
  assert.equal(opened(f).length, 0);
});

test('switching current binding to an unavailable profile does not revoke the captured preset', async () => {
  const f = await editorChatFixture();
  f.records.get(f.path).personaId = DEFAULT_PERSONAS[0].id;
  const ready = (await f.advance((await f.call(f.prepare)).current)).current;
  f.records.get(f.path).personaId = 'missing';
  f.records.get(f.path).personaRevision = 1;
  const view = await f.inspect(ready);
  assert.equal(view.freshness, 'stale');
  assert.equal(view.frozen.persona.base.id, DEFAULT_PERSONAS[0].id);
});

test('root persona is configured before scenes, CAS is separate and exact retry is historical', async () => {
  const f = await editorChatFixture();
  f.records.delete(`${f.path}/scenes/${f.resource.id}`);
  f.records.delete(`${f.path}/scenes/${f.resource.id}/body/current`);
  const get = { action: 'getAdventurePersonaBinding', adventureId: f.target.id, sceneId: null };
  const first = await f.call(get);
  assert.deepEqual(first.value, { personaId: null });
  assert.equal(first.personaRevision, 0);
  const request = await signed({
    action: 'setAdventurePersonaBinding',
    adventureId: f.target.id,
    adventureToken: first.adventureToken,
    sceneId: null,
    expectedBindingToken: first.bindingToken,
    value: { personaId: DEFAULT_PERSONAS[0].id },
    operationId: 'persona-root',
  });
  const before = f.records.get(f.path),
    revision = before.sceneRevision,
    wordCount = before.wordCount;
  const saved = await f.call(request);
  assert.equal(saved.current.personaRevision, 1);
  assert.equal(f.records.get(f.path).sceneRevision, revision);
  assert.equal(f.records.get(f.path).wordCount, wordCount);
  assert.deepEqual(await f.call(request), { receipt: saved.receipt, current: null });
  await assert.rejects(
    f.mutate({ ...request, operationId: 'persona-stale' }),
    reason('revision-conflict'),
  );
  const anon = createEditorChatContextService({ db: f.db });
  await assert.rejects(anon.dispatch('other', get), reason('source-unavailable'));
});

test('custom profile is metadata-gated and unavailable profile prose is never read', async () => {
  const f = await editorChatFixture();
  const custom = { ...structuredClone(DEFAULT_PERSONAS[0]), id: 'minha-persona' };
  const profilePath = `users/${uid}/aiPersonas/${custom.id}`;
  f.records.set(profilePath, custom);
  const first = await f.call({
    action: 'getAdventurePersonaBinding',
    adventureId: f.target.id,
    sceneId: null,
  });
  await f.mutate({
    action: 'setAdventurePersonaBinding',
    adventureId: f.target.id,
    adventureToken: first.adventureToken,
    sceneId: null,
    expectedBindingToken: first.bindingToken,
    value: { personaId: custom.id },
    operationId: 'custom',
  });
  const metadataIndex = f.events.findIndex((e) => e.path === profilePath && e.method === 'getAll');
  const bodyIndex = f.events.findIndex((e) => e.path === profilePath && e.method === 'get');
  assert.ok(metadataIndex >= 0 && bodyIndex > metadataIndex);
  custom.archived = true;
  f.records.set(profilePath, custom);
  f.events.length = 0;
  await assert.rejects(f.call(f.prepare), reason('provenance-revoked'));
  assert.equal(
    f.events.some((e) => e.path === profilePath && e.method === 'get'),
    false,
  );
});

test('adventure additional inherits scene complement; binding changes preserve all text and ledgers', async () => {
  const f = await editorChatFixture('adventure', true);
  const sceneId = f.records.get(`${f.path}/sceneBlocks/${f.resource.id}`).sceneId;
  const get = { action: 'getAdventurePersonaBinding', adventureId: f.target.id, sceneId: null };
  const root = await f.call(get);
  await f.mutate({
    action: 'setAdventurePersonaBinding',
    adventureId: f.target.id,
    adventureToken: root.adventureToken,
    sceneId: null,
    expectedBindingToken: root.bindingToken,
    value: { personaId: DEFAULT_PERSONAS[0].id },
    operationId: 'root-base',
  });
  const scene = await f.call({ ...get, sceneId });
  const beforeScene = structuredClone(f.records.get(`${f.path}/scenes/${sceneId}`));
  const blockBefore = structuredClone(f.records.get(`${f.path}/sceneBlocks/${f.resource.id}`));
  const ledgerBefore = [...f.records]
    .filter(([p]) => p.includes('workProgress'))
    .map(([p, v]) => [p, structuredClone(v)]);
  const chosen = {
    personaId: DEFAULT_PERSONAS[1].id,
    overrides: [{ traitId: DEFAULT_PERSONAS[1].traits[0].id, value: 91 }],
  };
  const saved = await f.mutate({
    action: 'setAdventurePersonaBinding',
    adventureId: f.target.id,
    adventureToken: scene.adventureToken,
    sceneId,
    expectedBindingToken: scene.bindingToken,
    value: { personaComplement: chosen },
    operationId: 'scene-complement',
  });
  assert.equal(saved.current.sceneToken, scene.sceneToken);
  assert.equal(f.records.get(`${f.path}/scenes/${sceneId}`).revision, beforeScene.revision);
  assert.equal(f.records.get(`${f.path}/scenes/${sceneId}`).bodyHash, beforeScene.bodyHash);
  assert.deepEqual(f.records.get(`${f.path}/sceneBlocks/${f.resource.id}`), blockBefore);
  assert.deepEqual(
    [...f.records].filter(([p]) => p.includes('workProgress')),
    ledgerBefore,
  );
  const source = await createWorkHistoryService({ db: f.db }).getWorkVersionSource(uid, f.scope);
  const prepared = await f.mutate({
    ...f.prepare,
    operationId: 'after-binding',
    contextId: 'after-binding',
    base: {
      sourceToken: source.sourceToken,
      revision: source.revision,
      bodyHash: source.contentHash,
    },
  });
  const ready = (await f.advance(prepared.current)).current;
  const view = await f.inspect(ready);
  assert.equal(view.frozen.persona.base.id, DEFAULT_PERSONAS[0].id);
  assert.equal(view.frozen.persona.complement.id, DEFAULT_PERSONAS[1].id);
  assert.match(view.frozen.persona.instruction, /Complemento da cena/);
});

test('complex matching fails atomically without truncation and leaves the prepared capture', async () => {
  const f = await editorChatFixture('book');
  f.records.set(`${f.path}/lore/aria`, ownLore());
  const request = await signed({
    ...f.prepare,
    capture: { ...f.prepare.capture, text: '', surroundingText: 'Aria '.repeat(4097) },
  });
  const prepared = (await f.call(request)).current;
  const before = structuredClone(f.records.get(ctx(f, prepared.contextId)));
  await assert.rejects(f.advance(prepared), reason('context-too-complex'));
  assert.deepEqual(f.records.get(ctx(f, prepared.contextId)), before);
  assert.equal(
    f.records.get(body(f, prepared.contextId)).capture.surroundingText,
    request.capture.surroundingText,
  );
});

test('prepare tests orphan body existence without opening revoked derived prose', async () => {
  const f = await editorChatFixture();
  f.records.set(body(f, f.prepare.contextId), { schemaVersion: 1, secret: 'revoked' });
  f.events.length = 0;
  await assert.rejects(f.call(f.prepare), reason('operation-conflict'));
  assert.equal(opened(f).length, 0);
});
