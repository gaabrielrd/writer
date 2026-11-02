import { prepareBookLoreCreationOperation } from '../services/bookLoreCreationOperation.ts';
import { createBookLoreReadClient } from '../services/bookLoreReadClient.ts';
import { createBookLoreReadService } from '../../../../functions/src/bookLoreRead.mjs';
import { createBookLoreEditTransportService } from '../../../../functions/src/bookLoreEditTransport.mjs';
import { seedCreationBook } from '../../../../functions/test/helpers/bookLoreCreationFixture.mjs';
import { adventureImportDb } from '../../../../functions/test/helpers/adventureImportDb.mjs';

export const creationData = () => ({
  name: '\ufeff  New 🌙\r\n',
  category: 'other',
  details: '\ufeff  Literal\r\n',
  aliases: ['', 'same', 'same'],
  structuredDetails: { notes: '\ufeff  Private  ' },
});
export async function creationClientFixture({
  data = creationData(),
  writeId = 'new-creation-client',
  options = {},
} = {}) {
  const f = adventureImportDb({ nativeUpdates: true });
  await seedCreationBook(f.db, 'book', 'author', { localLoreVersion: 0 });
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc('books/book/lore/original'), {
      bookId: 'book',
      name: 'Original',
      category: 'other',
      summary: '\ufeff Keep\r\n',
      isPublic: false,
    }),
  );
  const server = createBookLoreEditTransportService({ db: f.db, now: () => 8000 });
  const read = createBookLoreReadService({ db: f.db }),
    calls = [];
  let intercept = null;
  const port = {
    async call(method, input) {
      calls.push({ method, input: structuredClone(input) });
      const invoke = () => server.bookLoreEdit('author', { method, input });
      return intercept ? intercept(method, input, invoke) : invoke();
    },
  };
  const input = { uid: 'author', bookId: 'book', writeId, data };
  const client = createBookLoreReadClient(
    (method, data) => read[method]('author', data),
    () => {},
  );
  const operation = await prepareBookLoreCreationOperation(input, port, options);
  return {
    ...f,
    input,
    port,
    calls,
    client,
    operation,
    intercept(fn) {
      intercept = fn;
    },
  };
}
export async function creationReady(f) {
  for (let i = 0; i < 20000; i++) {
    const s = f.operation.snapshot();
    if (s.phase === 'ready' || s.phase === 'applied') return s;
    if (s.phase !== 'preparing') throw Error('Unexpected creation state: ' + s.phase);
    await f.operation.advance();
  }
  throw Error('Creation did not finish');
}
export async function creationCancelled(f) {
  f.operation.requestCancel();
  for (let i = 0; i < 20000; i++) {
    const s = f.operation.snapshot();
    if (['cancelled', 'applied', 'conflict'].includes(s.phase)) return s;
    try {
      await f.operation.advance();
    } catch (e) {
      if (!String(e.code).includes('failed-precondition')) throw e;
    }
  }
  throw Error('Creation cleanup did not finish');
}
export function creationRecovery(op) {
  const checkpoint = structuredClone(op.checkpoint()),
    items = [];
  let offset = 0;
  for (;;) {
    const p = op.controlsPage(offset);
    items.push(...p.items);
    if (p.nextOffset === null) break;
    offset = p.nextOffset;
  }
  return {
    checkpoint,
    controlsPage: async (offset, limit) => ({
      intentHash: checkpoint.intentHash,
      items: structuredClone(items.slice(offset, offset + limit)),
      nextOffset: offset + limit < items.length ? offset + limit : null,
    }),
  };
}
export async function restoreCreation(f, recovery = creationRecovery(f.operation), options = {}) {
  f.operation = await prepareBookLoreCreationOperation(f.input, f.port, options, recovery);
  return f.operation;
}
