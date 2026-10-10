import type { UserProfile } from '../../../src/features/auth/model/user';
import type { Book } from '../../../src/features/books/model/book';
import { countWords, type Chapter } from '../../../src/features/books/model/chapter';
import type { LoreEntity } from '../../../src/features/lore/model/loreEntity';

export const FIXTURE_TIME = Date.UTC(2026, 8, 18, 14, 30);
export const FIXTURE_SESSION_KEY = 'writer.visual.authenticated';
export const FIXTURE_BOOK_ID = 'visual-atlas';
export const FIXTURE_CHAPTER_ID = 'visual-chapter-1';
export const FIXTURE_LABEL = 'Prévia visual • dados fictícios';

export const author: UserProfile = {
  uid: 'visual-author',
  displayName: 'Marina de Exemplo',
  email: 'autora@example.test',
  photoUrl: null,
  credits: 84,
  tier: 'free',
  createdAt: FIXTURE_TIME,
  updatedAt: FIXTURE_TIME,
};

function cover(title: string, background: string, accent: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="500" viewBox="0 0 360 500"><rect width="360" height="500" fill="${background}"/><circle cx="180" cy="180" r="108" fill="none" stroke="${accent}" stroke-width="1"/><circle cx="180" cy="180" r="84" fill="none" stroke="${accent}" stroke-width="1"/><path d="M180 68 232 180 180 292 128 180Z" fill="${accent}" opacity=".32"/><path d="M52 344H308" stroke="${accent}"/><text x="180" y="384" text-anchor="middle" font-family="serif" font-size="22" fill="${accent}">${title}</text><text x="180" y="445" text-anchor="middle" font-family="sans-serif" font-size="10" letter-spacing="3" fill="${accent}">MARINA DE EXEMPLO</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const books: Book[] = [
  {
    id: FIXTURE_BOOK_ID,
    authorId: author.uid,
    title: 'O Atlas das Marés Esquecidas',
    genre: 'Fantasia literária',
    synopsis:
      'Uma cartógrafa encontra um mapa que muda a cada amanhecer. Entre ilhas que guardam memórias e cidades submersas, Lia precisa escolher quais histórias merecem voltar à superfície.',
    coverUrl: cover('O ATLAS DAS MARÉS', '#172c36', '#d9c591'),
    status: 'draft',
    wordCount: 18420,
    createdAt: FIXTURE_TIME - 86_400_000 * 30,
    updatedAt: FIXTURE_TIME,
  },
  {
    id: 'visual-long-title',
    authorId: author.uid,
    title:
      'Todas as cartas que escrevemos antes de o último farol da cidade desaparecer no horizonte',
    genre: 'Romance contemporâneo e realismo mágico',
    synopsis:
      'Duas irmãs reorganizam as cartas de uma família e descobrem uma cidade inteira nas entrelinhas. Uma história sobre distância, pertencimento e os pequenos gestos que nos fazem retornar.',
    coverUrl: cover('AS ÚLTIMAS CARTAS', '#593e36', '#e8c7b5'),
    status: 'published',
    wordCount: 42680,
    createdAt: FIXTURE_TIME - 86_400_000 * 60,
    updatedAt: FIXTURE_TIME - 86_400_000,
  },
  {
    id: 'visual-no-cover',
    authorId: author.uid,
    title: 'Jardim de Inverno',
    genre: 'Contos',
    synopsis: '',
    coverUrl: null,
    status: 'draft',
    wordCount: 2180,
    createdAt: FIXTURE_TIME - 86_400_000 * 7,
    updatedAt: FIXTURE_TIME - 86_400_000 * 3,
  },
];

const opening = `# O mapa que aprendeu a lembrar

Lia chegou ao porto quando a última luz ainda repousava sobre as águas. Trazia no bolso uma bússola quebrada e, nas mãos, o Atlas das Marés que havia pertencido à sua avó.

Porto das Lanternas parecia a mesma cidade das cartas: telhados baixos, janelas azuis e ruas estreitas que terminavam no mar. Mas o mapa mostrava uma ponte onde agora só havia água.

— Nem tudo o que desaparece deixa de existir — disse Tomás, fechando a porta da oficina.

Lia abriu o atlas sobre a mesa. A tinta se moveu devagar, como se procurasse uma palavra esquecida. Uma nova ilha surgiu no canto da página, cercada por um delicado círculo de estrelas.

Ela conhecia aquele desenho. Estava bordado no lenço de sua avó.

Do lado de fora, os sinos do farol tocaram três vezes. O mar, por um instante, pareceu prender a respiração.

## Um caminho entre duas margens

Tomás colocou duas xícaras ao lado do mapa. Havia perguntas que exigiam paciência, e outras que só começavam a fazer sentido quando alguém aceitava escutar a resposta.`;

export const chapters: Chapter[] = [
  {
    id: FIXTURE_CHAPTER_ID,
    bookId: FIXTURE_BOOK_ID,
    title: 'O mapa que aprendeu a lembrar',
    order: 1,
    content: opening,
    wordCount: countWords(opening),
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  },
  {
    id: 'visual-chapter-2',
    bookId: FIXTURE_BOOK_ID,
    title: 'A longa travessia entre o Porto das Lanternas e as ilhas que desapareceram das cartas',
    order: 2,
    content:
      '# A travessia\n\nLia e Tomás partiram antes do amanhecer. Ao longe, Porto das Lanternas se tornou uma linha dourada entre a terra e o céu.\n\nO Atlas das Marés guardava uma nova pergunta em cada página.',
    wordCount: 40,
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  },
  {
    id: 'visual-chapter-3',
    bookId: FIXTURE_BOOK_ID,
    title: 'O que o mar devolveu',
    order: 3,
    content: 'A primeira carta chegou sem remetente. Lia reconheceu apenas o cheiro de sal.',
    wordCount: 14,
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  },
];

export const lore: LoreEntity[] = [
  {
    id: 'visual-lia',
    bookId: FIXTURE_BOOK_ID,
    name: 'Lia',
    aliases: ['A cartógrafa'],
    category: 'character',
    summary: 'Cartógrafa que descobre nas marés um caminho para as memórias de sua família.',
    details:
      'Observadora e curiosa, Lia coleciona mapas incompletos. Busca compreender o desaparecimento de sua avó sem perder de vista as pessoas que ainda estão ao seu lado.',
    relations: [{ targetEntityId: 'visual-port', relationType: 'Nasceu em' }],
    isPublic: true,
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  },
  {
    id: 'visual-tomas',
    bookId: FIXTURE_BOOK_ID,
    name: 'Tomás',
    aliases: ['O guardião do farol'],
    category: 'character',
    summary: 'Artesão de instrumentos náuticos e guardião das histórias do antigo porto.',
    details: 'Conserta bússolas e relógios. Nunca pergunta de onde vêm os objetos que recebe.',
    relations: [{ targetEntityId: 'visual-lia', relationType: 'Aliado de' }],
    isPublic: true,
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  },
  {
    id: 'visual-port',
    bookId: FIXTURE_BOOK_ID,
    name: 'Porto das Lanternas',
    aliases: ['O porto'],
    category: 'location',
    summary:
      'Cidade costeira onde as luzes do farol anunciam mudanças que os mapas ainda não viram.',
    details:
      'Construída entre canais e pequenos jardins, a cidade preserva uma biblioteca de cartas náuticas escritas por muitas gerações. Seus moradores evitam atravessar a ponte durante a maré cheia.',
    relations: [],
    isPublic: true,
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  },
  {
    id: 'visual-atlas-lore',
    bookId: FIXTURE_BOOK_ID,
    name: 'Atlas das Marés',
    aliases: ['O atlas'],
    category: 'concept',
    summary:
      'Livro de mapas que registra lugares preservados na memória, mesmo depois de submersos.',
    details: 'A tinta muda ao amanhecer. Nenhuma página revela o caminho de volta.',
    relations: [{ targetEntityId: 'visual-lia', relationType: 'Pertence a' }],
    isPublic: false,
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  },
];
