import type * as Preview from '../../../src/features/adventure-blocks/model/adventurePreview';
import type {
  AdventureBlockAudience,
  AdventureBlockResource,
} from '../../../src/features/adventure-blocks/model/adventureBlock';
import { fixtureHash, fixtureSceneState, type FixtureSceneState } from './sceneStore';
import { fixtureOwner } from './studioStore';
import { fixtureLibraryImage } from './imageLibraryService';
import { fixtureSeedAdventurePreview } from './adventureBlocksFixture';
export { getAdventureBlockImage, setAdventureBlockImage } from './adventureBlocksFixture';

const derivativeDataUrl =
  'data:image/webp;base64,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';
type Scene = FixtureSceneState['scenes'][string];
type Reference = Omit<Preview.AdventureBlockImage, 'name'>;
type Entry = {
  resource: AdventureBlockResource;
  title: string;
  narrativeType: Preview.AdventureScenePreviewItem['narrativeType'];
  audience: AdventureBlockAudience;
  order: number;
  image: Reference | null;
};
function fail(message = 'Prévia indisponível.', code = 'failed-precondition'): never {
  throw Object.assign(new Error(message), { code: `functions/${code}` });
}
async function context(adventureId: string, sceneId: string) {
  const revoked = sessionStorage.getItem('writer.visual.preview-revoked-target');
  if (revoked === 'true' || revoked === adventureId || revoked === 'adventure:' + adventureId)
    fail('Prévia indisponível.', 'not-found');
  const state = await fixtureSceneState({ kind: 'adventure', id: adventureId }),
    scene = state.scenes[sceneId];
  if (!scene || scene.ownerId !== fixtureOwner() || ('deleting' in scene && scene.deleting))
    fail('Prévia indisponível.', 'not-found');
  if (scene.parentId !== null) {
    const group = state.groups[scene.parentId];
    if (!group || (group.deleting && !scene.archived)) fail('Prévia indisponível.', 'not-found');
  }
  return { state, scene };
}
function token(state: FixtureSceneState, scene: Scene, audience: AdventureBlockAudience) {
  return fixtureHash([state.ownerId, state.target.id, scene.id, audience, scene.revision]);
}
function permitted(audience: AdventureBlockAudience, mode: AdventureBlockAudience) {
  return mode === 'creator' || audience === 'players' || (mode === 'gm' && audience === 'gm');
}
function entries(state: FixtureSceneState, scene: Scene, mode: AdventureBlockAudience): Entry[] {
  const values: Entry[] = [
    {
      resource: { kind: 'scene', id: scene.id },
      title: scene.mainBlockTitle ?? 'Texto principal',
      narrativeType: scene.mainBlockType ?? 'scene',
      audience: scene.mainBlockAudience ?? 'creator',
      order: scene.mainBlockOrder ?? 0,
      image: scene.mainBlockImage ?? null,
    },
  ];
  for (const extra of Object.values(state.adventureBlocks ?? {})) {
    if (
      extra.sceneId !== scene.id ||
      extra.ownerId !== state.ownerId ||
      extra.archived ||
      extra.deleting
    )
      continue;
    values.push({
      resource: extra.resource,
      title: extra.title,
      narrativeType: extra.narrativeType,
      audience: extra.audience,
      order: extra.order,
      image: extra.image ?? null,
    });
  }
  return values
    .filter((entry) => permitted(entry.audience, mode))
    .sort((a, b) => a.order - b.order || a.resource.id.localeCompare(b.resource.id));
}
function itemKey(projectionToken: string, resource: AdventureBlockResource) {
  return fixtureHash(['item', projectionToken, resource]);
}
function mediaKey(projectionToken: string, resource: AdventureBlockResource) {
  return fixtureHash(['image', projectionToken, resource]);
}
function safeHtml(content: string) {
  const template = document.createElement('template'),
    output = document.createElement('div');
  template.innerHTML = content;
  const tags = new Set([
    'P',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'STRONG',
    'B',
    'EM',
    'I',
    'U',
    'S',
    'DEL',
    'UL',
    'OL',
    'LI',
    'BLOCKQUOTE',
    'PRE',
    'CODE',
    'BR',
    'HR',
  ]);
  const discard = new Set([
    'SCRIPT',
    'STYLE',
    'FORM',
    'IFRAME',
    'OBJECT',
    'EMBED',
    'SVG',
    'MATH',
    'TEMPLATE',
    'NOSCRIPT',
    'HEAD',
    'IMG',
    'VIDEO',
    'AUDIO',
    'INPUT',
    'BUTTON',
    'TEXTAREA',
    'SELECT',
  ]);
  const copy = (node: Node, parent: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(document.createTextNode(node.textContent ?? ''));
      return;
    }
    if (!(node instanceof Element) && !(node instanceof DocumentFragment)) return;
    if (node instanceof Element && discard.has(node.tagName)) return;
    const destination =
      node instanceof Element && tags.has(node.tagName)
        ? document.createElement(node.tagName.toLowerCase())
        : parent;
    if (destination !== parent) parent.appendChild(destination);
    for (const child of node.childNodes) copy(child, destination);
  };
  copy(template.content, output);
  return output.innerHTML;
}
const heldResponses = new Map<string, Promise<void>>();
async function gate(
  method: 'readAdventureScenePreview' | 'readAdventurePreviewImage',
  scope: string[],
) {
  const error = sessionStorage.getItem('writer.visual.preview-error');
  if (error === 'true' || error === method)
    fail('Conexão simulada indisponível. Tente novamente.', 'unavailable');
  const key = JSON.stringify([method, ...scope]),
    pending = heldResponses.get(key);
  if (pending) return pending;
  const hold = sessionStorage.getItem('writer.visual.preview-hold');
  if (hold === 'true' || hold === method) {
    sessionStorage.removeItem('writer.visual.preview-hold');
    const request = new Promise<void>((resolve) =>
      window.addEventListener(
        'writer.visual.release-preview',
        () => {
          if (heldResponses.get(key) === request) heldResponses.delete(key);
          resolve();
        },
        { once: true },
      ),
    );
    heldResponses.set(key, request);
    await request;
  }
}
function validateAudience(audience: AdventureBlockAudience) {
  if (!['creator', 'gm', 'players'].includes(audience)) fail('Modo inválido.', 'invalid-argument');
}
export async function readAdventureScenePreview(
  input: Preview.ReadAdventureScenePreviewInput,
): Promise<Preview.AdventureScenePreviewPage> {
  validateAudience(input.audience);
  const initial = await context(input.adventureId, input.sceneId);
  await fixtureSeedAdventurePreview(initial.state, initial.scene);
  const uid = fixtureOwner(),
    projectionToken = token(initial.state, initial.scene, input.audience);
  await gate('readAdventureScenePreview', [
    uid,
    input.adventureId,
    input.sceneId,
    input.audience,
    projectionToken,
  ]);
  const { state, scene } = await context(input.adventureId, input.sceneId);
  if (uid !== fixtureOwner()) fail('Prévia indisponível.', 'permission-denied');
  if (projectionToken !== token(state, scene, input.audience))
    fail('A cena mudou. Atualize a prévia.');
  const limit = input.limit ?? 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    fail('Página inválida.', 'invalid-argument');
  type Cursor = { token: string; lastKey: string };
  let cursor: Cursor | null = null;
  if (input.cursor) {
    try {
      cursor = JSON.parse(atob(input.cursor)) as Cursor;
    } catch {
      fail('Cursor inválido.', 'invalid-argument');
    }
    if (cursor.token !== projectionToken) fail('A cena mudou. Atualize a prévia.');
  }
  const allowed = entries(state, scene, input.audience);
  const index = cursor
    ? allowed.findIndex((entry) => itemKey(projectionToken, entry.resource) === cursor.lastKey)
    : -1;
  if (cursor && index < 0) fail('Cursor inválido.', 'invalid-argument');
  const pending = allowed.slice(index + 1),
    items: Preview.AdventureScenePreviewItem[] = [];
  for (const entry of pending.slice(0, limit)) {
    const body =
      entry.resource.kind === 'scene'
        ? state.bodies[scene.id]
        : state.adventureBlockBodies?.[entry.resource.id];
    if (typeof body !== 'string') fail('Texto indisponível.');
    const item: Preview.AdventureScenePreviewItem = {
      key: itemKey(projectionToken, entry.resource),
      title: entry.title,
      narrativeType: entry.narrativeType,
      html: safeHtml(body),
      image: entry.image
        ? {
            imageKey: mediaKey(projectionToken, entry.resource),
            alt: entry.image.alt,
            caption: entry.image.caption,
          }
        : null,
    };
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        items: [...items, item],
        nextCursor: btoa(JSON.stringify({ token: projectionToken, lastKey: item.key })),
        projectionToken,
      }),
    ).byteLength;
    if (bytes > 4 * 1024 * 1024) {
      if (!items.length) fail('O bloco excede o limite da prévia.', 'resource-exhausted');
      break;
    }
    items.push(item);
  }
  const last = items.at(-1);
  return {
    items,
    projectionToken,
    nextCursor:
      items.length < pending.length && last
        ? btoa(JSON.stringify({ token: projectionToken, lastKey: last.key }))
        : null,
  };
}
export async function readAdventurePreviewImage(
  input: Preview.ReadAdventurePreviewImageInput,
): Promise<{ dataUrl: string }> {
  validateAudience(input.audience);
  const initial = await context(input.adventureId, input.sceneId),
    uid = fixtureOwner();
  const check = (state: FixtureSceneState, scene: Scene) => {
    if (input.projectionToken !== token(state, scene, input.audience))
      fail('A cena mudou. Atualize a prévia.');
    const entry = entries(state, scene, input.audience).find(
      (item) => mediaKey(input.projectionToken, item.resource) === input.imageKey,
    );
    if (!entry?.image) fail('Imagem indisponível.', 'not-found');
    fixtureLibraryImage(entry.image.imageId);
  };
  check(initial.state, initial.scene);
  await gate('readAdventurePreviewImage', [
    uid,
    input.adventureId,
    input.sceneId,
    input.audience,
    input.projectionToken,
    input.imageKey,
  ]);
  const latest = await context(input.adventureId, input.sceneId);
  if (uid !== fixtureOwner()) fail('Imagem indisponível.', 'permission-denied');
  check(latest.state, latest.scene);
  return { dataUrl: derivativeDataUrl };
}
