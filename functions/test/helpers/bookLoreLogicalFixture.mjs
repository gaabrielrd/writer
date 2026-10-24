import { seedBookLoreRead } from './bookLoreReadFixture.mjs';
import { seedBookLoreGeneration } from './bookLoreGenerationFixture.mjs';
import { creationAdoptionFixture, adoptCreation } from './bookLoreCreationAdoptionFixture.mjs';
import { createLoreAnalysisService } from '../../src/loreAnalysis.mjs';
import {
  readBookLoreLogical,
  createBookLoreLogicalBudget,
} from '../../src/bookLoreLogicalRead.mjs';
import { readLoreBook } from '../../src/bookLoreReadContracts.mjs';
export const logicalLoreData = () => ({
  name: 'Arthur',
  category: 'character',
  aliases: ['', 'same', 'same'],
  summary: 'Before',
  details: '\ufeffLiteral 🌙\r\n',
  structuredDetails: { notes: '\ufeffPrivate note' },
  isPublic: true,
  createdAt: 1000,
  updatedAt: 1000,
  relations: Array.from({ length: 65 }, (_, i) => ({
    targetEntityId: 'target-' + i,
    relationType: 'knows',
    description: '\ufeff' + i,
  })),
});
export async function loreLogicalFixture(
  db,
  {
    mode = 'v1',
    data = logicalLoreData(),
    fields = {},
    noBase = false,
    dates,
    onGenerate = async () => {},
    ...options
  } = {},
) {
  const uid = 'author',
    bookId = 'book';
  let seed,
    entityId = 'arthur',
    expected = structuredClone(data);
  if (mode === 'created') {
    const f = await creationAdoptionFixture(db, {
      changes: [
        { target: { field: 'name' }, value: data.name },
        { target: { field: 'category' }, value: data.category },
        { target: { field: 'details' }, value: data.details },
      ],
    });
    await adoptCreation(f);
    seed = f.source.seed;
    entityId = f.loreId;
    expected = {
      name: data.name,
      category: data.category,
      details: data.details,
      createdAt: 2000,
      updatedAt: 2000,
    };
  } else if (mode === 'v2') {
    seed = await seedBookLoreGeneration(db, {
      uid,
      bookId,
      id: entityId,
      baseData: data,
      fields,
      noBase,
      ...(dates ? { dates } : {}),
      ...options,
    });
    expected = noBase ? {} : structuredClone(data);
    for (const [k, v] of Object.entries(fields))
      if (v === null) delete expected[k];
      else expected[k] = v;
    delete expected.createdAt;
    delete expected.updatedAt;
    Object.assign(
      expected,
      dates ?? (noBase ? { updatedAt: 2000 } : { createdAt: 1000, updatedAt: 2000 }),
    );
    if (noBase) delete expected.relations;
  } else
    seed = await seedBookLoreRead(db, {
      uid,
      bookId,
      id: entityId,
      data,
      inline: mode === 'inline',
    });
  await db.runTransaction(async (tx) => {
    tx.create(db.doc('books/book/chapters/chapter'), {
      bookId,
      content: 'Arthur chegou ao porto.',
      createdAt: 1000,
      updatedAt: 1000,
    });
    tx.create(db.doc('users/author'), { credits: 5 });
  });
  const calls = [],
    source = 'Arthur chegou ao porto.',
    detected = {
      name: 'Arthur',
      category: 'character',
      summary: 'Detected',
      details: source,
      aliases: [],
      evidence: source,
    },
    service = createLoreAnalysisService({
      db,
      now: () => 5000,
      generator: async (context) => {
        calls.push(structuredClone(context));
        await onGenerate(context, calls.length);
        return JSON.stringify({ entities: [detected] });
      },
    }),
    request = {
      bookId,
      chapterId: 'chapter',
      requestId: 'logical-analysis-0001',
      text: source,
      content: source,
      loreVersions: [[entityId, expected.updatedAt ?? 0]],
    };
  return {
    db,
    uid,
    bookId,
    entityId,
    seed,
    expected,
    service,
    request,
    calls,
    read: (budget = createBookLoreLogicalBudget()) =>
      db.runTransaction(async (tx) => {
        const c = { db, uid, bookId, path: 'books/book' };
        await readLoreBook(tx, c);
        return readBookLoreLogical(tx, c, await tx.get(db.doc(seed.path)), budget);
      }),
    analyze: () => service.analyzeChapterLore(uid, request),
    apply: (changes) =>
      service.applyLoreAnalysis(uid, { id: request.requestId, text: source, changes }),
  };
}
