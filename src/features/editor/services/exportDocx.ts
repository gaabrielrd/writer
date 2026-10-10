import type { ExportBlock, ExportDocument, ExportRun } from '../model/exportDocument';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const OFFICE_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function xml(text: string): string {
  // XML 1.0 cannot contain control characters, even when HTML accepted them.
  return Array.from(text)
    .filter((char) => {
      const point = char.codePointAt(0) ?? 0;
      return (
        point === 9 ||
        point === 10 ||
        point === 13 ||
        (point >= 32 && point <= 0xd7ff) ||
        (point >= 0xe000 && point <= 0xfffd) ||
        point >= 0x10000
      );
    })
    .join('')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function runXml(run: ExportRun, linkId?: string): string {
  const properties = [
    run.bold ? '<w:b/>' : '',
    run.italic ? '<w:i/>' : '',
    run.underline ? '<w:u w:val="single"/>' : '',
    run.strike ? '<w:strike/>' : '',
    run.code ? '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>' : '',
  ].join('');
  const text = run.text
    .split('\n')
    .map((line) => `<w:t xml:space="preserve">${xml(line)}</w:t>`)
    .join('<w:br/>');
  const output = `<w:r><w:rPr>${properties}</w:rPr>${text}</w:r>`;
  return linkId ? `<w:hyperlink r:id="${linkId}">${output}</w:hyperlink>` : output;
}

function paragraph(runs: ExportRun[], properties = '', links?: Map<string, string>): string {
  return `<w:p><w:pPr>${properties}</w:pPr>${runs.map((run) => runXml(run, run.href ? links?.get(run.href) : undefined)).join('')}</w:p>`;
}

function blockXml(block: ExportBlock, links: Map<string, string>): string {
  switch (block.kind) {
    case 'heading':
      return paragraph(
        block.runs,
        `<w:pStyle w:val="Heading${Math.min(6, (block.level ?? 1) + 1)}"/>`,
        links,
      );
    case 'quote':
      return paragraph(block.runs, '<w:pStyle w:val="Quote"/>', links);
    case 'code':
      return paragraph(block.runs, '<w:pStyle w:val="Code"/>', links);
    case 'list':
      return paragraph(
        [{ text: `${block.marker === '-' ? '•' : block.marker} ` }, ...block.runs],
        `<w:ind w:left="${720 + (block.level ?? 0) * 360}" w:hanging="360"/>`,
        links,
      );
    case 'rule':
      return paragraph([{ text: '⁂' }], '<w:jc w:val="center"/>');
    default:
      return paragraph(block.runs, '', links);
  }
}

function stylesXml(): string {
  const headings = Array.from(
    { length: 6 },
    (_, index) =>
      `<w:style w:type="paragraph" w:styleId="Heading${index + 1}"><w:name w:val="heading ${index + 1}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="180"/><w:outlineLvl w:val="${index}"/></w:pPr><w:rPr><w:b/><w:color w:val="000000"/><w:sz w:val="${36 - index * 2}"/></w:rPr></w:style>`,
  ).join('');
  return `${XML_HEADER}<w:styles xmlns:w="${WORD_NS}">
    <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/><w:sz w:val="24"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="360" w:lineRule="auto"/><w:widowControl/></w:pPr></w:pPrDefault></w:docDefaults>
    <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
    <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:after="360"/></w:pPr><w:rPr><w:sz w:val="48"/><w:color w:val="000000"/></w:rPr></w:style>
    ${headings}
    <w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720" w:right="360"/></w:pPr><w:rPr><w:i/></w:rPr></w:style>
    <w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/><w:sz w:val="20"/></w:rPr></w:style>
  </w:styles>`;
}

/** Creates an actual OPC/OOXML package, not HTML renamed to .docx. */
export async function exportDocx(document: ExportDocument, signal?: AbortSignal): Promise<Blob> {
  signal?.throwIfAborted();
  const { default: JSZip } = await import('jszip');
  signal?.throwIfAborted();
  const zip = new JSZip();
  const links = new Map<string, string>();
  for (const chapter of document.chapters) {
    for (const block of chapter.blocks) {
      for (const run of block.runs) {
        if (run.href && !links.has(run.href)) links.set(run.href, `link${links.size + 1}`);
      }
    }
  }
  const body = [paragraph([{ text: document.title }], '<w:pStyle w:val="Title"/>')];
  if (document.genre) body.push(paragraph([{ text: document.genre, italic: true }]));
  if (document.synopsis) body.push(paragraph([{ text: document.synopsis }]));
  document.chapters.forEach((chapter, index) => {
    body.push(
      paragraph(
        [{ text: chapter.title }],
        `<w:pStyle w:val="Heading1"/>${index > 0 ? '<w:pageBreakBefore/>' : ''}`,
      ),
    );
    body.push(...chapter.blocks.map((block) => blockXml(block, links)));
  });
  zip.file(
    '[Content_Types].xml',
    `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
  );
  zip.file(
    '_rels/.rels',
    `${XML_HEADER}<Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL_NS}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
  );
  zip.file(
    'docProps/core.xml',
    `${XML_HEADER}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(document.title)}</dc:title><dc:creator>Writer Assistant</dc:creator><dc:language>pt-BR</dc:language></cp:coreProperties>`,
  );
  zip.file(
    'word/document.xml',
    `${XML_HEADER}<w:document xmlns:w="${WORD_NS}" xmlns:r="${OFFICE_REL_NS}"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1247" w:right="1247" w:bottom="1247" w:left="1247" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`,
  );
  zip.file('word/styles.xml', stylesXml());
  zip.file(
    'word/_rels/document.xml.rels',
    `${XML_HEADER}<Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL_NS}/styles" Target="styles.xml"/>${Array.from(links, ([href, id]) => `<Relationship Id="${id}" Type="${OFFICE_REL_NS}/hyperlink" Target="${xml(href)}" TargetMode="External"/>`).join('')}</Relationships>`,
  );
  const bytes = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' }, () =>
    signal?.throwIfAborted(),
  );
  signal?.throwIfAborted();
  return new Blob([bytes], { type: DOCX_MIME });
}
