import { webcrypto } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import * as service from '../services/adventureLoreService';
import { adventureLoreEntity } from '../model/adventureLore';
import { findLoreMatches } from '../model/loreMatcher';
import { adventureEntityId, loreEntityDocumentId } from '../model/loreScope';
import {
  entity,
  save,
  row,
  globalRow,
  identity,
  list,
  uid,
  adventureId,
  contextToken,
  entityToken,
} from './adventureLoreFixtures';
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
it('prova os vetores de hash fechados do backend e preserva prosa UTF8', async () => {
  const p = await service.prepareAdventureLoreOperation('save', {
    ...save,
    entity: { ...entity, name: '  Dragão  ', aliases: ['  Serpente  '], summary: '  Guardião  ' },
  });
  expect(p.requestHash).toBe('e66fbeebc08783c6ec3f5b96eb94643b6ef01e0ba83b242cbced4e87bb0103ec');
  expect('entity' in p.request && p.request.entity.details).toBe(entity.details);
  expect(
    (
      await service.prepareAdventureLoreOperation('delete', {
        adventureId,
        adventureToken: identity.adventureToken,
        entityId: save.entityId,
        operationId: 'adventure-lore-delete',
        expectedRevision: 1,
        expectedCollectionRevision: 1,
      })
    ).requestHash,
  ).toBe('6e3fbcc23dc22ad5f71b56ba86608ef1aef25b54792e814f6593481846bb6927');
});
it.each([
  { ...entity, isPublic: true },
  { ...entity, aliases: [''] },
  { ...entity, details: '\ud800' },
  { ...entity, relations: [{ targetEntityId: 'other', relationType: 'x', description: '' }] },
  { ...entity, structuredDetails: {} },
  { ...entity, extra: true },
])('rejeita ficha inválida sem normalizar prosa por aproximação (%#)', (value) =>
  expect(() => service.normalizeAdventureLoreEntity(value)).toThrow(),
);
it('limites consideram bytes agregados, formato fechado e identidade de criação', async () => {
  await expect(
    service.prepareAdventureLoreOperation('save', { ...save, operationId: 'another-operation-id' }),
  ).rejects.toThrow();
  await expect(service.prepareAdventureLoreOperation('delete', { ...save })).rejects.toThrow();
  expect(() =>
    service.normalizeAdventureLoreEntity({
      ...entity,
      details: '🐉'.repeat(75000),
      structuredDetails: {
        appearance: 'a'.repeat(150000),
        personality: 'b'.repeat(150000),
        history: 'c'.repeat(150000),
        notes: 'd'.repeat(150000),
      },
    }),
  ).toThrow();
});
it('metadata privada tem contador real e não finge possuir corpo; global mantém contador desconhecido', () => {
  const request = { adventureId, scope: 'adventure' as const };
  const result = service.validateAdventureLoreList(list(request), uid, request);
  expect(result.items[0]).toMatchObject({ adventureId, relationCount: 0 });
  expect(result.items[0]).not.toHaveProperty('details');
  const global = { adventureId, scope: 'universe' as const };
  expect(
    service.validateAdventureLoreList(list(global, [globalRow]), uid, global).items[0],
  ).not.toHaveProperty('revision');
  expect(() =>
    service.validateAdventureLoreList(
      { ...list(request), items: [{ ...row, details: '' } as unknown as typeof row] },
      uid,
      request,
    ),
  ).toThrow();
});
it('get exato autoriza corpo e relações sem nomes de destino', () => {
  const input = {
    adventureId,
    adventureToken: identity.adventureToken,
    reference: row.reference,
    expectedContextToken: contextToken,
    expectedEntityToken: entityToken,
  };
  const value = {
    ...identity,
    collectionRevision: 1,
    contextToken,
    item: {
      ...row,
      details: entity.details,
      structuredDetails: entity.structuredDetails,
      relations: [],
    },
  };
  const full = service.validateAdventureLoreGet(value, uid, input);
  expect(adventureLoreEntity(full.item)).toMatchObject({ adventureId, details: entity.details });
  expect(() =>
    service.validateAdventureLoreGet({ ...value, contextToken: 'd'.repeat(64) }, uid, input),
  ).toThrow();
  expect(() =>
    service.validateAdventureLoreGet(
      {
        ...value,
        item: {
          ...value.item,
          relations: [
            {
              targetEntityId: globalRow.id,
              relationType: 'Conhece',
              description: 'Própria',
              available: false,
              targetName: 'Revogado',
            },
          ],
          relationCount: 1,
        },
      } as typeof value,
      uid,
      input,
    ),
  ).toThrow();
});
it('recibo histórico é metadata fechada e não fornece corpo para rebase', async () => {
  const pending = await service.prepareAdventureLoreOperation('save', save);
  const outcome = {
    ...identity,
    kind: 'confirmed' as const,
    receipt: {
      operationId: save.operationId,
      action: 'save' as const,
      entityId: save.entityId,
      expectedRevision: 0,
      revision: 1,
      collectionRevision: 1,
    },
  };
  expect(service.validateAdventureLoreOutcome(outcome, uid, pending)).toEqual(outcome);
  expect(() =>
    service.validateAdventureLoreOutcome(
      { ...outcome, receipt: { ...outcome.receipt, revision: 2 } },
      uid,
      pending,
    ),
  ).toThrow();
  expect(() =>
    service.validateAdventureLoreOutcome(
      { ...outcome, body: 'private' } as typeof outcome,
      uid,
      pending,
    ),
  ).toThrow();
  expect(
    service.validateAdventureLoreOutcome(
      { ...identity, kind: 'canceled', action: 'save', operationId: save.operationId },
      uid,
      pending,
    ).kind,
  ).toBe('canceled');
});
it('alias local vence metadata global e decoder recusa outra aventura', () => {
  const local = { ...row, adventureId };
  const global = { ...globalRow, universeId: 'world' };
  expect(findLoreMatches('Serpente', [global, local])[0]?.entity.id).toBe(row.id);
  expect(adventureEntityId(adventureId, save.entityId)).toBe(row.id);
  expect(loreEntityDocumentId({ kind: 'adventure', id: adventureId }, row.id)).toBe(save.entityId);
  expect(() =>
    loreEntityDocumentId({ kind: 'adventure', id: 'another-adventure' }, row.id),
  ).toThrow();
});

it('descritor global externo indisponível fica neutro, sem transformar get em save local', () => {
  const input = {
    adventureId,
    adventureToken: identity.adventureToken,
    reference: globalRow.reference,
    expectedContextToken: contextToken,
    expectedEntityToken: entityToken,
  };
  const value = {
    ...identity,
    collectionRevision: 1,
    contextToken,
    item: {
      ...globalRow,
      details: entity.details,
      structuredDetails: entity.structuredDetails,
      relations: [
        {
          targetEntityId: 'book:old-book:old-entity',
          relationType: 'Origem externa',
          description: 'Texto próprio',
          available: false,
        },
      ],
    },
  };
  const full = service.validateAdventureLoreGet(value, uid, input);
  expect(full.item.relations[0]).toEqual(value.item.relations[0]);
  expect(full.item.relations[0]).not.toHaveProperty('targetName');
  expect(() =>
    service.validateAdventureLoreGet(
      {
        ...value,
        item: { ...value.item, relations: [{ ...value.item.relations[0]!, available: true }] },
      },
      uid,
      input,
    ),
  ).toThrow();
});
