import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  normalizeEditorChatRequest,
  normalizeEditorChatDTO,
  canonicalEditorChatJSON,
  editorChatTextHash,
  editorChatRequestHash,
  EditorChatContractError,
} from '../model/editorChat';
import { requestFor, rowFor, responseFor, base, capture, hash } from './editorChatTestFixtures';

beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());
describe('public editorChat wire', () => {
  it('reuses the exact canonical and raw text contracts, including Unicode and LF', async () => {
    expect(canonicalEditorChatJSON({ z: '🐉\n', a: ['  texto  '] })).toBe(
      JSON.stringify({ a: ['  texto  '], z: '🐉\n' }),
    );
    expect(await editorChatTextHash('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
  it('keeps editor and persisted body hashes independent and preserves own prose', async () => {
    const request = await requestFor('prepareContext');
    const normalized = normalizeEditorChatRequest<'prepareContext'>(request);
    expect(normalized.base).toEqual(base);
    expect(normalized.capture).toEqual(capture);
    expect(normalized.capture.editorHash).not.toBe(normalized.base.bodyHash);
    expect(normalized.requestHash).toBe(await editorChatRequestHash(normalized));
    const send = normalizeEditorChatRequest<'send'>(await requestFor('send'));
    expect(send.prompt).toBe(' Ideias 🐉\n');
  });
  it('normalizes only the explicit conversation title and default page size', async () => {
    expect(
      normalizeEditorChatRequest<'renameConversation'>(await requestFor('renameConversation'))
        .title,
    ).toBe('Novo título');
    expect(
      normalizeEditorChatRequest<'listConversations'>(await requestFor('listConversations')).limit,
    ).toBe(25);
  });
  it('rejects undeclared fields rather than accepting client lore/persona as authorization', async () => {
    const request = await requestFor('prepareContext');
    expect(() =>
      normalizeEditorChatRequest({ ...request, lore: [{ details: 'Privado' }] }),
    ).toThrow(EditorChatContractError);
    expect(() => normalizeEditorChatRequest({ ...request, persona: 'Instrução' })).toThrow(
      EditorChatContractError,
    );
    expect(() =>
      normalizeEditorChatRequest({ ...request, target: { kind: 'campaign', id: 'campaign' } }),
    ).toThrow(EditorChatContractError);
    expect(() =>
      normalizeEditorChatRequest({ ...request, resource: { kind: 'block', id: 'block' } }),
    ).toThrow(EditorChatContractError);
  });
  it('exposes only metadata in journal and history pages', async () => {
    const row = rowFor(await requestFor('send'));
    expect(normalizeEditorChatDTO('journal', row)).toEqual(row);
    for (const key of ['prompt', 'after', 'context', 'answer', 'byokInput', 'key'])
      expect(() => normalizeEditorChatDTO('journal', { ...row, [key]: 'private' })).toThrow(
        EditorChatContractError,
      );
    const page = await responseFor(await requestFor('listMessages'));
    expect(normalizeEditorChatDTO('turnPage', page)).toEqual(page);
    expect(() =>
      normalizeEditorChatDTO('turnPage', {
        ...page,
        items: [{ ...page.items[0], answer: 'Private' }],
      }),
    ).toThrow(EditorChatContractError);
  });
  it('accepts canceled and inaccessible send receipts without fabricating a turn', async () => {
    const request = await requestFor('send');
    const result = await responseFor(request);
    expect(
      normalizeEditorChatDTO('sendResult', {
        ...result,
        turn: null,
        delivery: null,
        byokInput: null,
      }).turn,
    ).toBeNull();
    const receipt = { ...result.receipt, outcome: 'canceled', result: { kind: 'fence' } };
    expect(
      normalizeEditorChatDTO('sendResult', { receipt, turn: null, delivery: null, byokInput: null })
        .receipt.outcome,
    ).toBe('canceled');
    expect(() => normalizeEditorChatDTO('sendResult', { ...result, receipt })).toThrow(
      EditorChatContractError,
    );
  });
  it('supports legacy custom persona IDs but rejects unknown presets', async () => {
    const request = await requestFor('setAdventurePersonaBinding');
    expect(
      normalizeEditorChatRequest<'setAdventurePersonaBinding'>({
        ...request,
        value: { personaId: 'minha-persona' },
      }).value,
    ).toEqual({ personaId: 'minha-persona' });
    expect(() =>
      normalizeEditorChatRequest({ ...request, value: { personaId: 'preset-unknown' } }),
    ).toThrow(EditorChatContractError);
    expect(() =>
      normalizeEditorChatRequest({
        ...request,
        expectedBindingToken: hash('0'),
        value: { personaId: null, personaComplement: null },
      }),
    ).toThrow(EditorChatContractError);
  });
});
