import { studioDb } from './studioDb.mjs';
import { createScenesService } from '../../src/scenes.mjs';
import { createStudioService } from '../../src/studio.mjs';
import { createWorkHistoryService } from '../../src/workHistory.mjs';
import { createAdventureBlocksService } from '../../src/adventureBlocks.mjs';
import { createEditorChatContextService } from '../../src/editorChatContext.mjs';
import { editorChatRequestHash } from '../../src/editorChatContracts.mjs';
export const uid = 'author';
export const hash = (c) => c.repeat(64);
export const reason = (v) => (e) => e.details?.reason === v;
export async function signed(request) {
  return { ...request, requestHash: await editorChatRequestHash(request) };
}
export async function editorChatFixture(kind = 'adventure', block = false) {
  const f = studioDb(),
    events = [],
    original = f.db.runTransaction;
  f.db.runTransaction = (callback) =>
    original(async (tx) =>
      callback(
        new Proxy(tx, {
          get(object, key) {
            const fn = object[key];
            if (['get', 'getAll', 'set', 'update', 'create', 'delete'].includes(key))
              return (...args) => {
                events.push({
                  method: key,
                  path: args[0].path ?? args[0].collectionPath,
                  fields: args[1]?.fieldMask ?? args[0].fields ?? null,
                });
                return fn(...args);
              };
            return fn;
          },
        }),
      ),
    );
  const target = { kind, id: 'context-project-first' },
    path = `${kind === 'book' ? 'books' : 'adventures'}/${target.id}`;
  if (kind === 'book')
    f.records.set(path, {
      authorId: uid,
      title: 'Livro',
      wordCount: 0,
      createdAt: 100,
      updatedAt: 100,
    });
  else
    await createStudioService({ db: f.db, now: () => 100 }).createAdventure(uid, {
      operationId: target.id,
      title: 'Aventura',
    });
  const scenes = createScenesService({ db: f.db, now: () => 200 });
  const created = await scenes.createScene(uid, {
    target,
    operationId: 'context-scene-first',
    parentId: null,
    title: 'Cena',
    content: '<p>Texto próprio</p>',
  });
  let resource = { kind: 'scene', id: created.scene.id };
  if (block) {
    const createdBlock = await createAdventureBlocksService({
      db: f.db,
      now: () => 300,
    }).createAdventureBlock(uid, {
      adventureId: target.id,
      sceneId: resource.id,
      operationId: 'context-block-first',
      title: 'Adicional',
      narrativeType: 'scene',
      audience: 'creator',
      content: '<p>Bloco próprio</p>',
    });
    resource = createdBlock.block.resource;
  }
  const scope = { target, resource },
    saved = await createWorkHistoryService({ db: f.db }).getWorkVersionSource(uid, scope);
  const api = createEditorChatContextService({
    db: f.db,
    now: () => 1000,
    randomBytes: () => Buffer.alloc(32, 1),
  });
  const prepare = await signed({
    action: 'prepareContext',
    ...scope,
    operationId: 'context-first',
    contextId: 'context-first',
    base: { sourceToken: saved.sourceToken, revision: saved.revision, bodyHash: saved.contentHash },
    capture: {
      source: 'selection',
      editorHash: hash('a'),
      from: 0,
      to: 5,
      text: 'Aria',
      surroundingText: '',
      truncated: false,
    },
  });
  events.length = 0;
  const call = (request, actor = uid) => api.dispatch(actor, request);
  const mutate = async (request) => call(await signed(request));
  const advance = async (summary, op = 'advance-first') =>
    mutate({
      action: 'advanceContext',
      ...scope,
      contextId: summary.contextId,
      contextToken: summary.contextToken,
      expectedRevision: summary.revision,
      operationId: op,
    });
  const inspect = (summary) =>
    call({
      action: 'inspectContext',
      ...scope,
      contextId: summary.contextId,
      contextToken: summary.contextToken,
      expectedRevision: summary.revision,
    });
  return {
    ...f,
    events,
    target,
    path,
    scope,
    scenes,
    resource,
    api,
    call,
    mutate,
    prepare,
    advance,
    inspect,
  };
}
