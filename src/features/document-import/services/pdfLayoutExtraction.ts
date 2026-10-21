import type { ImportBlock, ImportWarning } from '../model/documentImport';

export interface LayoutItem {
  str: string;
  transform?: number[];
  width?: number;
  height?: number;
  hasEOL?: boolean;
  fontName?: string;
  bold?: boolean;
  italic?: boolean;
}

export interface PdfRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface LayoutPage {
  number: number;
  width: number;
  height: number;
  items: (LayoutItem | object)[];
  boxes?: PdfRegion[];
  hasImages?: boolean;
  uncertain?: boolean;
}

interface Fragment extends LayoutItem {
  baselineY: number;
  x: number;
  y: number;
  height: number;
  width: number;
}
interface Line {
  text: string;
  html: string;
  baselineY: number;
  x: number;
  y: number;
  right: number;
  height: number;
  bold: boolean;
  isolated?: boolean;
  page: number;
  box?: number;
  cells?: string[];
}
export interface PdfSection {
  title: string;
  blocks: ImportBlock[];
  pages: number[];
}
export interface PdfLayoutResult {
  sections: PdfSection[];
  warnings: ImportWarning[];
}

const PRIMARY =
  /^(?:(?:cap[íi]tulo|chapter|parte|part|ato|act|livro|book)\s+(?:\d+|[ivxlcdm]+)|(?:ap[êe]ndice|appendix)\s+[a-z\d]+)(?:\s*[:\-–—]\s*.*)?$/i;
const PRIMARY_LABEL =
  /^(?:(?:cap[íi]tulo|chapter|parte|part|ato|act|livro|book)\s+(?:\d+|[ivxlcdm]+)|(?:ap[êe]ndice|appendix)\s+[a-z\d]+)\s*[:\-–—]?$/i;
const SPECIAL =
  /^(?:introdu[çc][ãa]o|introduction|pr[óo]logo|prologue|ep[íi]logo|epilogue|pref[áa]cio|posf[áa]cio)$/i;
const CONTENTS = /^(?:sum[áa]rio|[íi]ndice(?:\s+geral)?|contents|table of contents)$/i;
const ENTRY = /(?:\.\s*){2,}\s*\d+\s*$/;
const ATTRIBUTES = /^(?:FOR DES CON INT SAB CAR|STR DEX CON INT WIS CHA)$/;

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fragments(page: LayoutPage): Fragment[] {
  let syntheticY = page.height * 0.75;
  return page.items.flatMap((item) => {
    if (!('str' in item) || typeof item.str !== 'string' || !item.str.trim()) return [];
    const height = item.height || Math.abs(item.transform?.[3] ?? 12);
    const y = item.transform?.[5] ?? syntheticY;
    if (item.hasEOL) syntheticY -= height * 1.3;
    return [
      {
        ...item,
        x: item.transform?.[4] ?? 0,
        y,
        baselineY: y,
        height,
        width: item.width ?? item.str.length * height * 0.45,
      },
    ];
  });
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 12;
}

function bodySize(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.25)] ?? 12;
}

