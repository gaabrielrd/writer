import { beforeEach, expect, it } from 'vitest';
import { createAdventureDeletionClient } from '../services/adventureDeletionClient';
import type { AdventureDeletionTransport } from '../services/adventureDeletionTransport';
import { readDeletion } from '../services/adventureDeletionRecovery';
import { installBrowser } from './fixtures';
// @ts-expect-error The real Node service is JavaScript, without a TS declaration.
import { createAdventureDeletionService } from '../../../../functions/src/adventureDeletion.mjs';
// @ts-expect-error The real producer fixture is JavaScript, without a TS declaration.
import { createDeletionChat } from '../../../../functions/test/helpers/adventureDeletionChatFixture.mjs';
// @ts-expect-error The native-clock database double is JavaScript, without a TS declaration.
import { adventureDeletionDb } from '../../../../functions/test/helpers/adventureDeletionDb.mjs';
// Explicit unknown boundaries retain the real JS implementation and validate its responses.
type Method =
  | 'getAdventureDeletionSource'
  | 'startAdventureDeletion'
  | 'resolveAdventureDeletionStart'
  | 'getAdventureDeletion'
  | 'listAdventureDeletions'
  | 'advanceAdventureDeletion';
type Service = Record<Method, (uid: string, input: unknown) => Promise<unknown>>;
interface Database {
  db: unknown;
  records: Map<string, unknown>;
}
interface Chat {
  target: { id: string };
  bodyPath: string;
  questionPath: string;
  turnScope: Record<string, unknown>;
  turn: { turnId: string };
  conversations: { dispatch(uid: string, input: unknown): Promise<unknown> };
}
const createNativeDb = adventureDeletionDb as unknown as () => Database;
const createNativeChat = createDeletionChat as unknown as (
  db: unknown,
  options: { prefix: string },
) => Promise<Chat>;
const createNativeService = createAdventureDeletionService as unknown as (options: {
  db: unknown;
}) => Service;
beforeEach(installBrowser);

it('contrato cliente percorre fonte/início perdido/retomada/limpeza terminal do serviço real, preservando perguntas', async () => {
  const uid = 'author',
    f = createNativeDb(),
    own = await createNativeChat(f.db, { prefix: 'client-real-producer' }),
    adventureId = own.target.id,
    service = createNativeService({ db: f.db });
  let lose = true;
  const transport: AdventureDeletionTransport = {
    getSource: (input) => service.getAdventureDeletionSource(uid, input),
    start: async (input) => {
      const result = await service.startAdventureDeletion(uid, input);
      if (lose) {
        lose = false;
        throw Error('Actual start ACK lost');
      }
      return result;
    },
    resolveStart: (input) => service.resolveAdventureDeletionStart(uid, input),
    get: (input) => service.getAdventureDeletion(uid, input),
    list: (input) => service.listAdventureDeletions(uid, input),
    advance: (input) => service.advanceAdventureDeletion(uid, input),
  };
  const create = () =>
      createAdventureDeletionClient({ uid, adventureId, isActive: () => true, transport }),
    client = create(),
    source = await client.getSource();
  if (!source) throw Error('Missing real source');
  expect((await client.load()).progress).toBeNull();
  await expect(client.start(source, 'client-real-start-0001')).rejects.toThrow(
    'Actual start ACK lost',
  );
  expect(readDeletion(uid, adventureId)).toMatchObject({ kind: 'start' });
  const recovered = create();
  await recovered.recover();
  let finished = false;
  for (let n = 0; n < 200; n++) {
    const p = (await recovered.load()).progress;
    if (p?.complete) {
      finished = true;
      break;
    }
    await recovered.advance('client-real-step-' + String(n).padStart(6, '0'));
  }
  expect(finished).toBe(true);
  expect(f.records.has('adventures/' + adventureId)).toBe(false);
  expect(f.records.has(own.bodyPath)).toBe(false);
  expect(f.records.has(own.questionPath)).toBe(true);
  const turn = await own.conversations.dispatch(uid, {
    action: 'getTurn',
    ...own.turnScope,
    turnId: own.turn.turnId,
  });
  expect(turn).toMatchObject({ question: '  Own private question\n', answer: null });
  expect((await recovered.list()).items[0]?.complete).toBe(true);
  expect(JSON.stringify(readDeletion(uid, adventureId))).not.toContain(source.title);
}, 30_000);
