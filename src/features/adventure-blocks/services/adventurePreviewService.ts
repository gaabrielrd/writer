import { narrativeTypes } from '../model/adventureBlock';
import type { AdventureScenePreviewPage } from '../model/adventurePreview';
export {
  getAdventureBlockImage,
  setAdventureBlockImage,
  readAdventureScenePreview,
  readAdventurePreviewImage,
} from './adventurePreviewCallables';

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
  'S',
  'U',
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
const remove = new Set([
  'SCRIPT',
  'STYLE',
  'FORM',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'SVG',
  'MATH',
  'TEMPLATE',
  'INPUT',
  'BUTTON',
  'SELECT',
  'TEXTAREA',
  'IMG',
  'VIDEO',
  'AUDIO',
  'SOURCE',
  'LINK',
  'META',
]);
/** A segunda fronteira de renderização nunca expande lore ou URLs do manuscrito. */
export function renderAdventurePreviewHtml(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const target = document.createElement('div');
  function append(source: Node, parent: Node) {
    if (source.nodeType === Node.TEXT_NODE) {
      parent.appendChild(document.createTextNode(source.textContent ?? ''));
      return;
    }
    if (!(source instanceof Element) || remove.has(source.tagName)) return;
    const child = tags.has(source.tagName)
      ? document.createElement(source.tagName.toLowerCase())
      : document.createDocumentFragment();
    for (const node of source.childNodes) append(node, child);
    parent.appendChild(child);
  }
  for (const node of parsed.body.childNodes) append(node, target);
  return target.innerHTML;
}
export function validateAdventureScenePreview(
  value: AdventureScenePreviewPage,
): AdventureScenePreviewPage {
  if (
    !value ||
    !Array.isArray(value.items) ||
    value.items.length > 50 ||
    !/^[a-f0-9]{64}$/.test(value.projectionToken) ||
    (value.nextCursor !== null && typeof value.nextCursor !== 'string') ||
    new TextEncoder().encode(JSON.stringify(value)).byteLength > 4 * 1024 * 1024
  )
    throw new Error('A prévia recebida não pôde ser confirmada. Atualize a composição.');
  const seen = new Set<string>();
  const items = value.items.map((item) => {
    if (
      !item ||
      typeof item.key !== 'string' ||
      !item.key ||
      seen.has(item.key) ||
      typeof item.title !== 'string' ||
      typeof item.html !== 'string' ||
      !narrativeTypes.includes(item.narrativeType) ||
      (item.image !== null &&
        (!item.image ||
          typeof item.image.imageKey !== 'string' ||
          !item.image.imageKey ||
          typeof item.image.alt !== 'string' ||
          typeof item.image.caption !== 'string'))
    )
      throw new Error('A prévia recebida não pôde ser confirmada. Atualize a composição.');
    seen.add(item.key);
    return {
      key: item.key,
      title: item.title,
      narrativeType: item.narrativeType,
      html: renderAdventurePreviewHtml(item.html),
      image: item.image
        ? { imageKey: item.image.imageKey, alt: item.image.alt, caption: item.image.caption }
        : null,
    };
  });
  return { items, nextCursor: value.nextCursor, projectionToken: value.projectionToken };
}
export function validateAdventurePreviewImage(value: { dataUrl: string }): string {
  if (
    !value ||
    typeof value.dataUrl !== 'string' ||
    !/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.dataUrl)
  )
    throw new Error('A ilustração projetada não pôde ser confirmada. Atualize a prévia.');
  const encoded = value.dataUrl.slice(value.dataUrl.indexOf(',') + 1);
  const bytes =
    (encoded.length * 3) / 4 - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0);
  if (encoded.length % 4 !== 0 || bytes > 1.5 * 1024 * 1024)
    throw new Error('A ilustração projetada excede o limite permitido.');
  return value.dataUrl;
}