function makeLines(items: Fragment[], page: LayoutPage): Line[] {
  const rows: Fragment[][] = [];
  // PDF content-stream order is unrelated to reading order (headings can be painted last).
  for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const last = rows.at(-1);
    const row =
      last && Math.abs((last[0]?.y ?? 0) - item.y) <= Math.max(1.5, item.height * 0.18)
        ? last
        : undefined;
    if (row) row.push(item);
    else rows.push([item]);
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    let text = '';
    let html = '';
    const cells: string[] = [];
    let cell = '';
    let right: number | undefined;
    for (const item of row) {
      const gap = right === undefined ? 0 : item.x - right;
      const space =
        text && !/\s$/.test(text) && !/^\s/.test(item.str) && gap > item.height * 0.12 ? ' ' : '';
      if (cell && gap > item.height * 1.4) {
        cells.push(cell.trim());
        cell = '';
      }
      cell += (cell ? space : '') + item.str;
      text += space + item.str;
      let formatted = escape(item.str);
      if (item.bold) formatted = '<strong>' + formatted + '</strong>';
      if (item.italic) formatted = '<em>' + formatted + '</em>';
      html += space + formatted;
      right = Math.max(right ?? 0, item.x + item.width);
    }
    const first = row[0]!;
    const x = first.x;
    const y = median(row.map((item) => item.y));
    const box = page.boxes?.findIndex(
      (region) =>
        x >= region.x - 2 &&
        (right ?? x) <= region.x + region.width + 2 &&
        y >= region.y &&
        y <= region.y + region.height,
    );
    return {
      text: text.trim(),
      html: html.trim(),
      cells: [...cells, cell.trim()],
      x,
      y,
      baselineY: median(row.map((item) => item.baselineY)),
      right: right ?? x,
      // A decorative initial or one oversized fragment does not make its whole line a title.
      height: median(row.flatMap((item) => Array.from(item.str.trim(), () => item.height))),
      bold:
        row
          .filter((item) => item.bold)
          .reduce((total, item) => total + item.str.trim().length, 0) >=
        row.reduce((total, item) => total + item.str.trim().length, 0) * 0.9,
      page: page.number,
      ...(box !== undefined && box >= 0 ? { box } : {}),
    };
  });
}

function pageLines(page: LayoutPage): { lines: Line[]; bodyHeight: number; uncertain: boolean } {
  const items = fragments(page);
  const bodyHeight = bodySize(
    items.filter((item) => item.str.length > 3).map((item) => item.height),
  );
  const body = items.filter(
    (item) => item.height <= bodyHeight * 1.25 && item.str.trim().length >= 16,
  );
  let gutter: number | undefined;
  let best = 0;
  const candidates: number[] = [];
  for (let ratio = 0.3; ratio <= 0.7; ratio += 0.025) {
    const x = page.width * ratio;
    const left = body.filter((item) => item.x + item.width < x - bodyHeight * 0.5).length;
    const right = body.filter((item) => item.x > x + bodyHeight * 0.5).length;
    const crossing = body.filter((item) => item.x < x && item.x + item.width > x).length;
    const score = Math.min(left, right) - crossing * 3;
    if (left >= 3 && right >= 3 && score > 0) candidates.push(x);
    if (left >= 3 && right >= 3 && score > best) {
      gutter = x;
      best = score;
    }
  }
  const multipleGutters = candidates.some(
    (x, index) => index > 0 && x - candidates[index - 1]! > page.width * 0.04,
  );
  if (gutter === undefined)
    return { lines: makeLines(items, page), bodyHeight, uncertain: page.uncertain ?? false };
  const spans = items.filter(
    (item) =>
      item.height > bodyHeight * 1.25 &&
      ((item.x < gutter && item.x + item.width > gutter) ||
        ((PRIMARY.test(item.str.trim()) || SPECIAL.test(item.str.trim())) &&
          item.x < gutter &&
          item.y > page.height * 0.8)),
  );
  // A top-level heading begins a section even if the opposing column starts a few points higher.
  for (const span of spans)
    if (
      (PRIMARY.test(span.str.trim()) || SPECIAL.test(span.str.trim())) &&
      span.y > page.height * 0.8
    )
      span.y = Math.max(...items.map((item) => item.y)) + span.height;
  const spanRows = makeLines(spans, page).sort((a, b) => b.y - a.y);
  const ordinary = items.filter((item) => !spans.includes(item));
  const lines: Line[] = [];
  let upper = Infinity;
  // Full-width titles separate reading bands. Within each band, finish the left column first.
  for (const span of [...spanRows, undefined]) {
    const lower = span?.y ?? -Infinity;
    const band = ordinary.filter((item) => item.y < upper && item.y > lower);
    lines.push(
      ...makeLines(
        band.filter((item) => item.x < gutter),
        page,
      ),
      ...makeLines(
        band.filter((item) => item.x >= gutter),
        page,
      ),
    );
    if (span) lines.push(span);
    upper = lower;
  }
  return { lines, bodyHeight, uncertain: !!page.uncertain || multipleGutters };
}

