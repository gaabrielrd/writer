/** A deliberately small, inert prose format shared by reading and export. */
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

function safeHref(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/** Never preserves editor metadata, event handlers, styling, embeds or remote images. */
export function sanitizeRichText(html: string): string {
  // A template is inert, including its images/frames; parsing never mounts the source DOM.
  const template = document.createElement('template');
  // Unknown bare tags may be literal placeholders in a manuscript, not markup.
  // Preserve their names as text before the HTML parser can consume them.
  template.innerHTML = html.replace(
    /<!--[\s\S]*?-->|<\/?([a-z][\p{L}\p{N}:_-]*)(?=[\s/>])(?:[^<>"']|"[^"]*"|'[^']*')*>/giu,
    (markup: string, name: string | undefined) => {
      if (!name) return markup;
      const tag = name.toLowerCase();
      if (
        PROSE_TAGS.has(tag) ||
        BLOCK_BOUNDARIES.has(tag) ||
        HTML_WRAPPERS.has(tag) ||
        DROP_CONTENT.has(tag) ||
        tag === 'img'
      )
        return markup;
      // Unknown attributes are metadata, and are deliberately never published.
      return escapeHtml(
        `<${markup.startsWith('</') ? '/' : ''}${name}${markup.endsWith('/>') ? '/' : ''}>`,
      );
    },
  );
  const output = document.createElement('div');

  function copy(node: Node, parent: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(document.createTextNode(node.textContent ?? ''));
      return;
    }
    if (!(node instanceof Element)) return;
    const tag = node.tagName.toLowerCase();
    if (DROP_CONTENT.has(tag)) return;
    if (tag === 'img') {
      const alt = node.getAttribute('alt');
      if (alt) parent.appendChild(document.createTextNode(alt));
      return;
    }
    const href = tag === 'a' ? safeHref(node.getAttribute('href') ?? '') : null;
    const keep = PROSE_TAGS.has(tag) && (tag !== 'a' || href !== null);
    const target = keep ? document.createElement(tag) : parent;
    if (keep && target instanceof Element) {
      if (href) {
        target.setAttribute('href', href);
        target.setAttribute('rel', 'noopener noreferrer');
      }
      parent.appendChild(target);
    }
    for (const child of node.childNodes) copy(child, target);
    if (BLOCK_BOUNDARIES.has(tag)) parent.appendChild(document.createElement('br'));
    if (tag === 'td' || tag === 'th') parent.appendChild(document.createTextNode(' '));
  }

  for (const child of template.content.childNodes) copy(child, output);
  return output.innerHTML;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character] ?? character;
  });
}

function inlineMarkdown(text: string, depth = 0): string {
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

function markdownToHtml(content: string): string {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const output: string[] = [];
  let paragraph: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let code: string[] | null = null;
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

/** Accepts the editor's Markdown or imported HTML and returns the same safe prose subset. */
export function renderRichText(content: string): string {
  // Legacy editor content is Markdown. A tag mentioned in prose or code is not
  // evidence of an HTML document; imported documents start with a known block.
  const isHtml =
    /^\s*(?:<!doctype\s+html[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<(?:p|h[1-6]|ul|ol|li|blockquote|pre|div|section|article|header|footer|aside|main|table|html|body)(?:\s[^>]*|)>/i.test(
      content,
    );
  return sanitizeRichText(isHtml ? content : markdownToHtml(content));
}
