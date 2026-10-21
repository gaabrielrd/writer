import { editorChatConversationFixture } from './editorChatConversationFixture.mjs';
import { uid, signed } from './editorChatFixture.mjs';
import { createEditorChatGenerationService } from '../../src/editorChatGeneration.mjs';
import { createEditorChatContextService } from '../../src/editorChatContext.mjs';
import { createWorkHistoryService } from '../../src/workHistory.mjs';
export const platform = { version: 1, provider: 'platform', model: null, reasoning: 'auto' };
export const byok = {
  version: 1,
  provider: 'openai_byok',
  model: 'gpt-4o-mini',
  reasoning: 'auto',
};
export async function editorChatGenerationFixture(options = {}) {
  const f = await editorChatConversationFixture(options),
    calls = [],
    events = [];
  const generator =
    options.generator ??
    (async (input, onDelta) => {
      await onDelta('Resposta ');
      await onDelta('[[SUGESTAO]]Prosa[[/SUGESTAO]]');
      return 'Resposta [[SUGESTAO]]Prosa[[/SUGESTAO]]';
    });
  const api = createEditorChatGenerationService({
    db: f.db,
    now: options.now ?? (() => 5000),
    randomBytes: () => Buffer.alloc(32, 3),
    generator: async (...args) => {
      calls.push(args[0]);
      return generator(...args);
    },
  });
  const call = (r, execution = {}) => api.dispatch(uid, r, execution),
    mutate = async (r, execution = {}) => call(await signed(r), execution);
  async function request({
    id = 'send-first',
    context = f.ready,
    generation = platform,
    prompt = '  Pergunta própria\n',
  } = {}) {
    const conversation = f.records.get(
      `users/${uid}/editorChats/${f.conversation.conversationId}`,
    ).summary;
    return signed({
      action: 'send',
      ...f.scope,
      operationId: id,
      contextId: context.contextId,
      contextToken: context.contextToken,
      expectedContextRevision: context.revision,
      expectedConversationRevision: conversation.revision,
      prompt,
      generation,
    });
  }
  async function fresh(id = 'fresh-context', capture) {
    const source = await createWorkHistoryService({ db: f.db }).getWorkVersionSource(
      uid,
      f.resourceScope,
    );
    const ctx = createEditorChatContextService({ db: f.db, now: () => 4000 });
    const input = await signed({
      action: 'prepareContext',
      ...f.resourceScope,
      contextId: id,
      operationId: id,
      base: {
        sourceToken: source.sourceToken,
        revision: source.revision,
        bodyHash: source.contentHash,
      },
      capture: capture ?? f.prepare.capture,
    });
    let current = (await ctx.dispatch(uid, input)).current;
    for (let i = 0; i < 50 && ['local', 'global'].includes(current.phase); i++)
      current = (
        await ctx.dispatch(
          uid,
          await signed({
            action: 'advanceContext',
            ...f.resourceScope,
            operationId: id + '-' + i,
            contextId: id,
            contextToken: current.contextToken,
            expectedRevision: current.revision,
          }),
        )
      ).current;
    if (current.phase !== 'ready') throw new Error('Fresh context not ready');
    return current;
  }
  const stream = (event) => {
    events.push(event);
  };
  return {
    ...f,
    generationApi: api,
    generate: call,
    generationMutate: mutate,
    request,
    fresh,
    calls,
    streamEvents: events,
    stream,
  };
}