function margin(line: Line, page: LayoutPage): boolean {
  // Keep large chapter titles even when they are placed in the top margin.
  return line.height <= 14 && (line.y > page.height * 0.9 || line.y < page.height * 0.08);
}

function isHeading(line: Line, bodyHeight: number): boolean {
  return (
    !ENTRY.test(line.text) &&
    line.text.length <= 200 &&
    (PRIMARY.test(line.text) || SPECIAL.test(line.text)) &&
    (line.height > bodyHeight * 1.15 || /^\s*(?:cap[íi]tulo|chapter)\s+/i.test(line.text))
  );
}

function isInternalHeading(line: Line, bodyHeight: number, continuation = false): boolean {
  return (
    line.box === undefined &&
    line.text.length <= 160 &&
    !ENTRY.test(line.text) &&
    (continuation || !/[.!?;]$/.test(line.text)) &&
    !/^(?:[•●▪]|\d+\s*$)/.test(line.text) &&
    (line.cells?.length ?? 1) === 1 &&
    (line.height > bodyHeight * 1.3 || (line.bold && !!line.isolated))
  );
}

function mergeHeadingLines(lines: Line[], bodyHeight: number): Line[] {
  const merged: Line[] = [];
  lines = lines.map((line, index) => {
    const previous = lines[index - 1];
    const next = lines[index + 1];
    const isolated =
      (!previous || previous.y <= line.y || previous.y - line.y > bodyHeight * 1.7) &&
      (!next || next.y >= line.y || line.y - next.y > bodyHeight * 1.7);
    return { ...line, isolated };
  });
  for (let index = 0; index < lines.length; index++) {
    let line = lines[index]!;
    if (
      SPECIAL.test(line.text) ||
      (!isHeading(line, bodyHeight) && !isInternalHeading(line, bodyHeight))
    ) {
      merged.push(line);
      continue;
    }
    let previous = line;

    while (index + 1 < lines.length) {
      const next = lines[index + 1]!;
      const completingLabel = PRIMARY_LABEL.test(line.text);
      const gap = previous.baselineY - next.baselineY;
      const sameColumn = Math.abs(line.x - next.x) <= Math.max(line.height, next.height) * 2;
      const sameStyle =
        Math.abs(previous.height - next.height) <= previous.height * 0.06 &&
        previous.bold === next.bold;
      if (
        !sameColumn ||
        next.page !== line.page ||
        gap <= 0 ||
        gap > Math.max(previous.height, next.height) * (completingLabel ? 2.8 : 1.55) ||
        isHeading(next, bodyHeight) ||
        !isInternalHeading(next, bodyHeight, !completingLabel) ||
        (!completingLabel && !sameStyle) ||
        (completingLabel &&
          (next.height < previous.height * 0.9 || next.height <= bodyHeight * 1.15)) ||
        line.text.length + next.text.length > 200
      )
        break;
      const separator = completingLabel ? ': ' : ' ';
      line = {
        ...line,
        text:
          line.text.replace(completingLabel ? /\s*[:\-–—]\s*$/ : /$/u, '') + separator + next.text,
        html: line.html + separator + next.html,
        right: Math.max(line.right, next.right),
        height: Math.max(line.height, next.height),
      };
      previous = next;
      index++;
    }
    merged.push(line);
  }
  return merged;
}

function headingSizes(lines: Line[], bodyHeight: number): number[] {
  const sizes: number[] = [];
  for (const line of lines
    .filter((line) => isInternalHeading(line, bodyHeight))
    .sort((a, b) => b.height - a.height)) {
    if (!sizes.some((height) => Math.abs(height - line.height) <= height * 0.06))
      sizes.push(line.height);
  }
  return sizes;
}

