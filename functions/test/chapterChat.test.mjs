import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  createChapterChatService,
  validateChatContext,
  splitChatAnswer,
} from '../src/chapterChat.mjs';

const sha = (text) => createHash('sha256').update(text).digest('hex');
const identity = { bookId: 'book', chapterId: 'chapter', conversationId: 'conversation' };
const context = () => ({
  source: 'selection',
  text: 'Texto',
  surrounding: 'Texto',
  title: 'Capítulo',
  bookTitle: 'Livro',
  truncated: false,
  persona: { instruction: '', version: '' },
  lore: [],
  target: { hash: sha('<p>Texto</p>'), from: 1, to: 6 },
});
test('histórico conserva pedidos e prosa sugerida, excluindo turnos incompletos', async () => {
  const inputs = [];
  const f = fixture((input) => {
    inputs.push(input);
    return Promise.resolve('Explicação [[SUGESTAO]]Prosa anterior[[/SUGESTAO]]');
  });
  await f.create();
  await f.send();
  await f.send({ requestId: 'second', text: 'Reescreva essa versão' });
  assert.deepEqual(
    inputs[1].history.map((item) => item.role),
    ['user', 'assistant'],
  );
  assert.match(inputs[1].history[1].text, /Prosa anterior/);
});
test('preferência de raciocínio é privada, não debita e conserva o modelo informado pelo serviço', async () => {
  const f = fixture();
  await f.call({ action: 'create', reasoning: 'high' });
  let loaded = await f.call({ action: 'load' });
  assert.equal(loaded.conversation.reasoning, 'high');
  assert.equal(loaded.platformModel, 'gemini-3.7-flash');
  await assert.rejects(f.call({ action: 'preferences', reasoning: 'low' }, 'intruder'), {
    code: 'permission-denied',
  });
  await f.call({ action: 'preferences', reasoning: 'low' });
  loaded = await f.call({ action: 'load' });
  assert.equal(loaded.conversation.reasoning, 'low');
  assert.equal(f.records.get('users/author').credits, 5);
  assert.equal(f.records.has('users/author/chapterChatLimits/current'), false);
});
test('preferências recusam níveis inválidos e alterações durante geração', async () => {
  const f = fixture();
  await assert.rejects(f.call({ action: 'create', reasoning: 'extreme' }), {
    code: 'invalid-argument',
  });
  await f.create();
  await assert.rejects(f.call({ action: 'preferences', reasoning: null }), {
    code: 'invalid-argument',
  });
  const path = 'users/author/chapterChats/book/chapters/chapter/conversations/conversation';
  const record = f.records.get(path);
  assert.equal(record.reasoning, 'auto');
  f.records.set(path, { ...record, busy: 'request', until: 999999 });
  await assert.rejects(f.call({ action: 'preferences', reasoning: 'max' }), {
    code: 'failed-precondition',
  });
  assert.equal(f.records.get(path).reasoning, 'auto');
});
function fixture(
  generator = async (_input, chunk) => {
    await chunk('Uma análise.');
    return 'Uma análise. [[SUGESTAO]]Novo texto[[/SUGESTAO]]';
  },
) {
  const records = new Map([
    ['books/book', { authorId: 'author', wordCount: 1, updatedAt: 1 }],
    ['books/book/chapters/chapter', { content: '<p>Texto</p>', wordCount: 1, updatedAt: 1 }],
    ['users/author', { credits: 5 }],
  ]);
  let beforeNextTransaction,
    queue = Promise.resolve(),
    time = 1000;
  const snap = (path) => ({
    id: path.split('/').at(-1),
    ref: db.doc(path),
    exists: records.has(path),
    data: () => structuredClone(records.get(path)),
  });
  const query = (path, options = {}) => ({
    orderBy: (field, direction) => query(path, { ...options, field, direction }),
    startAfter: (after) => query(path, { ...options, after }),
    limit: (limit) => query(path, { ...options, limit }),
    where: (field, _operator, minimum) => query(path, { ...options, where: field, minimum }),
    async get() {
      let values = [...records.keys()]
        .filter(
          (key) =>
            key.startsWith(`${path}/`) && key.split('/').length === path.split('/').length + 1,
        )
        .map(snap);
      if (options.where)
        values = values.filter((item) => item.data()[options.where] >= options.minimum);
      const sign = options.direction === 'desc' ? -1 : 1;
      if (options.field)
        values.sort((a, b) => sign * (a.data()[options.field] - b.data()[options.field]));
      if (options.after)
        values = values.filter((item) => sign * (item.data()[options.field] - options.after) > 0);
      return { docs: values.slice(0, options.limit ?? Infinity) };
    },
  });
  const db = {
    doc: (path) => ({
      path,
      id: path.split('/').at(-1),
      get: async () => snap(path),
      update: async (value) =>
        records.set(path, { ...records.get(path), ...structuredClone(value) }),
    }),
    collection: query,
    recursiveDelete: async (ref) => {
      for (const key of records.keys())
        if (key === ref.path || key.startsWith(`${ref.path}/`)) records.delete(key);
    },
    runTransaction(work) {
      const result = queue.then(async () => {
        const before = beforeNextTransaction;
        beforeNextTransaction = undefined;
        before?.();
        const writes = [];
        let writing = false;
        const tx = {
          get: async (ref) => {
            assert.equal(writing, false);
            return snap(ref.path);
          },
          set: (ref, value) => {
            writing = true;
            writes.push(() => records.set(ref.path, structuredClone(value)));
          },
          update: (ref, value) => {
            writing = true;
            writes.push(() =>
              records.set(ref.path, { ...records.get(ref.path), ...structuredClone(value) }),
            );
          },
        };
        const value = await work(tx);
        writes.forEach((write) => write());
        return value;
      });
      queue = result.catch(() => {});
      return result;
    },
  };
  let service = createChapterChatService({ db, generator, now: () => time++ });
  const call = (data, uid = 'author', chunk) =>
    service.chapterChat(uid, { ...identity, ...data }, chunk);
  const send = (extra = {}) =>
    call({
      action: 'send',
      requestId: 'request',
      text: '/reescrever',
      context: context(),
      ...extra,
    });
  const apply = (extra = {}) =>
    call({
      action: 'apply',
      requestId: 'accept',
      messageId: 'request',
      expectedHash: sha('<p>Texto</p>'),
      sourceHash: context().target.hash,
      after: '<p>Novo texto</p>',
      ...extra,
    });
  return {
    records,
    call,
    send,
    apply,
    create: () => call({ action: 'create' }),
    beforeTransaction: (work) => {
      beforeNextTransaction = work;
    },
    setModel: (model) => {
      service = createChapterChatService({
        db,
        generator,
        now: () => time++,
        platformModel: model,
      });
    },
  };
}
test('datas inválidas impedem aceite sem escrita ou débito e permitem retry após correção', async () => {
  for (const [path, invalid] of [
    ['books/book/chapters/chapter', Infinity],
    ['books/book', 8_640_000_000_000_000],
  ]) {
    const f = fixture();
    await f.create();
    await f.send();
    f.records.set(path, { ...f.records.get(path), updatedAt: invalid });
    const before = structuredClone([...f.records]);
    await assert.rejects(f.apply(), { code: 'failed-precondition' });
    assert.deepEqual([...f.records], before);
    assert.equal(f.records.get('users/author').credits, 5);
    assert.equal(
      [...f.records.keys()].some((key) => key.includes('/receipts/')),
      false,
    );
    f.records.set(path, { ...f.records.get(path), updatedAt: 100 });
    const applied = await f.apply();
    assert.equal(f.records.get('users/author').credits, 4);
    assert.equal(f.records.get('books/book/chapters/chapter').content, '<p>Novo texto</p>');
    assert.doesNotThrow(() => new Date(applied.updatedAt).toISOString());
    assert.deepEqual(await f.apply(), applied);
    assert.equal(f.records.get('users/author').credits, 4);
  }
});

