import { expect, it } from 'vitest';
import type {
  AddSessionReferenceInput,
  PendingSessionReference,
  SessionLoreReferenceResult,
  SessionReferenceEnvelope,
  SessionReferenceOutcome,
  SessionReferencePage,
} from '../model/sessionReference';
import {
  canonical,
  deletedCampaignError,
  keys,
  message,
  reason,
  source,
  validateEnvelope,
  validateOutcome,
  validatePage,
  validatePending,
  validateRead,
} from '../services/sessionReferenceService';

const uid = 'reference-owner',
  cid = 'reference-campaign',
  token = 'a'.repeat(64);
const context = { baseId: 'b'.repeat(64), projectionToken: 'c'.repeat(64) };
const sourceKey = 'd'.repeat(64),
  otherKey = 'e'.repeat(64);
const request: AddSessionReferenceInput = {
  campaignId: cid,
  campaignToken: token,
  sessionId: 'session-reference-session-001',
  expectedSessionRevision: 3,
  referenceId: 'session-reference-operation-001',
  operationId: 'session-reference-operation-001',
  expectedReferenceCollectionRevision: 4,
  sourceContext: context,
  target: { kind: 'lore', sourceKey },
};
const pending: PendingSessionReference = {
  schemaVersion: 1,
  ownerId: uid,
  intent: 'apply',
  action: 'add',
  request,
};
const envelope: SessionReferenceEnvelope = {
  schemaVersion: 1,
  ownerId: uid,
  campaignId: cid,
  campaignToken: token,
  sessionId: request.sessionId,
  sessionRevision: 3,
  referenceCollectionRevision: 5,
};
const candidate = {
  sourceKey,
  name: 'Ficha da mesa 🐉',
  category: 'character' as const,
  revision: 2,
  mode: 'override' as const,
  legacy: true,
};
const page: SessionReferencePage = {
  ...envelope,
  view: 'references',
  sourceContext: context,
  nextCursor: null,
  items: [
    {
      id: request.referenceId,
      revision: 1,
      createdAt: 100,
      updatedAt: 101,
      available: true,
      target: { kind: 'lore', ...candidate },
    },
  ],
};
const outcome: SessionReferenceOutcome = {
  schemaVersion: 1,
  ownerId: uid,
  campaignId: cid,
  campaignToken: token,
  sessionId: request.sessionId,
  kind: 'confirmed',
  receipt: {
    operationId: request.operationId,
    action: 'add',
    referenceId: request.referenceId,
    sessionId: request.sessionId,
    expectedSessionRevision: 3,
    expectedReferenceCollectionRevision: 4,
    revision: 1,
    referenceCollectionRevision: 5,
  },
};
const readInput = { ...request, expectedRevision: 1, expectedReferenceCollectionRevision: 5 };
const body: SessionLoreReferenceResult = {
  ...envelope,
  referenceId: request.referenceId,
  referenceRevision: 1,
  sourceContext: context,
  material: {
    kind: 'lore',
    sourceKey,
    revision: 2,
    mode: 'override',
    legacy: true,
    entity: {
      name: 'Ficha 🐉',
      aliases: ['Apelido'],
      category: 'character',
      summary: 'Resumo',
      details: '  Texto\n🐉  ',
      structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
      relations: [
        {
          targetKey: otherKey,
          targetName: 'Nome efetivo',
          relationType: 'Conhece',
          description: '  Exato\n',
        },
      ],
    },
  },
};
const unsafe = <T>(value: unknown): T => value as T;
const clone = <T>(value: T): T => structuredClone(value);

it('aceita somente identidades próprias, revisão da sessão observada e coleção segura', () => {
  expect(() => validateEnvelope(envelope, uid, request)).not.toThrow();
  for (const patch of [
    { schemaVersion: 2 },
    { ownerId: 'other' },
    { campaignId: 'other' },
    { campaignToken: 'f'.repeat(64) },
    { sessionId: 'another-session-operation' },
    { sessionRevision: 4 },
    { referenceCollectionRevision: -1 },
    { referenceCollectionRevision: Number.MAX_SAFE_INTEGER + 1 },
  ])
    expect(() => validateEnvelope(unsafe({ ...envelope, ...patch }), uid, request)).toThrow();
});