function proseBlocks(lines: Line[], bodyHeight: number, warnings: ImportWarning[]): ImportBlock[] {
  const blocks: ImportBlock[] = [];
  let group: Line[] = [];
  const sizes = headingSizes(lines, bodyHeight);
  const flush = () => {
    if (!group.length) return;
    const first = group[0]!;
    const text = group.map((line) => line.text).join(' ');
    const content = group.map((line) => line.html).join(' ');
    const list = /^[•●▪]\s*/.test(text);
    const html =
      first.box !== undefined
        ? '<blockquote><p>' + content + '</p></blockquote>'
        : list
          ? '<ul><li>' + content.replace(/^[•●▪]\s*/, '') + '</li></ul>'
          : '<p>' + content + '</p>';
    blocks.push({ html, text, page: first.page });
    group = [];
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const previous = group.at(-1);
    const next = lines[index + 1];
    if (ATTRIBUTES.test(line.text.replace(/\s+/g, ' ')) && next) {
      flush();
      const labels = line.text.split(/\s+/);
      const values = next.text.match(/\d+\s*\([+−–-]?\d+\)/g);
      if (values?.length === labels.length) {
        const text = labels.map((label, i) => label + ': ' + values[i]).join('; ');
        blocks.push({ html: '<p>' + escape(text) + '</p>', text, page: line.page });
        index++;
        continue;
      }
      warnings.push({
        code: 'table',
        message: 'Confira a associação entre atributos e valores nesta página.',
        pages: [line.page],
      });
    }
    const cells = line.cells ?? [];
    if (
      cells.length > 1 &&
      next?.cells?.length === cells.length &&
      /^\d/.test(next.cells[0] ?? '') &&
      cells.every((cell) => cell.length < 60 && !/[.!?]$/.test(cell))
    ) {
      flush();
      let cursor = index + 1;
      while (cursor < lines.length) {
        const row = lines[cursor]!;
        if (
          row.page !== line.page ||
          row.cells?.length !== cells.length ||
          !/^\d/.test(row.cells[0] ?? '') ||
          row.y > lines[cursor - 1]!.y
        )
          break;
        const text = cells.map((label, at) => label + ': ' + row.cells![at]).join('; ');
        blocks.push({ html: '<p>' + escape(text) + '</p>', text, page: row.page });
        cursor++;
      }
      index = cursor - 1;
      continue;
    }
    if (cells.length > 1 && /^\d/.test(cells[0] ?? '')) {
      flush();
      warnings.push({
        code: 'table',
        message: 'Confira as linhas de tabela com estrutura ambígua nesta página.',
        pages: [line.page],
      });
      const text = cells.join(' | ');
      blocks.push({ html: '<p>' + escape(text) + '</p>', text, page: line.page });
      continue;
    }
    if (isInternalHeading(line, bodyHeight)) {
      flush();
      const rank = sizes.findIndex((height) => Math.abs(height - line.height) <= height * 0.06);
      const level = Math.min(6, Math.max(0, rank) + 2);
      blocks.push({
        html: '<h' + level + '>' + line.html + '</h' + level + '>',
        text: line.text,
        page: line.page,
      });
      continue;
    }
    if (
      previous &&
      (line.page !== previous.page ||
        line.box !== previous.box ||
        line.y >= previous.y ||
        previous.y - line.y > bodyHeight * 1.65 ||
        Math.abs(line.x - previous.x) > bodyHeight * 2 ||
        /^[•●▪]\s*/.test(line.text))
    )
      flush();
    // Stat labels remain separate so their values and dice are never absorbed into another field.
    if (
      /^(?:Classe de Armadura|Pontos de Vida|Deslocamento|Armor Class|Hit Points|Speed|FOR |STR )/.test(
        line.text,
      )
    ) {
      flush();
      blocks.push({ html: '<p>' + line.html + '</p>', text: line.text, page: line.page });
    } else group.push(line);
  }
  flush();
  return blocks;
}

