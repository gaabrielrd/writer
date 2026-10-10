import { describe, expect, it } from 'vitest';
import { renderRichText, sanitizeRichText } from '../sanitizeRichText';

describe('safe rich text', () => {
  it('preserves prose formatting while dropping all author metadata and event/style attributes', () => {
    const html = sanitizeRichText(
      '<h2 id="private-id">Title</h2><p onclick="bad()" style="color:red">A <strong data-secret="spoiler">hero</strong><span data-lore-id="secret"> returns</span>.</p><ul><li>One</li></ul><blockquote><p>Quote</p></blockquote>',
    );
    expect(html).toBe(
      '<h2>Title</h2><p>A <strong>hero</strong> returns.</p><ul><li>One</li></ul><blockquote><p>Quote</p></blockquote>',
    );
  });
  it('removes active content, embedded documents, media and image tracking completely', () => {
    const html = sanitizeRichText(
      '<script>alert(1)</script><style>body{}</style><iframe srcdoc="secret"></iframe><svg><text>hidden</text></svg><math>x</math><template>secret</template><form>secret</form><img src="https://tracker.test" onerror="alert(1)"><p>Safe<!-- private --></p>',
    );
    expect(html).toBe('<p>Safe</p>');
  });
  it('allows only safe absolute link protocols and never emits executable URLs', () => {
    const html = sanitizeRichText(
      '<a href="jav&#x61;script:alert(1)">unsafe</a><a href="data:text/html,evil">data</a><a href="/relative">local</a><a href="https://example.com" target="_blank" onclick="bad()"><em>safe</em></a><a href="mailto:a@example.com">email</a>',
    );
    expect(html).toBe(
      'unsafedatalocal<a href="https://example.com/" rel="noopener noreferrer"><em>safe</em></a><a href="mailto:a@example.com" rel="noopener noreferrer">email</a>',
    );
  });
  it('converts legacy Markdown headings, emphasis, lists, links, quotes and code', () => {
    const html = renderRichText(
      '# Heading\n\nA **bold** and _italic_ **word**.\nnext line\n\n- first\n- second\n\n1. ordered\n\n> quoted\n\n`code` ~~gone~~ [link](https://example.com)\n\n---\n\n```ts\nconst x = 1;\n```',
    );
    expect(html).toContain('<h1>Heading</h1>');
    expect(html).toContain('<strong>bold</strong> and <em>italic</em>');
    expect(html).toContain('<br>next line');
    expect(html).toContain('<ul><li>first</li><li>second</li></ul>');
    expect(html).toContain('<ol><li>ordered</li></ol>');
    expect(html).toContain('<blockquote><p>quoted</p></blockquote>');
    expect(html).toContain('<code>code</code> <s>gone</s>');
    expect(html).toContain('<a href="https://example.com/" rel="noopener noreferrer">link</a>');
    expect(html).toContain('<pre><code>const x = 1;</code></pre>');
  });
  it('escapes plain text, closes unfinished code and does not turn Markdown URLs into injection', () => {
    expect(renderRichText('A & B < 3 "quoted"')).toBe('<p>A &amp; B &lt; 3 "quoted"</p>');
    expect(renderRichText('[click](javascript:evil)')).toBe('<p>click</p>');
    expect(renderRichText('```\nunfinished')).toBe('<pre><code>unfinished</code></pre>');
    expect(renderRichText('')).toBe('');
    expect(renderRichText('__bold__ and *italic*')).toBe(
      '<p><strong>bold</strong> and <em>italic</em></p>',
    );
  });
  it('sanitizes imported HTML directly without flattening formatting', () => {
    expect(renderRichText('<p><u>Under</u> <s>deleted</s><br><b>Bold</b> <i>italic</i></p>')).toBe(
      '<p><u>Under</u> <s>deleted</s><br><b>Bold</b> <i>italic</i></p>',
    );
  });
});

it('preserves text boundaries and alternative text when simplifying imported wrappers and tables', () => {
  expect(
    sanitizeRichText(
      '<div>One</div><section>Two</section><table><tr><td>First</td><td>Second</td></tr></table><img alt="A map" src="https://tracker.test">',
    ),
  ).toBe('One<br>Two<br>First Second <br><br>A map');
  expect(renderRichText('```html\n<p>Example</p>\n```')).toBe(
    '<pre><code>&lt;p&gt;Example&lt;/p&gt;</code></pre>',
  );
});

it('keeps HTML-looking inline code and angle-bracket prose literal in legacy Markdown', () => {
  expect(renderRichText('Use `<p>` here.')).toBe('<p>Use <code>&lt;p&gt;</code> here.</p>');
  expect(renderRichText('Olá <nome>, leia <capítulo> e <lugar>.')).toBe(
    '<p>Olá &lt;nome&gt;, leia &lt;capítulo&gt; e &lt;lugar&gt;.</p>',
  );
  expect(renderRichText('<nome>')).toBe('<p>&lt;nome&gt;</p>');
  expect(renderRichText('Anote `<strong>texto</strong>` e **coragem**.')).toBe(
    '<p>Anote <code>&lt;strong&gt;texto&lt;/strong&gt;</code> e <strong>coragem</strong>.</p>',
  );
  expect(renderRichText('Antes\n\n```html\n<p>Olá <nome></p>\n```\n\nDepois')).toBe(
    '<p>Antes</p><pre><code>&lt;p&gt;Olá &lt;nome&gt;&lt;/p&gt;</code></pre><p>Depois</p>',
  );
});

it('preserves imported document formatting and literal placeholders together', () => {
  expect(
    renderRichText('<p>Olá <nome>! <capítulo> <strong>Coragem</strong> e <em>fé</em>.</p>'),
  ).toBe('<p>Olá &lt;nome&gt;! &lt;capítulo&gt; <strong>Coragem</strong> e <em>fé</em>.</p>');
  expect(
    renderRichText('  <!-- import --> <h2>Capítulo</h2><p><u>Texto</u><br>Outra linha</p>'),
  ).toContain('<h2>Capítulo</h2><p><u>Texto</u><br>Outra linha</p>');
  expect(renderRichText('<div>Antes <nome></div><p>Depois</p>')).toBe(
    'Antes &lt;nome&gt;<br><p>Depois</p>',
  );
  expect(renderRichText('<p><placeholder data-lore-id="private">nome</placeholder></p>')).toBe(
    '<p>&lt;placeholder&gt;nome&lt;/placeholder&gt;</p>',
  );
});