it('journal é metadata-only fechado e rejeita schema futuro, IDs inválidos e campos herdados', () => {
  expect(() => validatePending(pending, uid, cid)).not.toThrow();
  for (const patch of [
    { schemaVersion: 2 },
    { ownerId: 'other' },
    { action: 'save' },
    { intent: 'retry' },
    { content: 'prosa' },
  ])
    expect(() => validatePending(unsafe({ ...pending, ...patch }), uid, cid)).toThrow();
  for (const patch of [
    { sessionId: 'short' },
    { referenceId: 'short' },
    { operationId: 'short' },
    { operationId: 'different-operation-001' },
    { expectedSessionRevision: 0 },
    { expectedReferenceCollectionRevision: -1 },
    { campaignId: 'wrong' },
    { sourceContext: null },
    { sourceContext: { ...context, secret: true } },
    { target: { ...request.target, name: 'cache privado' } },
    { target: { kind: 'scene', sourceKey } },
    { target: { kind: 'lore', sourceKey: 'short' } },
  ])
    expect(() =>
      validatePending(unsafe({ ...pending, request: { ...request, ...patch } }), uid, cid),
    ).toThrow();
  expect(() => validatePending(pending, '', cid)).toThrow();
});

it('remove tem pedido fechado próprio e revisão positiva, sem depender da origem', () => {
  const { sourceContext: _, target: __, ...scope } = request;
  void _;
  void __;
  const remove: PendingSessionReference = {
    ...pending,
    action: 'remove',
    request: { ...scope, expectedRevision: 2 },
  };
  expect(() => validatePending(remove, uid, cid)).not.toThrow();
  for (const patch of [
    { expectedRevision: 0 },
    { expectedRevision: 1.5 },
    { target: request.target },
  ])
    expect(() =>
      validatePending(unsafe({ ...remove, request: { ...remove.request, ...patch } }), uid, cid),
    ).toThrow();
});

it('recibo histórico confirma só o evento exato sem corpo nem revisão material atual', () => {
  expect(() => validateOutcome(outcome, pending)).not.toThrow();
  if (outcome.kind !== 'confirmed') throw new Error();
  for (const patch of [
    { operationId: 'another-operation-001' },
    { action: 'remove' },
    { referenceId: 'another-reference-001' },
    { sessionId: 'another-session-001' },
    { expectedSessionRevision: 4 },
    { expectedReferenceCollectionRevision: 5 },
    { revision: 2 },
    { referenceCollectionRevision: 6 },
    { name: 'nome antigo' },
  ])
    expect(() =>
      validateOutcome(unsafe({ ...outcome, receipt: { ...outcome.receipt, ...patch } }), pending),
    ).toThrow();
  expect(() => validateOutcome(unsafe({ ...outcome, material: body.material }), pending)).toThrow();
  expect(() =>
    validateOutcome(unsafe({ ...outcome, campaignToken: 'f'.repeat(64) }), pending),
  ).toThrow();
});

it('cancelamento exige eco integral metadata-only, inclusive contexto e intenção do pedido original', () => {
  const canceled: SessionReferenceOutcome = {
    ...envelope,
    kind: 'canceled',
    action: 'add',
    request,
  };
  delete (canceled as unknown as Record<string, unknown>).sessionRevision;
  delete (canceled as unknown as Record<string, unknown>).referenceCollectionRevision;
  expect(() => validateOutcome(canceled, pending)).not.toThrow();
  for (const patch of [
    { target: { kind: 'lore', sourceKey: otherKey } },
    { sourceContext: { ...context, projectionToken: 'f'.repeat(64) } },
    { expectedSessionRevision: 2 },
    { operationId: 'another-operation-001' },
    { extra: 'body' },
  ])
    expect(() =>
      validateOutcome(unsafe({ ...canceled, request: { ...request, ...patch } }), pending),
    ).toThrow();
  expect(() => validateOutcome(unsafe({ ...canceled, action: 'remove' }), pending)).toThrow();
});

