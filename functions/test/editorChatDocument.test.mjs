import test from 'node:test';
import assert from 'node:assert/strict';
import { assertEditorChatHTML } from '../src/editorChatDocument.mjs';
const rejected = (value, reason = 'unsafe-document') =>
  assert.throws(
    () => assertEditorChatHTML(value),
    (e) => e.details?.reason === reason,
  );
test('real editor aliases, list numbering and code languages preserve exact bytes', () => {
  const samples = [
    '<p><b>ação</b> <strong>nova</strong> <i>x</i><em>y</em><u>u</u><s>s</s><del>d</del></p>',
    '<ol start="0" type="I"><li><p>zero</p></li></ol>',
    '<ol start="-3"><li><p>negativo</p></li></ol>',
    '<pre><code class="language-c++">x &lt; y</code></pre>',
    '<pre><code class="language-c#">ação\n  Ω 😀</code></pre>',
    '<p><a href="https://example.com/x" target="_blank" rel="noopener noreferrer nofollow" title="&lt;html&gt;" class="link">x</a></p>',
    '<p>&lt;!doctype html&gt; e &lt;html&gt; são texto próprio.</p>',
    '<p><a href="mailto:a@example.com" title="&lt;!--literal--&gt;">mail</a></p>',
    '<h1>h</h1><h6>h</h6><ul><li><p>i</p></li></ul><blockquote><p>b</p></blockquote><hr><p>a<br>b</p>',
    '',
  ];
  for (const s of samples) assert.equal(assertEditorChatHTML(s), s);
});
for (const [name, html] of [
  ['doctype discarded by fragment parser', '<!doctype html><p>x</p>'],
  ['html/body wrappers discarded by fragment parser', '<html><body><p>x</p></body></html>'],
  ['head silently discarded', '<head></head><p>x</p>'],
  ['discarded forbidden end tag', '<p>x</p></script>'],
  ['comment', '<p>x<!--note--></p>'],
  ['event attribute', '<p onclick="alert(1)">x</p>'],
  ['style', '<p style="color:red">x</p>'],
  ['duplicate attr', '<ol start="1" start="2"><li>x</li></ol>'],
  ['foreign namespace', '<svg><text>x</text></svg>'],
  ['namespace attr', '<a xlink:href="https://example.com">x</a>'],
  ['entity/javascript URL', '<p><a href="java&#10;script:alert(1)">x</a></p>'],
  ['data URL', '<a href="data:text/html,x">x</a>'],
  ['relative URL', '<a href="/local">x</a>'],
  ['invalid list number', '<ol start="1.5"><li>x</li></ol>'],
  ['unsafe integer list start', '<ol start="9007199254740992"><li>x</li></ol>'],
  ['arbitrary code class', '<code class="hidden">x</code>'],
  ['NUL parse error', '<p>\0</p>'],
])
  test('rejects ' + name + ' without rewriting', () => rejected(html));
test('UTF8 byte budget is exact and surrogate replacement is never silent', () => {
  const exact = '<p>' + 'x'.repeat(799993) + '</p>';
  assert.equal(assertEditorChatHTML(exact), exact);
  rejected(exact + 'x', 'body-too-large');
  rejected('<p>\ud800</p>', 'invalid-request');
});
