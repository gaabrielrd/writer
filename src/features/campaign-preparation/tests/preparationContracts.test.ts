import { expect, it } from 'vitest';
import {
  fieldsError,
  validateItemPage,
  validateItemResult,
  validateLinkPage,
  validateOutcome,
  validatePending,
  deletedCampaignError,
  canonical,
} from '../services/campaignPreparationService';
import { isPreparationPending, emptyItem } from '../model/campaignPreparation';
import {
  clue,
  quest,
  identity,
  scope,
  sessionScope,
  requests,
  pending,
  outcome,
  summary,
  uid,
  campaignId,
  operationId,
} from './preparationTestHelpers';
it.each(requests)(
  'aceita recibo fechado de $action e rejeita identidade/revisão/body extras',
  (request) => {
    const p = pending(request),
      good = outcome(request);
    expect(() => validatePending(p, uid, campaignId)).not.toThrow();
    expect(() => validateOutcome(good, p)).not.toThrow();
    expect(() => validateOutcome({ ...good, ownerId: 'other' }, p)).toThrow();
    if (good.kind === 'confirmed') {
      expect(() =>
        validateOutcome({ ...good, receipt: { ...good.receipt, revision: 999 } }, p),
      ).toThrow();
      expect(() =>
        validateOutcome({ ...good, receipt: { ...good.receipt, body: 'secret' } } as never, p),
      ).toThrow();
    }
    expect(() =>
      validateOutcome(
        { ...identity, kind: 'canceled', action: p.action, operationId: p.request.operationId },
        p,
      ),
    ).not.toThrow();
    expect(() =>
      validateOutcome(
        {
          ...identity,
          kind: 'canceled',
          action: p.action,
          operationId: p.request.operationId,
          request: p.request,
        } as never,
        p,
      ),
    ).toThrow();
  },
);
it('não aceita cancelamento de outra operação ou recibo de outro tipo', () => {
  const p = pending(requests[3]);
  expect(() => validateOutcome(outcome(requests[0]!), p)).toThrow();
  expect(() =>
    validateOutcome(
      { ...identity, kind: 'canceled', action: p.action, operationId: 'different' },
      p,
    ),
  ).toThrow();
});
it('fecha campos, tipo, estado inicial e revisão dos pedidos', () => {
  for (const request of requests) {
    const p = pending(request);
    expect(() => validatePending({ ...p, schemaVersion: 2 } as never, uid, campaignId)).toThrow();
    expect(() =>
      validatePending({ ...p, request: { ...p.request, extra: 1 } } as never, uid, campaignId),
    ).toThrow();
  }
  const p = pending();
  if (p.action !== 'save-item' || p.request.kind !== 'clue') throw new Error('fixture');
  expect(() =>
    validatePending(
      {
        ...p,
        request: {
          ...p.request,
          kind: 'clue',
          body: clue.body,
          expectedRevision: 0,
          itemId: operationId,
          status: 'handled',
        },
      },
      uid,
      campaignId,
    ),
  ).toThrow();
  expect(() =>
    validatePending(
      {
        ...p,
        request: {
          ...p.request,
          kind: 'clue',
          body: clue.body,
          expectedRevision: 0,
          itemId: operationId,
          status: 'pending',
        },
      },
      uid,
      campaignId,
    ),
  ).not.toThrow();
});
it('preserva texto UTF8 sem trim e aplica limites agregados, por campo e título', () => {
  expect(fieldsError(clue)).toBe('');
  expect(fieldsError({ ...clue, title: ' '.repeat(3) })).not.toBe('');
  expect(fieldsError({ ...clue, title: 'x'.repeat(301) })).not.toBe('');
  expect(fieldsError({ ...clue, body: { ...clue.body, text: 'x'.repeat(150001) } })).not.toBe('');
  expect(
    fieldsError({
      ...clue,
      body: {
        text: 'é'.repeat(100000),
        condition: 'é'.repeat(100000),
        recipient: 'é'.repeat(100000),
      },
    }),
  ).not.toBe('');
  expect(fieldsError({ ...clue, body: { ...clue.body, text: '\uD800' } })).not.toBe('');
  expect(fieldsError({ ...clue, body: { text: 'ok' } })).not.toBe('');
  expect(fieldsError({ ...clue, kind: 'unknown' })).not.toBe('');
  expect(fieldsError({ ...clue, status: 'completed' })).not.toBe('');
});
it('deriva pendências dos estados e cria tipos com corpos separados', () => {
  expect(isPreparationPending(clue)).toBe(true);
  expect(isPreparationPending({ ...clue, status: 'handled' })).toBe(false);
  for (const status of ['available', 'active', 'completed', 'failed', 'abandoned'] as const)
    expect(isPreparationPending({ ...quest, status })).toBe(
      ['available', 'active'].includes(status),
    );
  expect(emptyItem('clue', 'id').body).toEqual({ text: '', condition: '', recipient: '' });
  expect(emptyItem('quest', 'id').body).toEqual({ description: '', consequences: '' });
});
it('fecha página sem prosa, filtro, ordem, duplicidade, cursores e revisão', () => {
  const page = { ...identity, itemCollectionRevision: 2, items: [summary(clue)], nextCursor: null };
  const input = { campaignId, kind: 'clue' as const, view: 'all' as const };
  expect(() => validateItemPage(page, uid, input)).not.toThrow();
  expect(() => validateItemPage({ ...page, items: [clue] }, uid, input)).toThrow();
  expect(() => validateItemPage({ ...page, items: [summary(quest)] }, uid, input)).toThrow();
  expect(() =>
    validateItemPage({ ...page, items: [{ ...summary(clue), status: 'handled' }] }, uid, {
      ...input,
      view: 'pending',
    }),
  ).toThrow();
  expect(() =>
    validateItemPage({ ...page, items: [summary(clue), summary(clue)] }, uid, input),
  ).toThrow();
  expect(() => validateItemPage({ ...page, nextCursor: '' }, uid, input)).toThrow();
  expect(() => validateItemPage(page, uid, input, 3)).toThrow();
});
it('get exige identidade e revisão exatas, corpo fechado e revisão atual mínima', () => {
  const value = { ...identity, itemCollectionRevision: 2, item: clue },
    input = { ...scope, itemId: clue.id, expectedRevision: 1 };
  expect(() => validateItemResult(value, uid, input)).not.toThrow();
  expect(() => validateItemResult(value, uid, { ...input, expectedRevision: 2 })).toThrow();
  expect(() =>
    validateItemResult(
      { ...value, item: { ...clue, body: { ...clue.body, storagePath: 'secret' } } } as never,
      uid,
      input,
    ),
  ).toThrow();
  expect(() => validateItemResult(value, uid, input, 3)).toThrow();
});
it('links mistos fecham ambas revisões e não expõem item de tombstone', () => {
  const row = {
    id: 'link',
    revision: 1,
    order: 1,
    createdAt: 1,
    updatedAt: 1,
    available: false as const,
  };
  const page = {
    ...identity,
    ...{ sessionId: sessionScope.sessionId, sessionRevision: 1 },
    itemCollectionRevision: 2,
    linkCollectionRevision: 3,
    items: [row],
    nextCursor: null,
  };
  expect(() => validateLinkPage(page, uid, sessionScope)).not.toThrow();
  expect(() =>
    validateLinkPage(
      { ...page, items: [{ ...row, available: true, target: summary(quest) }] },
      uid,
      sessionScope,
    ),
  ).not.toThrow();
  expect(() =>
    validateLinkPage({ ...page, items: [{ ...row, itemId: 'old' }] } as never, uid, sessionScope),
  ).toThrow();
  expect(() =>
    validateLinkPage(page, uid, { ...sessionScope, expectedSessionRevision: 2 }),
  ).toThrow();
  expect(() => validateLinkPage(page, uid, sessionScope, 3)).toThrow();
  expect(() => validateLinkPage(page, uid, sessionScope, 0, 4)).toThrow();
});
it('somente prova C4 estrita identifica revogação e canonical compara todas as chaves', () => {
  const cause = {
    code: 'functions/failed-precondition',
    details: { reason: 'campaign-deleting', campaignId, deletionId: operationId },
  };
  expect(deletedCampaignError(cause, campaignId)).toBe(true);
  expect(
    deletedCampaignError(
      { ...cause, details: { ...cause.details, deletionId: 'bad' } },
      campaignId,
    ),
  ).toBe(false);
  expect(deletedCampaignError(cause, 'other')).toBe(false);
  expect(deletedCampaignError(new Error('campaign-deleted'), campaignId)).toBe(false);
  expect(canonical({ b: 2, a: { d: 4, c: 3 } })).toBe(canonical({ a: { c: 3, d: 4 }, b: 2 }));
});
