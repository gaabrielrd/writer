// Loaded only by the isolated visual server; production does not include this entry.
import { books, chapters, FIXTURE_BOOK_ID, FIXTURE_CHAPTER_ID, FIXTURE_SESSION_KEY } from './data';
import { countWords } from '../../../src/features/books/model/chapter';

const params = new URLSearchParams(location.search);
const width = params.get('width') ?? 'medium';
if (['small', 'medium', 'large'].includes(width))
  localStorage.setItem('writer:workspace-content-width', width);
localStorage.setItem('writer_theme', 'dark');
sessionStorage.setItem(FIXTURE_SESSION_KEY, 'true');
const paragraph =
  'Lia voltou ao Porto das Lanternas quando a última luz ainda repousava sobre as águas. ' +
  'Trazia nas mãos o Atlas das Marés e observou o caminho entre as casas, procurando uma passagem ' +
  'que permanecesse aberta até o farol. O mapa mostrava outras margens, mas a história que ela ' +
  'queria contar começava ali, entre os barcos e as vozes que chegavam da praça. ';
const sample =
  params.get('sample') === 'imported'
    ? (paragraph.match(/.{1,50}(?:\s|$)/g)?.join('\n') ?? paragraph)
    : paragraph.repeat(3);
const content = `# Uma página para escrever\n\n${Array(8).fill(sample).join('\n\n')}`;
sessionStorage.setItem(
  'writer.visual.private-books',
  JSON.stringify({
    books,
    chapters: chapters.map((chapter) =>
      chapter.id === FIXTURE_CHAPTER_ID
        ? {
            ...chapter,
            title: 'Uma página para escrever',
            content,
            wordCount: countWords(content),
          }
        : chapter,
    ),
  }),
);
history.replaceState(null, '', `/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
await import('../../../src/main');
