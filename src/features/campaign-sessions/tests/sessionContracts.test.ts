import { expect, it } from 'vitest';
import type {
  CampaignSession,
  CampaignSessionEnvelope,
  CampaignSessionMutation,
  PendingCampaignSession,
} from '../model/campaignSession';
import {
  definitive,
  errorReason,
  message,
  keys,
  sessionFieldsError,
  validSessionDate,
  validateEnvelope,
  validateMutation,
  validatePending,
  validateSession,
} from '../services/campaignSessionService';

const uid = 'session-owner',
  cid = 'session-campaign',
  token = 'a'.repeat(64),
  sessionId = 'session-operation-first-001';
const envelope: CampaignSessionEnvelope = {
  schemaVersion: 1,
  ownerId: uid,
  campaignId: cid,
  campaignToken: token,
  collectionRevision: 3,
};
const session: CampaignSession = {
  id: sessionId,
  schemaVersion: 1,
  ownerId: uid,
  campaignId: cid,
  revision: 1,
  order: 2,
  title: 'Encontro 🐉',
  scheduledDate: '0001-01-01',
  status: 'planned',
  summary: '  Texto próprio\n🌕  ',
  createdAt: 100,
  updatedAt: 100,
};
const pending: PendingCampaignSession = {
  schemaVersion: 1,
  ownerId: uid,
  method: 'saveCampaignSession',
  input: {
    campaignId: cid,
    campaignToken: token,
    sessionId,
    operationId: sessionId,
    expectedRevision: 0,
    title: '  Encontro 🐉  ',
    scheduledDate: session.scheduledDate,
    status: 'planned',
    summary: session.summary,
  },
};
const mutation: CampaignSessionMutation = {
  ...envelope,
  receipt: {
    operationId: sessionId,
    action: 'save',
    sessionId,
    expectedRevision: 0,
    revision: 1,
    collectionRevision: 1,
  },
  session,
};
const unsafe = <T>(value: unknown): T => value as T;

it('preserva datas civis reais, inclusive anos 1–99 e séculos bissextos, sem converter fuso', () => {
  for (const value of [
    null,
    '0001-01-01',
    '0004-02-29',
    '0099-12-31',
    '0100-02-28',
    '0400-02-29',
    '2000-02-29',
    '2024-02-29',
    '9999-12-31',
  ])
    expect(validSessionDate(value), String(value)).toBe(true);
  for (const value of [
    undefined,
    20240101,
    '',
    '0000-01-01',
    '10000-01-01',
    '0099-02-29',
    '0100-02-29',
    '1900-02-29',
    '2023-02-29',
    '2024-04-31',
    '2024-13-01',
    '2024-00-01',
    '2024-01-00',
    '2024-1-01',
    '2024-01-01T00:00:00Z',
  ])
    expect(validSessionDate(value), String(value)).toBe(false);
});

it('valida o formulário próprio sem truncar Unicode, whitespace nem texto simples', () => {
  const input = { ...session, title: '  Encontro 🐉  ' },
    before = structuredClone(input);
  expect(sessionFieldsError(input)).toBe('');
  expect(input).toEqual(before);
  expect(sessionFieldsError({ ...input, summary: '' })).toBe('');
  expect(sessionFieldsError({ ...input, summary: '漢'.repeat(150000) })).toBe('');
  for (const patch of [
    { title: ' ' },
    { title: 't'.repeat(301) },
    { title: '\ud800' },
    { summary: '\udc00' },
    { summary: 'x'.repeat(150001) },
    { status: 'published' },
    { scheduledDate: '2023-02-29' },
  ])
    expect(sessionFieldsError({ ...input, ...patch })).not.toBe('');
});

it('envelope rejeita outro dono, campanha, token, schema e revisão anterior ao piso observado', () => {
  expect(() => validateEnvelope(envelope, uid, cid, token, 3)).not.toThrow();
  expect(() => validateEnvelope(envelope, uid, cid)).not.toThrow();
  for (const patch of [
    { ownerId: 'other' },
    { campaignId: 'other' },
    { schemaVersion: 2 },
    { campaignToken: 'b'.repeat(64) },
    { campaignToken: 'invalid' },
    { collectionRevision: 2 },
    { collectionRevision: 1.5 },
    { collectionRevision: Number.MAX_SAFE_INTEGER + 1 },
  ])
    expect(() => validateEnvelope(unsafe({ ...envelope, ...patch }), uid, cid, token, 3)).toThrow();
  expect(() => validateEnvelope(unsafe(null), uid, cid, token)).toThrow();
  expect(() =>
    validateEnvelope(unsafe({ ...envelope, oversized: 'x'.repeat(4 * 1024 * 1024) }), uid, cid),
  ).toThrow(/limite/);
});