test('conversão em cenas bloqueia aceite e retry antigo antes de qualquer escrita ou débito', async () => {
  const f = fixture();
  await f.create();
  await f.send();
  const path = 'books/book/chapters/chapter';
  f.records.set(path, { ...f.records.get(path), contentMode: 'scenes' });
  const before = structuredClone([...f.records]);
  await assert.rejects(f.apply(), { code: 'failed-precondition' });
  assert.deepEqual([...f.records], before);
  f.records.set(path, { ...f.records.get(path), contentMode: 'legacy' });
  await f.apply();
  f.records.set(path, { ...f.records.get(path), contentMode: 'scenes' });
  const accepted = structuredClone([...f.records]);
  await assert.rejects(f.apply(), { code: 'failed-precondition' });
  assert.deepEqual([...f.records], accepted);
  assert.equal(f.records.get('users/author').credits, 4);
});

test('aceite não revela modo nem recibo antigo quando a autorização muda antes da transação', async () => {
  for (const mode of ['legacy', 'scenes']) {
    const f = fixture();
    await f.create();
    await f.send();
    const accepted = await f.apply();
    const chapterPath = 'books/book/chapters/chapter';
    f.records.set(chapterPath, { ...f.records.get(chapterPath), contentMode: mode });
    await assert.rejects(f.call({ action: 'apply' }, 'intruder'), {
      code: 'permission-denied',
      message: 'Livro indisponível.',
    });
    let revoked;
    f.beforeTransaction(() => {
      f.records.set('books/book', { ...f.records.get('books/book'), authorId: 'another-author' });
      revoked = structuredClone([...f.records]);
    });
    await assert.rejects(f.apply(), { code: 'not-found', message: 'Capítulo indisponível.' });
    assert.deepEqual([...f.records], revoked);
    assert.equal(f.records.get('users/author').credits, accepted.credits);
  }
});

