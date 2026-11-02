import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  fromBase64,
  sealLore,
  toBase64,
  unsealLore,
  sealedRequest,
} from '../services/campaignLoreCrypto';
import {
  normalizedEntity,
  relatedKeys,
  toEntityInput,
  validateEnvelope,
  validateMutation,
  validateResolution,
  validateState,
  loreReason,
  loreMessage,
  gateDenied,
} from '../services/campaignLoreService';
import {
  clearLoreOperation,
  readLoreOperation,
  reserveLoreOperation,
  replaceLoreOperation,
  subscribeLoreOperations,
} from '../services/campaignLoreRecovery';
import {
  baseId,
  campaignId,
  campaignToken,
  deferred,
  entity,
  envelope,
  header,
  installRecoveryHarness,
  operation,
  resolution,
  result,
  sourceKey,
  targetKey,
  uid,
} from './loreTestHelpers';
vi.mock('../services/campaignLoreCallables', () => ({}));
it('quota DOMException com código numérico mantém erro acionável sem simular revogação', () => {
  const quota = new DOMException(
    'Espaço insuficiente para preservar o pedido.',
    'QuotaExceededError',
  );
  expect(quota.code).toBe(22);
  expect(loreReason(quota)).toBe('');
  expect(gateDenied(quota)).toBe(false);
  expect(loreMessage(quota)).toBe('Espaço insuficiente para preservar o pedido.');
  expect(loreReason({ details: { reason: 22 }, code: 22 })).toBe('');
  expect(loreReason({ details: { reason: 'revision-conflict' } })).toBe('revision-conflict');
  expect(gateDenied({ code: 'functions/permission-denied' })).toBe(true);
});
beforeEach(() => installRecoveryHarness());
afterEach(() => vi.unstubAllGlobals());
const rawKey = () => toBase64(crypto.getRandomValues(new Uint8Array(32)).buffer);
it('cifra e recupera o corpo inteiro e Unicode sem nomes de alvos no payload', async () => {
  const input = {
      ...entity,
      relations: [{ targetKey, relationType: 'Aliada', description: 'Conhece a passagem' }],
    },
    op = { ...operation, relatedSourceKeys: [targetKey] },
    key = rawKey();
  const binary = await sealLore(op, input, key),
    sealed = { ...op, ...binary, phase: 'sealed' as const };
  expect(JSON.stringify(sealed)).not.toContain('Segredo');
  expect(JSON.stringify(sealedRequest(sealed))).not.toContain('Lia');
  expect(await unsealLore(sealed, key)).toEqual(input);
  expect(sealedRequest(sealed)).toEqual(sealedRequest(sealed));
  await expect(
    unsealLore({ ...sealed, header: { ...header, campaignToken: '9'.repeat(64) } }, key),
  ).rejects.toThrow();
  await expect(unsealLore({ ...sealed, relatedSourceKeys: [] }, key)).rejects.toThrow();
});
it('nonce novo em nova cifra e base64 malformado não é aceito', async () => {
  const key = rawKey(),
    a = await sealLore(operation, entity, key),
    b = await sealLore(operation, entity, key);
  expect(toBase64(a.nonce)).not.toBe(toBase64(b.nonce));
  expect(() => fromBase64('Zm9v\n')).toThrow();
});
it('converte View em Input sem targetName e preserva dois tipos ao mesmo alvo', () => {
  const view = {
    ...entity,
    relations: [
      { targetKey, targetName: 'Nome reservado', relationType: 'Aliada', description: '' },
      { targetKey, targetName: 'Nome reservado', relationType: 'Rival', description: '' },
    ],
  };
  const input = toEntityInput(view);
  expect(JSON.stringify(input)).not.toContain('Nome reservado');
  expect(input.relations).toHaveLength(2);
  expect(relatedKeys(input)).toEqual([targetKey]);
});
it.each([
  { ...entity, details: '\ud800' },
  { ...entity, summary: ' ' },
  { ...entity, details: 'x'.repeat(150001) },
  { ...entity, relations: [{ targetKey: sourceKey, relationType: 'Eu', description: '' }] },
])('não trunca nem cifra um corpo incompatível', (value) => {
  expect(() => normalizedEntity(value, sourceKey)).toThrow();
});
it('aceita hash opaco de View filtrada e valida identidade/recibo completos', () => {
  validateState(result().item!, sourceKey);
  expect(() =>
    validateEnvelope(
      { ...envelope, baseId: '1'.repeat(64) },
      uid,
      campaignId,
      baseId,
      campaignToken,
    ),
  ).toThrow();
  expect(() =>
    validateMutation(
      { ...result(1), item: { ...result(1).item!, sourceKey: targetKey } },
      operation,
    ),
  ).toThrow();
  expect(() =>
    validateResolution({ ...resolution(operation), campaignToken: '1'.repeat(64) }, operation),
  ).toThrow();
});
it('só confirma reserva após transaction.oncomplete; abort depois do put não persiste', async () => {
  const h = installRecoveryHarness();
  h.holdWrites();
  let done = false;
  const reserving = reserveLoreOperation(operation).then(() => {
    done = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(done).toBe(false);
  expect(h.rows.size).toBe(0);
  h.completeWrite();
  await reserving;
  h.releaseWrites();
  expect(await readLoreOperation(uid, campaignId)).toEqual(operation);
  await clearLoreOperation(operation);
  h.abortWrite();
  await expect(reserveLoreOperation(operation)).rejects.toThrow();
  expect(h.rows.size).toBe(0);
});
it('revalida sessão dentro do lock e não limpa uma operação posterior', async () => {
  const h = installRecoveryHarness();
  await reserveLoreOperation(operation);
  const gate = deferred<void>();
  h.holdLock(gate.promise);
  let active = true;
  const clearing = clearLoreOperation(operation, () => {
    if (!active) throw new Error('Sessão trocada');
  });
  active = false;
  gate.resolve();
  h.releaseLock();
  await expect(clearing).rejects.toThrow('Sessão trocada');
  expect(await readLoreOperation(uid, campaignId)).toEqual(operation);
  const other = { ...operation, header: { ...header, operationId: 'third-operation' } };
  h.rows.set(h.key, other);
  expect(await clearLoreOperation(operation)).toEqual(other);
  expect(await readLoreOperation(uid, campaignId)).toEqual(other);
});
it('confirmação retira ciphertext antes de encerrar chave e impede troca de descriptor', async () => {
  const h = installRecoveryHarness();
  await reserveLoreOperation(operation);
  const binary = await sealLore(operation, entity, rawKey());
  const sealed = { ...operation, ...binary, phase: 'sealed' as const };
  await replaceLoreOperation(sealed, 'preparing');
  await expect(
    replaceLoreOperation({ ...sealed, header: { ...header, expectedRevision: 3 } }, 'sealed'),
  ).rejects.toThrow();
  const confirmed = { ...operation, phase: 'confirmed' as const, confirmedRevision: 1 };
  await replaceLoreOperation(confirmed, 'sealed');
  expect(h.rows.get(h.key)).toEqual(confirmed);
  expect(await readLoreOperation(uid, campaignId)).not.toHaveProperty('ciphertext');
});
it('BroadcastChannel indisponível não invalida commit e foco continua disponível', async () => {
  vi.stubGlobal(
    'BroadcastChannel',
    class {
      constructor() {
        throw new Error('Não permitido');
      }
    },
  );
  const listener = vi.fn(),
    unsubscribe = subscribeLoreOperations(listener);
  await reserveLoreOperation(operation);
  window.dispatchEvent(new Event('focus'));
  expect(listener).toHaveBeenCalledOnce();
  unsubscribe();
  expect(await readLoreOperation(uid, campaignId)).toEqual(operation);
});