it('schemas fechados rejeitam campo secreto, campos faltantes, arrays e documentos futuros', () => {
  expect(() => keys({ id: sessionId }, ['id'])).not.toThrow();
  for (const value of [null, [], {}, { id: sessionId, privateBody: 'segredo' }])
    expect(() => keys(value, ['id'])).toThrow();
  const { summary: preparation, ...metadata } = session;
  expect(() =>
    validateSession({ ...metadata, summary: preparation }, uid, cid, sessionId, true),
  ).not.toThrow();
  expect(() => validateSession(metadata, uid, cid)).not.toThrow();
  expect(() => validateSession(session, uid, cid)).toThrow();
  expect(() => validateSession(unsafe(metadata), uid, cid, sessionId, true)).toThrow();
  for (const patch of [
    { schemaVersion: 2 },
    { ownerId: 'other' },
    { campaignId: 'other' },
    { id: 'other-session' },
    { revision: 0 },
    { order: 0 },
    { updatedAt: 99 },
    { createdAt: -1 },
    { status: 'public' },
    { title: ' Não normalizado ' },
    { summary: '\ud800' },
    { privateBody: 'segredo' },
  ])
    expect(() =>
      validateSession(unsafe({ ...session, ...patch }), uid, cid, sessionId, true),
    ).toThrow();
});

it('journal fechado aceita pedido normalizado e rejeita futuros, escopos trocados e campos extras', () => {
  expect(() => validatePending(pending, uid, cid)).not.toThrow();
  for (const patch of [
    { schemaVersion: 2 },
    { ownerId: 'other' },
    { method: 'publishCampaignSession' },
    { future: true },
    { input: null },
    { input: { ...pending.input, campaignId: 'other' } },
    { input: { ...pending.input, campaignToken: 'invalid' } },
    { input: { ...pending.input, expectedRevision: -1 } },
    { input: { ...pending.input, isPublic: true } },
    { input: { ...pending.input, status: 'running' } },
    { input: { ...pending.input, sessionId: 'session-operation-different' } },
  ])
    expect(() => validatePending(unsafe({ ...pending, ...patch }), uid, cid)).toThrow();
});

it('journal usa o contrato de IDs de mutação do servidor, inclusive em sessão/operation diferentes na edição', () => {
  const edit: PendingCampaignSession = {
    ...pending,
    input: { ...pending.input, operationId: 'operation-session-edit-0001', expectedRevision: 1 },
  };
  expect(() => validatePending(edit, uid, cid)).not.toThrow();
  for (const invalid of [
    '',
    'short',
    'x'.repeat(81),
    'x'.repeat(15),
    'bad/id-00000000001',
    'bad_id-00000000001',
    '🐉'.repeat(16),
    'space id-000000001',
  ])
    for (const field of ['operationId', 'sessionId'])
      expect(() =>
        validatePending(unsafe({ ...edit, input: { ...edit.input, [field]: invalid } }), uid, cid),
      ).toThrow();
});

it('move/delete preservados exigem revisões positivas e move exige coleção e direção fechadas', () => {
  const common = {
    campaignId: cid,
    campaignToken: token,
    sessionId,
    operationId: 'operation-session-move-001',
    expectedRevision: 1,
  };
  const move: PendingCampaignSession = {
    schemaVersion: 1,
    ownerId: uid,
    method: 'moveCampaignSession',
    input: { ...common, expectedCollectionRevision: 3, direction: 'up' },
  };
  const remove: PendingCampaignSession = {
    schemaVersion: 1,
    ownerId: uid,
    method: 'deleteCampaignSession',
    input: common,
  };
  expect(() => validatePending(move, uid, cid)).not.toThrow();
  expect(() => validatePending(remove, uid, cid)).not.toThrow();
  for (const patch of [
    { expectedRevision: 0 },
    { expectedCollectionRevision: undefined },
    { expectedCollectionRevision: -1 },
    { direction: 'sideways' },
    { summary: 'prosa extra' },
  ])
    expect(() =>
      validatePending(unsafe({ ...move, input: { ...move.input, ...patch } }), uid, cid),
    ).toThrow();
  expect(() =>
    validatePending(
      unsafe({ ...remove, input: { ...remove.input, expectedRevision: 0 } }),
      uid,
      cid,
    ),
  ).toThrow();
});

