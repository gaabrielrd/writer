import { randomUUID } from 'node:crypto';
import { workFail, workClosed, digest, readWorkMetadata } from './workProgressContracts.mjs';
import { literaryNativeBirth } from './literarySourceOrigins.mjs';
import { prepareLegacyChatMutation } from './literaryLegacyChatLifecycle.mjs';
import { prepareLiteraryLegacyChatIndexCleanup } from './literaryLegacyChatIndex.mjs';
const PAGE_SIZE = 20,
  MAX_PAGES = 10;
const id = (value) => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value))
    workFail('invalid-argument', 'Identidade da operação inválida.');
  return value;
};
const chapterNamespace = (uid, data) =>
  'users/' + id(uid) + '/chapterChats/' + id(data.bookId) + '/chapters/' + id(data.chapterId);
const paths = (db, uid, data) => {
  const base = chapterNamespace(uid, data),
    conversationId = id(data.conversationId);
  return {
    base,
    conversation: db.doc(base + '/conversations/' + conversationId),
    head: db.doc(base + '/mutationHeads/' + conversationId),
    job: (mutationId) => db.doc(base + '/mutationJobs/' + id(mutationId)),
  };
};
const timestamp = (now, previous = 0) => {
  const value = Math.max(now(), previous + 1);
  if (!Number.isSafeInteger(value) || value < 0 || value > 8640000000000000)
    workFail('failed-precondition', 'Data da operação inválida.');
  return value;
};
const view = (job) => ({
  id: job.id,
  conversationId: job.conversationId,
  kind: job.kind,
  state: job.state,
  deletedDocuments: job.deletedDocuments,
});
async function scopeIdentity(tx, db, uid, data) {
  const book = await readWorkMetadata(tx, db.doc('books/' + id(data.bookId)), [
      'authorId',
      'deleting',
    ]),
    chapter = await readWorkMetadata(
      tx,
      db.doc('books/' + data.bookId + '/chapters/' + id(data.chapterId)),
      ['bookId', 'deleting'],
    );
  if (!book.exists || book.data().authorId !== uid || book.data().deleting)
    workFail('permission-denied', 'Livro indisponível.');
  if (
    !chapter.exists ||
    chapter.data().deleting ||
    (chapter.data().bookId != null && chapter.data().bookId !== data.bookId)
  )
    workFail('not-found', 'Capítulo indisponível.');
  return digest({
    domain: 'legacy-chat-mutation-scope-v1',
    uid,
    bookId: data.bookId,
    chapterId: data.chapterId,
    bookBirth: literaryNativeBirth(book),
    chapterBirth: literaryNativeBirth(chapter),
  });
}
function stored(value, uid, data) {
  workClosed(value, [
    'version',
    'ownerId',
    'bookId',
    'chapterId',
    'conversationId',
    'id',
    'token',
    'scopeToken',
    'conversationToken',
    'kind',
    'fingerprint',
    'before',
    'draftHash',
    'state',
    'deletedDocuments',
    'createdAt',
    'updatedAt',
  ]);
  if (
    value.version !== 1 ||
    value.ownerId !== uid ||
    value.bookId !== data.bookId ||
    value.chapterId !== data.chapterId ||
    value.conversationId !== data.conversationId ||
    !['edit', 'delete'].includes(value.kind) ||
    !['running', 'completed'].includes(value.state) ||
    !Number.isSafeInteger(value.deletedDocuments) ||
    value.deletedDocuments < 0 ||
    typeof value.scopeToken !== 'string' ||
    typeof value.fingerprint !== 'string' ||
    (value.kind === 'edit' &&
      (!Number.isSafeInteger(value.before) ||
        value.before < 0 ||
        typeof value.draftHash !== 'string')) ||
    (value.kind === 'delete' && (value.before !== null || value.draftHash !== null))
  )
    workFail('failed-precondition', 'Registro da operação inválido.');
  id(value.id);
  id(value.token);
  return value;
}
export function createLegacyChatMutations({ db, now = Date.now }) {
  async function creationAvailable(tx, uid, data) {
    const refs = paths(db, uid, data),
      scopeToken = await scopeIdentity(tx, db, uid, data),
      head = (await tx.get(refs.head)).data();
    if (head?.state === 'running' && head.scopeToken === scopeToken)
      workFail('failed-precondition', 'Conclua a operação pendente antes de recriar a conversa.');
  }
  async function pending(uid, data) {
    return db.runTransaction(async (tx) => {
      const scopeToken = await scopeIdentity(tx, db, uid, data);
      let selected = data,
        head;
      if (data.conversationId !== undefined) {
        const refs = paths(db, uid, data);
        head = (await tx.get(refs.head)).data();
      } else {
        const page = await tx.get(
          db
            .collection(chapterNamespace(uid, data) + '/mutationHeads')
            .where('scopeToken', '==', scopeToken)
            .where('state', '==', 'running')
            .orderBy('__name__')
            .limit(1)
            .select(
              'version',
              'ownerId',
              'id',
              'token',
              'scopeToken',
              'kind',
              'state',
              'updatedAt',
            ),
        );
        const row = page.docs[0];
        if (!row) return null;
        selected = { ...data, conversationId: row.id };
        head = row.data();
      }
      if (!head || head.state !== 'running' || head.scopeToken !== scopeToken) return null;
      if (head.version !== 1 || head.ownerId !== uid)
        workFail('failed-precondition', 'Controle pendente inválido.');
      const refs = paths(db, uid, selected),
        job = stored((await tx.get(refs.job(head.id))).data(), uid, selected);
      if (
        job.id !== head.id ||
        job.scopeToken !== scopeToken ||
        job.token !== head.token ||
        job.state !== 'running'
      )
        workFail('failed-precondition', 'A operação pendente está inconsistente.');
      return view(job);
    });
  }
  async function begin(uid, data, kind, { before = null, draft = null } = {}) {
    if (
      !['edit', 'delete'].includes(kind) ||
      (kind === 'edit' &&
        (!Number.isSafeInteger(before) ||
          before < 0 ||
          typeof draft !== 'string' ||
          draft.length > 4000))
    )
      workFail('invalid-argument', 'Operação de conversa inválida.');
    const refs = paths(db, uid, data),
      candidate = data.mutationId === undefined ? randomUUID() : id(data.mutationId),
      draftHash = kind === 'edit' ? digest(draft) : null,
      fingerprint = digest({ kind, before, draftHash });
    return db.runTransaction(async (tx) => {
      const scopeToken = await scopeIdentity(tx, db, uid, data),
        parent = await tx.get(refs.conversation),
        native = parent.data(),
        head = (await tx.get(refs.head)).data();
      let mutationId = candidate;
      if (
        data.mutationId === undefined &&
        head?.scopeToken === scopeToken &&
        (head.state === 'running' || (!parent.exists && head.kind === 'delete'))
      )
        mutationId = head.id;
      const jobRef = refs.job(mutationId),
        previous = (await tx.get(jobRef)).data();
      if (previous) {
        const job = stored(previous, uid, data);
        if (job.scopeToken !== scopeToken || job.fingerprint !== fingerprint || job.kind !== kind)
          workFail('failed-precondition', 'A identidade pertence a outra operação ou origem.');
        if (job.id !== mutationId)
          workFail('failed-precondition', 'O registro da operação perdeu sua identidade.');
        return view(job);
      }
      if (head?.state === 'running' && head.scopeToken === scopeToken)
        workFail(
          'failed-precondition',
          'Há uma operação pendente. Retome-a antes de iniciar outra.',
        );
      if (kind === 'edit' && !parent.exists) workFail('not-found', 'Conversa indisponível.');
      if (kind === 'edit' && native?.busy && native.until > now())
        workFail('failed-precondition', 'Interrompa a resposta antes de editar.');
      const draftEpoch = native?.draftEpoch ?? 0;
      if (
        !Number.isSafeInteger(draftEpoch) ||
        draftEpoch < 0 ||
        draftEpoch >= Number.MAX_SAFE_INTEGER
      )
        workFail('failed-precondition', 'Revisão do rascunho inválida.');
      const conversationToken = parent.exists
          ? digest({
              domain: 'legacy-chat-mutation-parent-v1',
              scopeToken,
              conversationId: data.conversationId,
              birth: literaryNativeBirth(parent),
            })
          : null,
        at = timestamp(now, Math.max(native?.updatedAt ?? 0, head?.updatedAt ?? 0)),
        token = randomUUID();
      const job = {
        version: 1,
        ownerId: uid,
        bookId: data.bookId,
        chapterId: data.chapterId,
        conversationId: data.conversationId,
        id: mutationId,
        token,
        scopeToken,
        conversationToken,
        kind,
        fingerprint,
        before,
        draftHash,
        state: 'running',
        deletedDocuments: 0,
        createdAt: at,
        updatedAt: at,
      };
      const clock = await prepareLegacyChatMutation(tx, db, uid, data);
      tx.set(jobRef, job);
      tx.set(refs.head, {
        version: 1,
        ownerId: uid,
        id: mutationId,
        token,
        scopeToken,
        kind,
        state: 'running',
        updatedAt: at,
      });
      if (parent.exists)
        tx.update(refs.conversation, {
          busy: kind === 'edit' ? 'editing' : 'deleting',
          deleting: kind === 'delete',
          chatMutationToken: token,
          draftEpoch: draftEpoch + 1,
          until: at + 120000,
          updatedAt: at,
          ...(kind === 'edit' ? { draft } : {}),
        });
      clock.commit();
      return view(job);
    });
  }
  async function advance(uid, data, mutationId) {
    const refs = paths(db, uid, data);
    return db.runTransaction(async (tx) => {
      const scopeToken = await scopeIdentity(tx, db, uid, data),
        ref = refs.job(mutationId),
        job = stored((await tx.get(ref)).data(), uid, data);
      if (job.id !== mutationId)
        workFail('failed-precondition', 'O registro da operação perdeu sua identidade.');
      if (job.scopeToken !== scopeToken)
        workFail('failed-precondition', 'A origem da operação mudou.');
      if (job.state === 'completed') return view(job);
      const head = (await tx.get(refs.head)).data(),
        parent = await tx.get(refs.conversation),
        native = parent.data();
      if (
        head?.id !== job.id ||
        head.token !== job.token ||
        head.scopeToken !== scopeToken ||
        head.state !== 'running'
      )
        workFail('failed-precondition', 'A operação perdeu sua execução.');
      if (
        parent.exists &&
        (native.chatMutationToken !== job.token ||
          digest({
            domain: 'legacy-chat-mutation-parent-v1',
            scopeToken,
            conversationId: data.conversationId,
            birth: literaryNativeBirth(parent),
          }) !== job.conversationToken)
      )
        workFail('failed-precondition', 'A conversa foi recriada ou substituída.');
      if (job.kind === 'edit' && (!parent.exists || digest(native.draft) !== job.draftHash))
        workFail('failed-precondition', 'O rascunho da operação mudou.');
      let query = db.collection(refs.conversation.path + '/messages');
      if (job.kind === 'edit')
        query = query.where('createdAt', '>=', job.before).orderBy('createdAt');
      query = query
        .orderBy('__name__')
        .limit(PAGE_SIZE)
        .select('role', 'messageInstance', 'generationAttempt');
      const page = await tx.get(query),
        at = timestamp(now, job.updatedAt),
        origins = await prepareLiteraryLegacyChatIndexCleanup(tx, db, uid, data, job, page.docs),
        deletedDocuments = job.deletedDocuments + page.docs.length + origins.count;
      if (!Number.isSafeInteger(deletedDocuments))
        workFail('resource-exhausted', 'Contagem da operação excedida.');
      const done = page.docs.length === 0,
        next = { ...job, state: done ? 'completed' : 'running', deletedDocuments, updatedAt: at },
        clock = await prepareLegacyChatMutation(tx, db, uid, data);
      origins.commit();
      page.docs.forEach((row) => tx.delete(row.ref));
      tx.set(ref, next);
      if (done) {
        if (parent.exists) {
          if (job.kind === 'delete') tx.delete(refs.conversation);
          else tx.update(refs.conversation, { busy: null, chatMutationToken: null, updatedAt: at });
        }
        tx.set(refs.head, { ...head, state: 'completed', updatedAt: at });
      }
      clock.commit();
      return view(next);
    });
  }
  async function run(uid, data, kind, options) {
    let current = await begin(uid, data, kind, options);
    for (let page = 0; page < MAX_PAGES && current.state === 'running'; page++)
      current = await advance(uid, data, current.id);
    return current.state === 'completed' ? {} : { mutation: current };
  }
  async function resume(uid, data) {
    let current;
    for (let page = 0; page < MAX_PAGES; page++) {
      current = await advance(uid, data, id(data.mutationId));
      if (current.state === 'completed') return {};
    }
    return { mutation: current };
  }
  return { creationAvailable, pending, run, resume, advance };
}
