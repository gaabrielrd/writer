import { expect, it } from 'vitest';
import {
  readSource,
  readProgress,
  readControl,
  readMutation,
  readCanceled,
  readLookup,
  readPage,
  floorOf,
} from '../model/adventureDeletionContracts';
import { uid, adventureId, source, progress, start, step } from './fixtures';
it('aceita fonte, progresso, recibo original retomado e reabertura de fase sem recuar checkpoint', () => {
  expect(readSource(source, uid, adventureId)).toEqual(source);
  expect(readSource(null, uid, adventureId)).toBeNull();
  const old = {
    ...progress,
    checkpoint: 8,
    deletedDocuments: 10,
    phase: 'verify' as const,
    updatedAt: 1008,
  };
  const reopened = { ...old, checkpoint: 9, updatedAt: 1009, phase: 'children' as const };
  expect(readProgress(reopened, uid, {}, floorOf(old))).toEqual(reopened);
  const final = {
    ...reopened,
    checkpoint: 20,
    updatedAt: 1020,
    phase: 'complete',
    state: 'deleted',
    complete: true,
  };
  const mutation = {
    receipt: {
      operationId: step.input.operationId,
      action: 'advance',
      expectedCheckpoint: 0,
      confirmedCheckpoint: 1,
    },
    progress: final,
  };
  expect(readMutation(mutation, step).progress.checkpoint).toBe(20);
  expect(readControl(start, uid, adventureId)).toEqual(start);
  expect(readControl(step, uid, adventureId)).toEqual(step);
});
it.each([
  { ownerId: 'other' },
  { adventureId: 'other' },
  { sourceToken: 'invalid' },
  { adventureToken: null },
  { revision: 0 },
  { title: '' },
  { title: 'x'.repeat(301) },
  { extra: 'private' },
])('recusa fonte incompatível antes de confirmar: %j', (patch) => {
  expect(() => readSource({ ...source, ...patch }, uid, adventureId)).toThrow();
});
it.each([
  { ownerId: 'other' },
  { deletionToken: 'invalid' },
  { revoked: false },
  { state: 'deleted' },
  { complete: true },
  { phase: 'finalizing' },
  { checkpoint: -1 },
  { deletedDocuments: Infinity },
  { updatedAt: -1 },
  { phase: 'verify' },
  { content: 'private' },
])('recusa progresso forjado/incompatível: %j', (patch) => {
  expect(() => readProgress({ ...progress, ...patch }, uid)).toThrow();
});
it('preserva pisos de contagem, datas, fase no mesmo checkpoint e conclusão', () => {
  const old = {
    ...progress,
    checkpoint: 8,
    deletedDocuments: 10,
    updatedAt: 1008,
    phase: 'verify' as const,
  };
  for (const patch of [
    { checkpoint: 7 },
    { checkpoint: 9, deletedDocuments: 9 },
    { checkpoint: 9, createdAt: 999 },
    { checkpoint: 9, updatedAt: 1007 },
    { phase: 'children' },
  ]) {
    expect(() => readProgress({ ...old, ...patch }, uid, {}, floorOf(old))).toThrow();
  }
  const final = { ...old, state: 'deleted' as const, phase: 'complete' as const, complete: true };
  expect(() =>
    readProgress({ ...old, checkpoint: 9, updatedAt: 1009 }, uid, {}, floorOf(final)),
  ).toThrow();
  expect(readProgress(final, uid, {}, floorOf(final))).toEqual(final);
  expect(() =>
    readProgress({ ...final, checkpoint: 9, updatedAt: 1009 }, uid, {}, floorOf(final)),
  ).toThrow();
});
it.each(['operationId', 'action', 'expectedCheckpoint', 'confirmedCheckpoint'])(
  'recibo precisa confirmar o pedido em %s',
  (field) => {
    const r = {
      operationId: step.input.operationId,
      action: 'advance',
      expectedCheckpoint: 0,
      confirmedCheckpoint: 1,
    };
    const p = { ...progress, checkpoint: 1, updatedAt: 1001 };
    expect(() =>
      readMutation({ receipt: { ...r, [field]: 'wrong' }, progress: p }, step),
    ).toThrow();
  },
);
it('recusa job recriado, controle com prosa, piso trocado e cancelamento de outro pedido', () => {
  expect(() => readControl({ ...start, title: 'DO_NOT_STORE' }, uid, adventureId)).toThrow();
  expect(() =>
    readControl(
      { ...step, input: { ...step.input, deletionToken: 'd'.repeat(64) } },
      uid,
      adventureId,
    ),
  ).toThrow();
  expect(() =>
    readControl({ ...step, floor: { ...step.floor, checkpoint: 1 } }, uid, adventureId),
  ).toThrow();
  const p = { ...progress, checkpoint: 1, updatedAt: 1001, deletionToken: 'd'.repeat(64) };
  expect(() =>
    readMutation(
      {
        receipt: {
          operationId: step.input.operationId,
          action: 'advance',
          expectedCheckpoint: 0,
          confirmedCheckpoint: 1,
        },
        progress: p,
      },
      step,
    ),
  ).toThrow();
  expect(() =>
    readCanceled(
      {
        schemaVersion: 1,
        ownerId: uid,
        kind: 'canceled',
        request: { ...start.input, sourceToken: 'e'.repeat(64) },
      },
      start,
    ),
  ).toThrow();
});
it('confere catálogo/lookup próprios, paginação sem repetição e limite do envelope', () => {
  const page = { schemaVersion: 1, ownerId: uid, items: [progress], nextCursor: 'opaque_page' };
  expect(readPage(page, uid)).toEqual(page);
  expect(() => readPage(page, uid, 25, new Set(['opaque_page']))).toThrow();
  expect(() => readPage({ ...page, ownerId: 'other' }, uid)).toThrow();
  expect(() => readPage({ ...page, items: [progress, progress] }, uid)).toThrow();
  expect(() => readPage({ ...page, items: [] }, uid)).toThrow();
  expect(() =>
    readLookup(
      { schemaVersion: 1, ownerId: uid, lookup: { adventureId: 'other' }, deletion: null },
      uid,
      adventureId,
    ),
  ).toThrow();
  expect(() =>
    readSource({ ...source, title: 'x'.repeat(1024 * 1024) }, uid, adventureId),
  ).toThrow();
  expect(() =>
    readControl({ ...start, input: { ...start.input, operationId: 'short' } }, uid, adventureId),
  ).toThrow();
  expect(() => readControl(start, uid, '../wrong')).toThrow();
});
