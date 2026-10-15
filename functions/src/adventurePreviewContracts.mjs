import { parseFragment } from 'parse5';
import { workClosed, workFail, digest } from './workProgressContracts.mjs';
import { adventureBlockResource } from './adventureBlocksContracts.mjs';
import { adventureBlockTypes } from './adventureBlocksState.mjs';

export const PREVIEW_BYTES = 4 * 1024 * 1024;
export const PREVIEW_IMAGE_BYTES = 1.5 * 1024 * 1024;
export function previewAudience(value) {
  if (!['creator', 'gm', 'players'].includes(value))
    workFail('invalid-argument', 'Modo de prévia inválido.');
  return value;
}
export const allowedAudience = (mode, audience) =>
  mode === 'creator' || audience === 'players' || (mode === 'gm' && audience === 'gm');
export function previewStamp(snapshot) {
  const value = snapshot.updateTime;
  if (
    !value ||
    !Number.isSafeInteger(value.seconds) ||
    !Number.isInteger(value.nanoseconds) ||
    value.nanoseconds < 0 ||
    value.nanoseconds >= 1e9
  )
    workFail('failed-precondition', 'Não foi possível conferir a prévia salva.');
  return { seconds: value.seconds, nanoseconds: value.nanoseconds };
}
export function previewToken(context, value, audience) {
  return digest({
    version: 1,
    uid: context.uid,
    target: context.target,
    sceneId: value.scene.id,
    audience,
    revision: value.scene.revision,
    snapshot: previewStamp(value.sceneSnapshot),
  });
}
export const previewKey = (token, resource) => digest({ token, resource });
export const previewImageKey = (token, resource) =>
  Buffer.from(JSON.stringify({ version: 1, token, resource })).toString('base64url');
export function previewImageResource(value, token) {
  let parsed;
  try {
    if (typeof value !== 'string' || value.length > 12000 || !/^[A-Za-z0-9_-]+$/.test(value))
      throw new Error();
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString());
  } catch {
    workFail('invalid-argument', 'Imagem da prévia inválida.');
  }
  workClosed(parsed, ['version', 'token', 'resource']);
  if (parsed.version !== 1 || parsed.token !== token)
    workFail('failed-precondition', 'A prévia mudou. Atualize para continuar.');
  return adventureBlockResource(parsed.resource);
}
const tags = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'em',
  'b',
  'i',
  'u',
  's',
  'del',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'br',
  'hr',
]);
const blocked = new Set([
  'script',
  'style',
  'template',
  'form',
  'iframe',
  'object',
  'embed',
  'svg',
  'math',
  'img',
  'picture',
  'video',
  'audio',
  'source',
  'track',
  'input',
  'button',
  'textarea',
  'select',
  'noscript',
]);
const escape = (value) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
export function adventurePreviewHtml(content) {
  const root = parseFragment(content),
    output = [],
    stack = [...root.childNodes].reverse().map((node) => ({ node }));
  while (stack.length) {
    const entry = stack.pop();
    if (entry.close) {
      output.push(entry.close);
      continue;
    }
    const node = entry.node;
    if (node.nodeName === '#text') {
      output.push(escape(node.value));
      continue;
    }
    const tag = node.tagName;
    if (!tag || blocked.has(tag)) continue;
    const keep = tags.has(tag),
      isVoid = tag === 'br' || tag === 'hr';
    if (keep) output.push('<' + tag + '>');
    if (keep && !isVoid) stack.push({ close: '</' + tag + '>' });
    if (!isVoid)
      for (let index = (node.childNodes?.length ?? 0) - 1; index >= 0; index--)
        stack.push({ node: node.childNodes[index] });
  }
  return output.join('');
}
export function previewItem(resource, scene, block, content, image, token) {
  const main = resource.kind === 'scene';
  return {
    key: previewKey(token, resource),
    title: main ? (scene.mainBlockTitle ?? 'Texto principal') : block.title,
    narrativeType: adventureBlockTypes.includes(main ? scene.mainBlockType : block.narrativeType)
      ? main
        ? scene.mainBlockType
        : block.narrativeType
      : 'scene',
    html: adventurePreviewHtml(content),
    image: image
      ? { imageKey: previewImageKey(token, resource), alt: image.alt, caption: image.caption }
      : null,
  };
}
