import { defaultTreeAdapter, parseFragment, serialize } from 'parse5';

// Mirrors the existing visible prose format. The independent frontend oracle and
// shared corpus protect compatibility; this never changes the stored manuscript.
const PROSE_TAGS = new Set([
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
const BLOCK_BOUNDARIES = new Set([
  'div',
  'section',
  'article',
  'header',
  'footer',
  'aside',
  'main',
  'table',
  'tr',
]);
const HTML_WRAPPERS = new Set([
  'span',
  'html',
  'body',
  'font',
  'center',
  'tbody',
  'thead',
  'tfoot',
  'td',
  'th',
  'caption',
  'colgroup',
  'col',
  'figure',
  'figcaption',
  'details',
  'summary',
  'address',
  'dl',
  'dt',
  'dd',
]);
const DROP_CONTENT = new Set([
  'head',
  'title',
  'meta',
  'link',
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'svg',
  'math',
  'template',
  'noscript',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'video',
  'audio',
]);
const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

function safeHref(value) {
  try {
    const url = new URL(value.trim());
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function escapeHtml(text) {
  return text.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );
}

function inlineMarkdown(text, depth = 0) {
  if (depth > 8) return escapeHtml(text);
  const tokens =
    /`([^`\n]+)`|\[([^\]\n]+)\]\(([^\s)]+)\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|_([^_\n]+)_|~~([^~\n]+)~~/g;
  let result = '';
  let cursor = 0;
  for (const match of text.matchAll(tokens)) {
    result += escapeHtml(text.slice(cursor, match.index));
    if (match[1] !== undefined) result += `<code>${escapeHtml(match[1])}</code>`;
    else if (match[2] !== undefined && match[3] !== undefined) {
      const href = safeHref(match[3]);
      const label = inlineMarkdown(match[2], depth + 1);
      result += href ? `<a href="${escapeHtml(href)}">${label}</a>` : label;
    } else {
      const value = match[4] ?? match[5] ?? match[6] ?? match[7] ?? match[8] ?? '';
      const tag =
        match[4] !== undefined || match[5] !== undefined
          ? 'strong'
          : match[8] !== undefined
            ? 's'
            : 'em';
      result += `<${tag}>${inlineMarkdown(value, depth + 1)}</${tag}>`;
    }
    cursor = match.index + match[0].length;
  }
  return result + escapeHtml(text.slice(cursor));
}

function markdownToHtml(content) {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const output = [];
  let paragraph = [];
  let list = null;
  let code = null;
  const flushParagraph = () => {
    if (paragraph.length)
      output.push(`<p>${inlineMarkdown(paragraph.join('\n')).replace(/\n/g, '<br>')}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (list) output.push(`</${list}>`);
    list = null;
  };
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      flushParagraph();
      closeList();
      if (code) {
        output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
        code = null;
      } else code = [];
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    const item = /^\s*(?:([-+*])|\d+\.)\s+(.+)$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(line);
    if (heading || item || quote || /^\s*(?:---+|\*\*\*+)\s*$/.test(line)) {
      flushParagraph();
      if (item) {
        const nextList = item[1] ? 'ul' : 'ol';
        if (list !== nextList) {
          closeList();
          output.push(`<${nextList}>`);
          list = nextList;
        }
        output.push(`<li>${inlineMarkdown(item[2] ?? '')}</li>`);
      } else {
        closeList();
        if (heading) {
          const level = heading[1]?.length ?? 1;
          output.push(`<h${level}>${inlineMarkdown(heading[2] ?? '')}</h${level}>`);
        } else if (quote)
          output.push(`<blockquote><p>${inlineMarkdown(quote[1] ?? '')}</p></blockquote>`);
        else output.push('<hr>');
      }
    } else {
      closeList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  closeList();
  if (code) output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
  return output.join('');
}

function fragment(markup) {
  // Match document.createElement('template').innerHTML, including malformed tables.
  const context = defaultTreeAdapter.createElement('template', HTML_NAMESPACE, []);
  return parseFragment(context, markup, { scriptingEnabled: true });
}

function visibleHtml(content) {
  const isHtml =
    /^\s*(?:<!doctype\s+html[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<(?:p|h[1-6]|ul|ol|li|blockquote|pre|div|section|article|header|footer|aside|main|table|html|body)(?:\s[^>]*|)>/i.test(
      content,
    );
  const markup = (isHtml ? content : markdownToHtml(content)).replace(
    /<!--[\s\S]*?-->|<\/?([a-z][\p{L}\p{N}:_-]*)(?=[\s/>])(?:[^<>"']|"[^"]*"|'[^']*')*>/giu,
    (original, name) => {
      if (!name) return original;
      const tag = name.toLowerCase();
      if (
        PROSE_TAGS.has(tag) ||
        BLOCK_BOUNDARIES.has(tag) ||
        HTML_WRAPPERS.has(tag) ||
        DROP_CONTENT.has(tag) ||
        tag === 'img'
      )
        return original;
      return escapeHtml(
        `<${original.startsWith('</') ? '/' : ''}${name}${original.endsWith('/>') ? '/' : ''}>`,
      );
    },
  );
  const output = defaultTreeAdapter.createDocumentFragment();
  function copy(node, parent) {
    if (node.nodeName === '#text') {
      defaultTreeAdapter.insertText(parent, node.value);
      return;
    }
    if (!node.tagName) return;
    const tag = node.tagName.toLowerCase();
    if (DROP_CONTENT.has(tag)) return;
    const attribute = (name) => node.attrs.find((item) => item.name === name)?.value ?? '';
    if (tag === 'img') {
      const alt = attribute('alt');
      if (alt) defaultTreeAdapter.insertText(parent, alt);
      return;
    }
    const href = tag === 'a' ? safeHref(attribute('href')) : null;
    const keep = PROSE_TAGS.has(tag) && (tag !== 'a' || href !== null);
    const target = keep ? defaultTreeAdapter.createElement(tag, HTML_NAMESPACE, []) : parent;
    if (keep) {
      if (href)
        target.attrs.push(
          { name: 'href', value: href },
          { name: 'rel', value: 'noopener noreferrer' },
        );
      defaultTreeAdapter.appendChild(parent, target);
    }
    for (const child of node.childNodes) copy(child, target);
    if (BLOCK_BOUNDARIES.has(tag))
      defaultTreeAdapter.appendChild(
        parent,
        defaultTreeAdapter.createElement('br', HTML_NAMESPACE, []),
      );
    if (tag === 'td' || tag === 'th') defaultTreeAdapter.insertText(parent, ' ');
  }
  for (const child of fragment(markup).childNodes) copy(child, output);
  return serialize(output);
}

/** Counts the prose the existing reader displays; no DOM, I/O or manuscript mutation. */
export function countVisibleWords(content) {
  if (typeof content !== 'string') throw new TypeError('O manuscrito deve ser texto.');
  const normalized = visibleHtml(content)
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(?:p|div|h[1-6]|li|ul|ol|blockquote|pre|br|hr|section|tr)\b[^>]*>/gi, ' ');
  // Reparse the inert projection just as the browser counter reparses the
  // sanitizer output. Escaped placeholders remain literal visible text.
  function text(node) {
    if (node.nodeName === '#text') return node.value;
    return (node.childNodes ?? []).map(text).join('');
  }
  return text(fragment(normalized))
    .trim()
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}