it('aceita confirmação histórica sem corpo atual e distingue coleção atual da revisão histórica do evento', () => {
  expect(() => validateMutation(mutation, pending, 3)).not.toThrow();
  expect(() =>
    validateMutation({ ...mutation, collectionRevision: 9, session: null }, pending, 9),
  ).not.toThrow();
  expect(() => validateMutation({ ...mutation, collectionRevision: 9 }, pending, 9)).not.toThrow();
  expect(() => validateMutation(mutation, pending, 4)).toThrow();
});

it('recibo rejeita identidade, delta, ação e corpo que não pertencem ao pedido exato', () => {
  for (const patch of [
    { operationId: 'operation-other-0001' },
    { action: 'delete' },
    { sessionId: 'session-other-0001' },
    { expectedRevision: 1 },
    { revision: 2 },
    { collectionRevision: 0 },
    { collectionRevision: 4 },
    { future: true },
  ])
    expect(() =>
      validateMutation(
        unsafe({ ...mutation, receipt: { ...mutation.receipt, ...patch } }),
        pending,
      ),
    ).toThrow();
  for (const patch of [
    { ownerId: 'other' },
    { campaignId: 'other' },
    { campaignToken: 'b'.repeat(64) },
    { schemaVersion: 2 },
    { internal: 'segredo' },
  ])
    expect(() => validateMutation(unsafe({ ...mutation, ...patch }), pending)).toThrow();
  for (const patch of [
    { summary: 'Outro corpo' },
    { title: 'Outro título' },
    { scheduledDate: null },
    { status: 'running' },
    { revision: 2 },
    { ownerId: 'other' },
  ])
    expect(() =>
      validateMutation(unsafe({ ...mutation, session: { ...session, ...patch } }), pending),
    ).toThrow();
});

it('move confirma delta estrutural exato e delete nunca entrega corpo, mesmo em replay histórico', () => {
  const common = {
    campaignId: cid,
    campaignToken: token,
    sessionId,
    operationId: 'operation-session-move-001',
    expectedRevision: 1,
  };
  const move: PendingCampaignSession = {
    schemaVersion: 1,
    ownerId: uid,
    method: 'moveCampaignSession',
    input: { ...common, expectedCollectionRevision: 3, direction: 'down' },
  };
  const result: CampaignSessionMutation = {
    ...envelope,
    collectionRevision: 8,
    receipt: {
      operationId: common.operationId,
      action: 'move',
      sessionId,
      expectedRevision: 1,
      revision: 2,
      collectionRevision: 4,
    },
    session: { ...session, revision: 2, order: 3, updatedAt: 101 },
  };
  expect(() => validateMutation(result, move)).not.toThrow();
  expect(() => validateMutation({ ...result, session: null }, move)).not.toThrow();
  expect(() =>
    validateMutation({ ...result, receipt: { ...result.receipt, collectionRevision: 5 } }, move),
  ).toThrow();
  const remove: PendingCampaignSession = {
    schemaVersion: 1,
    ownerId: uid,
    method: 'deleteCampaignSession',
    input: common,
  };
  const deleted: CampaignSessionMutation = {
    ...result,
    receipt: { ...result.receipt, action: 'delete' },
    session: null,
  };
  expect(() => validateMutation(deleted, remove)).not.toThrow();
  expect(() => validateMutation({ ...deleted, session: result.session }, remove)).toThrow();
});

it('somente três rejeições são definitivas; rede, C4, identidade e falha genérica continuam incertas', () => {
  for (const reason of ['invalid-argument', 'revision-conflict', 'order-boundary'])
    expect(definitive({ code: 'functions/failed-precondition', details: { reason } })).toBe(true);
  expect(definitive({ code: 'functions/invalid-argument' })).toBe(true);
  for (const cause of [
    null,
    'erro',
    new Error('rede'),
    {},
    { code: 'functions/unavailable' },
    { code: 'functions/permission-denied' },
    ...['campaign-changed', 'session-inconsistent', 'campaign-deleting', 'campaign-deleted'].map(
      (reason) => ({ code: 'functions/failed-precondition', details: { reason } }),
    ),
  ])
    expect(definitive(cause)).toBe(false);
  expect(errorReason({ code: 'functions/unavailable' })).toBe('unavailable');
  expect(
    errorReason({ code: 'functions/invalid-argument', details: { reason: 'campaign-deleting' } }),
  ).toBe('campaign-deleting');
  expect(errorReason(undefined)).toBe('');
  expect(message(new Error('Texto exato'))).toBe('Texto exato');
  expect(message(null)).toBe('Não foi possível consultar as sessões.');
});
