import type { ExportBlock, ExportDocument, ExportRun } from '../model/exportDocument';

function escapeText(text: string): string {
  return text
    .replace(/([\\`*_[\]{}()#+.!|~-])/g, '\\$1')
    .replace(/&(?=(?:#\d+|#x[0-9a-f]+|[a-z]\w*);)/gi, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderRun(run: ExportRun): string {
  const leading = run.code ? '' : (run.text.match(/^\s*/)?.[0] ?? '');
  const trailing = run.code ? '' : (run.text.match(/\s*$/)?.[0] ?? '');
  const core = run.text.trim();
  if (!core) return run.text.replace(/\n/g, '  \n');
  let text = escapeText(core).replace(/\n/g, '  \n');
  if (run.code) {
    const fence = '`'.repeat(
      Math.max(1, ...Array.from(run.text.matchAll(/`+/g), (match) => match[0].length + 1)),
    );
    text = `${fence} ${run.text.replace(/\n/g, ' ')} ${fence}`;
  } else {
    if (run.bold) text = `**${text}**`;
    if (run.italic) text = `*${text}*`;
    if (run.strike) text = `~~${text}~~`;
    if (run.underline) text = `<u>${text}</u>`;
  }
  if (run.href) text = `[${text}](<${run.href.replace(/</g, '%3C').replace(/>/g, '%3E')}>)`;
  return `${leading}${text}${trailing}`.replace(/(?<! {2})\n/g, '  \n');
}

function renderBlock(block: ExportBlock): string {
  const text = block.runs.map(renderRun).join('');
  switch (block.kind) {
    case 'heading':
      return `${'#'.repeat(Math.min(6, (block.level ?? 1) + 2))} ${text}`;
    case 'quote':
      return text
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
    case 'list':
      return `${'  '.repeat(block.level ?? 0)}${block.marker} ${text}`;
    case 'code': {
      const source = block.runs.map((run) => run.text).join('');
      const fence = '`'.repeat(
        Math.max(3, ...Array.from(source.matchAll(/`+/g), (match) => match[0].length + 1)),
      );
      return `${fence}\n${source}\n${fence}`;
    }
    case 'rule':
      return '---';
    default:
      return text;
  }
}

/** UTF-8 Markdown with quoted YAML metadata and no author IDs or private lore data. */
export function exportMarkdown(document: ExportDocument): string {
  const metadata = [`title: ${JSON.stringify(document.title)}`];
  if (document.genre) metadata.push(`genre: ${JSON.stringify(document.genre)}`);
  const opening = [`---\n${metadata.join('\n')}\n---`, `# ${escapeText(document.title)}`];
  if (document.synopsis) opening.push(escapeText(document.synopsis));
  for (const chapter of document.chapters) {
    opening.push(`## ${escapeText(chapter.title)}`);
    opening.push(chapter.blocks.map(renderBlock).join('\n\n'));
  }
  return `${opening.join('\n\n').trim()}\n`;
}