test('pedido congela raciocínio e modelo efetivo, sem permitir que o cliente escolha o modelo da plataforma', async () => {
  const inputs = [];
  const f = fixture(async (input) => {
    inputs.push(input);
    return 'Análise';
  });
  await f.create();
  const generation = {
    version: 1,
    provider: 'platform',
    model: 'modelo-enviado-pelo-cliente',
    reasoning: 'high',
  };
  const first = await f.send({ mode: 'platform', generation });
  assert.equal(inputs[0].generation.effective.model, 'gemini-3.7-flash');
  assert.equal(inputs[0].generation.effective.reasoning, 'high');
  assert.deepEqual(first.generation.requested, generation);
  f.setModel('gemini-3.8-flash');
  await f.call({ action: 'preferences', reasoning: 'low' });
  assert.deepEqual(await f.send({ mode: 'platform', generation }), first);
  assert.equal(inputs.length, 1);
  await assert.rejects(
    f.send({ mode: 'platform', generation: { ...generation, reasoning: 'low' } }),
    { code: 'invalid-argument' },
  );
  assert.equal(f.records.get('users/author').credits, 5);
  const loaded = await f.call({ action: 'load' });
  assert.deepEqual(loaded.messages[0].generation, first.generation);
});
test('retry após falha mantém parâmetros originais mesmo após alteração do modelo no servidor', async () => {
  const inputs = [];
  let failed = true;
  const f = fixture(async (input) => {
    inputs.push(input);
    if (failed) throw new Error('Provedor indisponível');
    return 'Análise';
  });
  await f.create();
  const generation = {
    version: 1,
    provider: 'platform',
    model: 'gemini-3.7-flash',
    reasoning: 'high',
  };
  await assert.rejects(f.send({ mode: 'platform', generation }), { code: 'unavailable' });
  f.setModel('gemini-3.8-flash');
  await f.call({ action: 'preferences', reasoning: 'low' });
  failed = false;
  await f.send({ mode: 'platform', generation });
  assert.deepEqual(inputs[1].generation, inputs[0].generation);
  const next = await f.send({
    requestId: 'next',
    mode: 'platform',
    generation: { ...generation, reasoning: 'low' },
  });
  assert.equal(next.generation.effective.model, 'gemini-3.8-flash');
  assert.equal(next.generation.effective.reasoning, 'low');
  assert.equal(f.records.get('users/author').credits, 5);
});
test('configuração inválida e troca de origem não registram mensagem nem consomem quota', async () => {
  const f = fixture();
  await f.create();
  const generation = { version: 1, provider: 'platform', model: null, reasoning: 'high' };
  for (const extra of [
    { mode: 'byok' },
    { mode: 'unknown' },
    { generation: { ...generation, apiKey: 'private-key' } },
    { generation: { ...generation, reasoning: 'unbounded' } },
  ])
    await assert.rejects(f.send({ mode: 'platform', generation, ...extra }), {
      code: 'invalid-argument',
    });
  assert.equal(f.records.has('users/author/chapterChatLimits/current'), false);
  assert.equal((await f.call({ action: 'load' })).messages.length, 0);
  assert.equal(f.records.get('users/author').credits, 5);
});
test('retry conserva histórico capturado e posição cronológica do pedido original', async () => {
  const inputs = [];
  let failed = false;
  const f = fixture(async (input) => {
    inputs.push(structuredClone(input));
    if (input.text === '/reescrever' && !failed) {
      failed = true;
      throw new Error('Rede');
    }
    return 'Análise';
  });
  await f.create();
  await f.send({ requestId: 'prior', text: 'Pedido anterior' });
  await assert.rejects(f.send(), { code: 'unavailable' });
  const path =
    'users/author/chapterChats/book/chapters/chapter/conversations/conversation/messages/request';
  const originalDate = f.records.get(path).createdAt;
  await f.send({ requestId: 'future', text: 'Pedido posterior' });
  await f.send();
  assert.deepEqual(inputs[3].history, inputs[1].history);
  assert.equal(f.records.get(path).createdAt, originalDate);
});
test('conversa é privada, verifica autoria e recusa capítulos excluídos', async () => {
  const f = fixture();
  await assert.rejects(f.call({ action: 'load' }, null), { code: 'unauthenticated' });
  await assert.rejects(f.call({ action: 'create' }, 'intruder'), { code: 'permission-denied' });
  await assert.rejects(f.call({ action: 'load', bookId: '../book' }), { code: 'invalid-argument' });
  f.records.delete('books/book/chapters/chapter');
  await assert.rejects(f.create(), { code: 'not-found' });
});
test('valida tamanho, destino, contexto e separa explicação de prosa', () => {
  assert.equal(validateChatContext(context()).text, 'Texto');
  for (const value of [
    null,
    { ...context(), source: 'bad' },
    { ...context(), target: { hash: 'x', from: 0, to: 2 } },
    { ...context(), text: 'x'.repeat(18001) },
    { ...context(), lore: Array(13).fill({}) },
  ])
    assert.throws(() => validateChatContext(value));
  assert.deepEqual(splitChatAnswer('Olá'), { text: 'Olá' });
  assert.deepEqual(splitChatAnswer('[[SUGESTAO]]Cena[[/SUGESTAO]]'), {
    text: 'Revise a sugestão antes de aplicar.',
    suggestion: 'Cena',
  });
  assert.throws(() => splitChatAnswer('[[SUGESTAO]]Incompleto'));
  assert.throws(() => splitChatAnswer(''));
});
test('gera com saldo zero sem débito, persiste e recupera o mesmo pedido', async () => {
  let calls = 0;
  const f = fixture(async (input, chunk) => {
    calls++;
    assert.equal(input.text, '/reescrever');
    await chunk('Olá');
    return 'Olá [[SUGESTAO]]Cena[[/SUGESTAO]]';
  });
  f.records.set('users/author', { credits: 0 });
  await f.create();
  await f.create();
  const chunks = [];
  const response = await f.call(
    { action: 'send', requestId: 'request', text: '/reescrever', context: context() },
    'author',
    (chunk) => chunks.push(chunk),
  );
  assert.equal(response.suggestion, 'Cena');
  assert.deepEqual(chunks, ['Olá']);
  await f.send();
  assert.equal(calls, 1);
  assert.equal(f.records.get('users/author').credits, 0);
  await assert.rejects(f.send({ text: 'Outro pedido' }), { code: 'invalid-argument' });
  const page = await f.call({ action: 'load' });
  assert.equal(page.messages.length, 2);
  assert.equal(page.conversation.id, identity.conversationId);
  await assert.rejects(f.apply(), { code: 'resource-exhausted' });
  assert.equal(f.records.get('books/book/chapters/chapter').content, '<p>Texto</p>');
});
test('aceite salva texto, saldo e recibo juntos, incluindo repetição concorrente', async () => {
  const f = fixture();
  await f.create();
  await f.send();
  const results = await Promise.all([f.apply(), f.apply()]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(f.records.get('users/author').credits, 4);
  assert.equal(f.records.get('books/book/chapters/chapter').content, '<p>Novo texto</p>');
  assert.equal(f.records.get('books/book').wordCount, 2);
  await assert.rejects(f.apply({ after: '<p>Outro texto</p>' }), { code: 'invalid-argument' });
  f.records.set('books/book/chapters/chapter', {
    content: '<p>Texto</p>',
    wordCount: 1,
    updatedAt: 20,
  });
  await f.apply({ requestId: 'reapply' });
  assert.equal(f.records.get('users/author').credits, 4);
  await f.call({ action: 'delete' });
  assert.deepEqual(await f.apply(), results[0]);
});
test('recusa conflito, alvo antigo, conteúdo ativo e sugestão inexistente sem debitar', async () => {
  const f = fixture();
  await f.create();
  await f.send();
  await assert.rejects(f.apply({ expectedHash: sha('Outro texto') }), {
    code: 'failed-precondition',
  });
  await assert.rejects(f.apply({ sourceHash: sha('Outro texto') }), {
    code: 'failed-precondition',
  });
  await assert.rejects(f.apply({ after: '<script>alert(1)</script>' }), {
    code: 'invalid-argument',
  });
  await assert.rejects(f.apply({ messageId: 'missing' }), { code: 'failed-precondition' });
  assert.equal(f.records.get('users/author').credits, 5);
  await f.apply({ sourceHash: sha('Novo destino'), retarget: true });
  assert.equal(f.records.get('users/author').credits, 4);
});
test('BYOK não debita e não permite forjar resultado de uma geração da plataforma', async () => {
  const f = fixture();
  await f.create();
  const started = await f.send({ mode: 'byok' });
  assert.ok(started.input);
  await f.call({
    action: 'completeBYOK',
    requestId: 'request',
    output: '[[SUGESTAO]]Cena[[/SUGESTAO]]',
  });
  await f.apply();
  assert.equal(f.records.get('users/author').credits, 5);
  await f.send({ requestId: 'platform' });
  await assert.rejects(f.call({ action: 'completeBYOK', requestId: 'platform', output: 'Falso' }), {
    code: 'permission-denied',
  });
});
test('interrompe uma geração e ignora sua conclusão tardia', async () => {
  let release;
  const pending = new Promise((done) => {
    release = done;
  });
  const f = fixture(async () => {
    await pending;
    return 'Resposta tardia';
  });
  await f.create();
  const sending = f.send();
  await new Promise((done) => setImmediate(done));
  await assert.rejects(f.send({ requestId: 'parallel' }), { code: 'aborted' });
  await assert.rejects(f.call({ action: 'edit', before: 1, draft: 'Editado' }), {
    code: 'failed-precondition',
  });
  await f.call({ action: 'stop', requestId: 'request', partial: 'Parcial' });
  release();
  assert.equal((await sending).state, 'stopped');
  const page = await f.call({ action: 'load' });
  assert.equal(page.messages[1].text, 'Parcial');
  assert.equal(f.records.get('users/author').credits, 5);
});
test('limita requisições, preserva falha, permite retry e não cobra por análise', async () => {
  let fail = true;
  const f = fixture(async () => {
    if (fail) throw new Error('Rede');
    return 'Análise sem sugestão';
  });
  await f.create();
  await assert.rejects(f.send(), { code: 'unavailable' });
  fail = false;
  assert.equal((await f.send()).state, 'done');
  await assert.rejects(f.apply(), { code: 'failed-precondition' });
  f.records.set('users/author/chapterChatLimits/current', { hour: 0, count: 60 });
  await assert.rejects(f.send({ requestId: 'quota' }), { code: 'resource-exhausted' });
  await assert.rejects(f.send({ requestId: 'command', text: '/unknown' }), {
    code: 'invalid-argument',
  });
});
test('salva rascunho, pagina mensagens, edita a sequência e exclui sem alterar capítulo', async () => {
  const f = fixture();
  await f.create();
  await f.call({ action: 'draft', draft: 'Pedido incompleto' });
  assert.equal((await f.call({ action: 'load' })).conversation.draft, 'Pedido incompleto');
  for (let i = 0; i < 17; i++) await f.send({ requestId: `request-${i}` });
  const page = await f.call({ action: 'load' });
  assert.equal(page.messages.length, 30);
  assert.ok(page.before);
  const older = await f.call({ action: 'load', before: page.before });
  assert.equal(older.messages.length, 4);
  await f.call({ action: 'edit', before: page.messages.at(-2).createdAt, draft: 'Outro pedido' });
  const edited = await f.call({ action: 'load' });
  assert.equal(edited.messages.at(-1).id, 'request-15');
  assert.equal(edited.conversation.draft, 'Outro pedido');
  await f.call({ action: 'delete' });
  assert.equal((await f.call({ action: 'load' })).conversation, null);
  assert.equal(f.records.get('books/book/chapters/chapter').content, '<p>Texto</p>');
});
