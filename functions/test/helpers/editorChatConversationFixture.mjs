import { editorChatFixture, uid, signed } from './editorChatFixture.mjs';
import { createEditorChatConversationsService } from '../../src/editorChatConversations.mjs';
import { editorChatTextHash } from '../../src/editorChatContracts.mjs';
import { editorChatModelAnswer } from '../../src/editorChatHistoryRead.mjs';
import { resolveChatGeneration } from '../../src/chatGeneration.mjs';

export async function editorChatConversationFixture({
  kind = 'book',
  block = false,
  world = false,
  setup,
} = {}) {
  const f = await editorChatFixture(kind, block);
  if (world) {
    f.records.get(f.path).universeId = 'world';
    f.records.set('universes/world', { authorId: uid, loreVersion: 0, privacyVersion: 0 });
    f.records.set('universes/world/lore/aria', {
      name: 'Aria',
      aliases: [],
      category: 'character',
      summary: 'Resumo',
      details: 'Fato secreto',
      isPublic: true,
    });
  }
  if (setup) await setup(f);
  const prepared = (await f.call(f.prepare)).current;
  let ready = prepared;
  for (let n = 0; n < 10 && ['local', 'global'].includes(ready.phase); n++)
    ready = (await f.advance(ready, 'fixture-ready-' + n)).current;
  if (ready.phase !== 'ready') throw new Error('Context fixture did not reach ready');
  const inspection = await f.inspect(ready);
  const contextControl = f.records.get(`users/${uid}/editorChatContexts/${ready.contextId}`);
  const api = createEditorChatConversationsService({
    db: f.db,
    now: () => 2000,
    randomBytes: () => Buffer.alloc(32, 2),
  });
  const call = (r, actor = uid) => api.dispatch(actor, r),
    mutate = async (r) => call(await signed(r));
  const bootstrap = await call({ action: 'listConversations', ...f.scope });
  const createRequest = await signed({
    action: 'createConversation',
    ...f.scope,
    conversationId: 'conversation-first',
    operationId: 'conversation-create',
    projectToken: bootstrap.projectToken,
    resourceToken: bootstrap.resourceToken,
  });
  const created = await call(createRequest),
    conversation = created.current;
  const scope = {
    ...f.scope,
    conversationId: conversation.conversationId,
    conversationToken: conversation.conversationToken,
  };
  const get = (turnId) => call({ action: 'getTurn', ...scope, turnId });
  f.events.length = 0;
  // There is intentionally no send producer in this milestone. These rows model its approved atomic storage shape.
  async function seedTurn(
    turnId,
    {
      state = 'done',
      question = `Pergunta ${turnId}`,
      answer = { text: `Resposta ${turnId}`, suggestion: null },
      closure = inspection.frozen.closure,
      context = inspection.frozen,
      proofCoverage = contextControl.proofCoverage,
      createdAt = 3000,
    } = {},
  ) {
    const generation = resolveChatGeneration({
      version: 1,
      provider: 'platform',
      model: null,
      reasoning: 'auto',
    });
    const summary = {
      schemaVersion: 1,
      turnId,
      conversationId: conversation.conversationId,
      revision: 1,
      attemptToken: '3'.repeat(64),
      state,
      provider: 'platform',
      generation,
      contextHash: context.contextHash,
      closureHash: closure.closureHash,
      sourceToken: context.source.sourceToken,
      suggestionAvailable: state === 'done' && answer.suggestion !== null,
      paid: false,
      failureReason: null,
      createdAt,
      updatedAt: createdAt,
    };
    const questionHash = await editorChatTextHash(question);
    const record = {
      schemaVersion: 1,
      ownerId: uid,
      conversationId: conversation.conversationId,
      conversationToken: conversation.conversationToken,
      turnId,
      summary,
      closureManifest: { version: 1, leaves: closure.leaves },
      closureHash: closure.closureHash,
      proofCoverage: structuredClone(proofCoverage),
      questionChars: question.length,
      modelAnswerChars: state === 'done' ? editorChatModelAnswer(answer).length : 0,
      questionHash,
    };
    const path = `users/${uid}/editorChats/${conversation.conversationId}`;
    f.records.set(`${path}/turns/${turnId}`, record);
    f.records.set(`${path}/turnQuestions/${turnId}`, {
      schemaVersion: 1,
      ownerId: uid,
      conversationId: conversation.conversationId,
      conversationToken: conversation.conversationToken,
      turnId,
      attemptToken: summary.attemptToken,
      question,
      questionHash,
    });
    f.records.set(`${path}/turnBodies/${turnId}`, {
      schemaVersion: 1,
      ownerId: uid,
      conversationId: conversation.conversationId,
      conversationToken: conversation.conversationToken,
      turnId,
      attemptToken: summary.attemptToken,
      context,
      systemInstruction: 'Instrução congelada',
      historyMessages: [],
      history: {
        turnIds: [],
        recordCount: 0,
        characterCount: 0,
        omittedRecordCount: 0,
        omittedCharacterCount: 0,
        hasOlderHistory: false,
      },
      answer: state === 'done' ? answer : null,
    });
    const control = f.records.get(path);
    control.summary.revision++;
    control.summary.updatedAt = Math.max(control.summary.updatedAt + 1, createdAt);
    const catalog = f.records.get(`users/${uid}/editorChatCatalogs/current`);
    catalog.revision++;
    catalog.updatedAt = control.summary.updatedAt;
    return record;
  }
  return {
    ...f,
    api,
    call,
    mutate,
    scope,
    resourceScope: f.scope,
    conversation,
    createRequest,
    ready,
    inspection,
    contextControl,
    seedTurn,
    get,
  };
}