it('lista referências indisponíveis sem nome, alvo ou cache e preserva continuação vazia', () => {
  expect(() => validatePage(page, uid, request, 'references')).not.toThrow();
  const unavailable = {
    ...envelope,
    view: 'references',
    sourceContext: null,
    nextCursor: 'opaque',
    items: [
      { id: request.referenceId, revision: 1, createdAt: 100, updatedAt: 100, available: false },
    ],
  };
  expect(() => validatePage(unsafe(unavailable), uid, request, 'references')).not.toThrow();
  expect(() =>
    validatePage(
      unsafe({ ...unavailable, items: [], nextCursor: 'next-window' }),
      uid,
      request,
      'references',
    ),
  ).not.toThrow();
  for (const patch of [
    { target: { kind: 'lore', ...candidate } },
    { name: 'nome revogado' },
    { available: 'false' },
    { revision: 0 },
    { updatedAt: 99 },
  ])
    expect(() =>
      validatePage(
        unsafe({ ...unavailable, items: [{ ...unavailable.items[0], ...patch }] }),
        uid,
        request,
        'references',
      ),
    ).toThrow();
  expect(() =>
    validatePage(unsafe({ ...page, sourceContext: null }), uid, request, 'references'),
  ).toThrow();
});

it('candidatos são resumos únicos fechados da view observada, inclusive legado', () => {
  const candidates: SessionReferencePage = {
    ...envelope,
    view: 'candidates',
    sourceContext: context,
    nextCursor: 'next',
    items: [candidate],
  };
  expect(() => validatePage(candidates, uid, request, 'candidates')).not.toThrow();
  expect(() => validatePage(candidates, uid, request, 'references')).toThrow();
  for (const patch of [
    { entity: body.material },
    { name: '' },
    { sourceKey: 'short' },
    { revision: -1 },
    { mode: 'removed' },
    { legacy: 1 },
  ])
    expect(() =>
      validatePage(
        unsafe({ ...candidates, items: [{ ...candidate, ...patch }] }),
        uid,
        request,
        'candidates',
      ),
    ).toThrow();
  expect(() =>
    validatePage({ ...candidates, items: [candidate, candidate] }, uid, request, 'candidates'),
  ).toThrow();
  expect(() =>
    validatePage({ ...candidates, sourceContext: null }, uid, request, 'candidates'),
  ).toThrow();
});

it('páginas rejeitam duplicatas, cursor inválido, mais de50 itens e orçamento JSON maior que4MiB', () => {
  for (const nextCursor of ['', 1, 'x'.repeat(12001)])
    expect(() =>
      validatePage(unsafe({ ...page, nextCursor }), uid, request, 'references'),
    ).toThrow();
  expect(() =>
    validatePage({ ...page, items: [...page.items, ...page.items] }, uid, request, 'references'),
  ).toThrow();
  expect(() =>
    validatePage(
      unsafe({ ...page, items: Array(51).fill(page.items[0]) }),
      uid,
      request,
      'references',
    ),
  ).toThrow();
  const huge = clone(page);
  if (huge.view !== 'references') throw new Error();
  const row = huge.items[0];
  if (!row?.available) throw new Error();
  row.target.name = '🐉'.repeat(1024 * 1024 + 1);
  expect(() => validatePage(huge, uid, request, 'references')).toThrow(/limite/);
});