function contentsTitle(text: string): string {
  const title = text
    .replace(/(?:\.\s*){2,}\s*\d+\s*$/, '')
    .replace(/^\d+\s+/, '')
    .trim();
  const colon = title.indexOf(':');
  return (
    colon >= 0 && PRIMARY_LABEL.test(title.slice(0, colon)) ? title.slice(colon + 1).trim() : title
  ).toLocaleLowerCase();
}

export function extractPdfLayout(pages: LayoutPage[]): PdfLayoutResult {
  const layouts = pages.map((page) => {
    const layout = pageLines(page);
    return { ...layout, lines: mergeHeadingLines(layout.lines, layout.bodyHeight) };
  });
  const repeated = new Map<string, number>();
  pages.forEach((page, index) => {
    for (const text of new Set(
      layouts[index]!.lines.filter((line) => margin(line, page)).map((line) => line.text),
    ))
      repeated.set(text, (repeated.get(text) ?? 0) + 1);
  });
  const threshold = Math.max(3, Math.ceil(pages.length * 0.4));
  const warnings: ImportWarning[] = [];
  const sections: PdfSection[] = [];
  let title = 'Capítulo 1';
  let pending: Line[] = [];
  let sectionPages: number[] = [];
  const flush = () => {
    const height = bodySize(pending.map((line) => line.height));
    const blocks = proseBlocks(pending, height, warnings);
    if (blocks.length) sections.push({ title, blocks, pages: [...new Set(sectionPages)] });
    pending = [];
    sectionPages = [];
  };
  pages.forEach((page, pageIndex) => {
    const layout = layouts[pageIndex]!;
    const lines = layout.lines.filter(
      (line) =>
        !margin(line, page) ||
        (!/^\d+$/.test(line.text) && (repeated.get(line.text) ?? 0) < threshold),
    );
    const entries = lines.filter((line) => ENTRY.test(line.text));
    const containsTitle = lines.some((line) => CONTENTS.test(line.text));
    // Only remove a TOC page when entries point to real later headings. No hard-coded page numbers.
    const entryTitles = entries.map((line) => contentsTitle(line.text));
    const matches = entryTitles.filter((entry) =>
      layouts
        .slice(pageIndex + 1)
        .some((later) => later.lines.some((line) => contentsTitle(line.text) === entry)),
    ).length;
    const contentsPage =
      entries.length >= 3 &&
      (containsTitle || entries.length >= lines.length * 0.6) &&
      matches >= 2;
    if (contentsPage) {
      const preliminary = title === 'Capítulo 1' && sections.length === 0 ? [...sectionPages] : [];
      if (preliminary.length) {
        pending = [];
        sectionPages = [];
      }
      warnings.push({
        code: 'contents',
        message: 'Página de sumário excluída do texto. Confira a página original.',
        pages: [...new Set([...preliminary, page.number])],
      });
      return;
    }
    if (!lines.some((line) => /[\p{L}]/u.test(line.text))) {
      warnings.push({
        code: 'no-text',
        message: 'Página sem texto extraível; mapas e imagens não serão importados.',
        pages: [page.number],
      });
      return;
    }
    if (page.hasImages)
      warnings.push({
        code: 'visual-content',
        message: 'Há imagens nesta página. A importação conserva apenas o texto.',
        pages: [page.number],
      });
    if (layout.uncertain)
      warnings.push({
        code: 'layout',
        message: 'A diagramação desta página exige conferência na prévia.',
        pages: [page.number],
      });
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index]!;
      if (isHeading(line, layout.bodyHeight)) {
        flush();
        title = line.text;
        sectionPages.push(page.number);
      } else pending.push(line);
      sectionPages.push(page.number);
    }
  });
  flush();
  const combined = new Map<string, ImportWarning>();
  for (const warning of warnings) {
    const key = warning.code + warning.message;
    const existing = combined.get(key);
    if (existing) existing.pages = [...new Set([...existing.pages, ...warning.pages])];
    else combined.set(key, warning);
  }
  return { sections, warnings: [...combined.values()] };
}
