// Server-only parser guard. Do not import this module in browser contracts.
import { parseFragment, Tokenizer } from 'parse5';
import {
  editorChatText,
  editorChatUTF8Bytes,
  EDITOR_CHAT_LIMITS,
  editorChatFail,
} from './editorChatContracts.mjs';
const tags = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'del',
  'br',
  'hr',
  'a',
]);
const attrs = {
  a: new Set(['href', 'target', 'rel', 'class', 'title']),
  ol: new Set(['start', 'type']),
  code: new Set(['class']),
};
export function assertEditorChatHTML(after) {
  editorChatText(after);
  if (editorChatUTF8Bytes(after) > EDITOR_CHAT_LIMITS.bodyBytes) editorChatFail('body-too-large');
  let invalid = false;
  const deny = () => {
      invalid = true;
    },
    noop = () => {};
  const tag = (token) => {
    if (!tags.has(token.tagName)) {
      invalid = true;
      return;
    }
    const seen = new Set();
    for (const a of token.attrs) {
      if (seen.has(a.name) || !attrs[token.tagName]?.has(a.name)) invalid = true;
      seen.add(a.name);
    }
  };
  // parseFragment silently discards document/doctype tokens. Inspect actual lexer
  // tokens too; regex scanning would misclassify escaped prose/attribute values.
  const tokenizer = new Tokenizer(
    {},
    {
      onStartTag: tag,
      onEndTag: tag,
      onComment: deny,
      onDoctype: deny,
      onEof: noop,
      onCharacter: noop,
      onNullCharacter: deny,
      onWhitespaceCharacter: noop,
      onParseError: deny,
    },
  );
  tokenizer.write(after, true);
  const root = parseFragment(after, {
    onParseError: () => {
      invalid = true;
    },
  });
  const stack = [...root.childNodes];
  while (stack.length) {
    const node = stack.pop();
    if (node.nodeName === '#text') continue;
    if (
      !node.tagName ||
      node.namespaceURI !== 'http://www.w3.org/1999/xhtml' ||
      !tags.has(node.tagName)
    ) {
      invalid = true;
      continue;
    }
    const seen = new Set();
    for (const a of node.attrs) {
      if (seen.has(a.name) || a.namespace || a.prefix || !attrs[node.tagName]?.has(a.name)) {
        invalid = true;
        continue;
      }
      seen.add(a.name);
      if (node.tagName === 'a' && a.name === 'href') {
        try {
          if (!['http:', 'https:', 'mailto:'].includes(new URL(a.value).protocol)) invalid = true;
        } catch {
          invalid = true;
        }
      }
      if (
        node.tagName === 'ol' &&
        a.name === 'start' &&
        (!/^[+-]?\d+$/.test(a.value.trim()) || !Number.isSafeInteger(Number(a.value)))
      )
        invalid = true;
      if (
        node.tagName === 'code' &&
        a.name === 'class' &&
        !/^language-[^\s\p{Cc}]+$/u.test(a.value)
      )
        invalid = true;
    }
    stack.push(...node.childNodes);
  }
  if (invalid) editorChatFail('unsafe-document');
  return after;
}