it('leitura confirma vínculo/revisão/contexto exatos e DTO projetado sem hash ou campos internos', () => {
  expect(() => validateRead(body, uid, readInput, sourceKey)).not.toThrow();
  expect(body.material?.entity.details).toBe('  Texto\n🐉  ');
  for (const patch of [
    { referenceId: 'another-reference-001' },
    { referenceRevision: 2 },
    { referenceCollectionRevision: 6 },
    { ownerId: 'other' },
    { campaignToken: 'f'.repeat(64) },
    { sourceContext: { ...context, projectionToken: 'f'.repeat(64) } },
  ])
    expect(() => validateRead(unsafe({ ...body, ...patch }), uid, readInput, sourceKey)).toThrow();
  for (const patch of [
    { sourceKey: otherKey },
    { entityHash: 'f'.repeat(64) },
    { bodyBinding: {} },
    { mode: 'removed' },
    { legacy: 'yes' },
  ])
    expect(() =>
      validateRead(
        unsafe({ ...body, material: { ...body.material, ...patch } }),
        uid,
        readInput,
        sourceKey,
      ),
    ).toThrow();
  const material = body.material;
  if (!material) throw new Error();
  for (const patch of [
    { origin: 'live' },
    { structuredDetails: { ...material.entity.structuredDetails, hidden: 'private' } },
    { relations: [{ targetKey: otherKey, relationType: 'Conhece', description: '' }] },
  ])
    expect(() =>
      validateRead(
        unsafe({
          ...body,
          material: { ...material, entity: { ...material.entity, ...patch } },
        }),
        uid,
        readInput,
        sourceKey,
      ),
    ).toThrow();
});

it('ausência autorizada de material aceita null sem fabricar ficha ou perder eco do vínculo', () => {
  expect(() => validateRead({ ...body, material: null }, uid, readInput, sourceKey)).not.toThrow();
  expect(() =>
    validateRead({ ...body, sourceContext: null, material: null }, uid, readInput, sourceKey),
  ).not.toThrow();
  expect(() => validateRead({ ...body, sourceContext: null }, uid, readInput, sourceKey)).toThrow();
});

it('material null não autoriza adotar um contexto não nulo diferente do pedido', () => {
  expect(() =>
    validateRead(
      { ...body, material: null, sourceContext: { ...context, projectionToken: 'f'.repeat(64) } },
      uid,
      readInput,
      sourceKey,
    ),
  ).toThrow();
});

it('helpers fecham projeção e normalizam comparação sem perder ordem de arrays ou Unicode', () => {
  expect(canonical({ b: ['🐉', '  x\n'], a: 1 })).toBe(canonical({ a: 1, b: ['🐉', '  x\n'] }));
  expect(canonical(['a', 'b'])).not.toBe(canonical(['b', 'a']));
  expect(() => source(null)).not.toThrow();
  for (const value of [undefined, {}, { ...context, extra: true }, { ...context, baseId: 'short' }])
    expect(() => source(unsafe(value))).toThrow();
  expect(() => keys({ a: 1, private: 'secret' }, ['a'])).toThrow();
});

it('pulso C4 aceita somente erro tipado da campanha própria e preserva detalhes neutros de outros erros', () => {
  const error = {
    code: 'functions/failed-precondition',
    details: { reason: 'campaign-deleted', campaignId: cid, deletionId: 'deletion-operation-001' },
  };
  expect(deletedCampaignError(error, cid)).toBe(true);
  expect(
    deletedCampaignError(
      { ...error, details: { ...error.details, reason: 'campaign-deleting' } },
      cid,
    ),
  ).toBe(true);
  for (const value of [
    null,
    new Error('rede'),
    { ...error, code: 'functions/permission-denied' },
    { ...error, details: { ...error.details, campaignId: 'other' } },
    { ...error, details: { ...error.details, deletionId: 'short' } },
  ])
    expect(deletedCampaignError(value, cid)).toBe(false);
  expect(reason({ code: 'functions/not-found' })).toBe('not-found');
  expect(
    reason({
      code: 'functions/failed-precondition',
      details: { reason: 'source-context-changed' },
    }),
  ).toBe('source-context-changed');
  expect(reason(null)).toBe('');
  expect(message(new Error('exato'))).toBe('exato');
  expect(message(null)).toMatch(/consultar/);
});
