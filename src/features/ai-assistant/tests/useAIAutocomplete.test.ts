import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useAIAutocomplete, type UseAIAutocompleteOptions } from '../hooks/useAIAutocomplete';
import * as ai from '../services/aiClient';
import * as credits from '../services/creditsService';
import * as storage from '../services/byokStorage';
import { DEFAULT_PERSONAS, resolveWritingPersona } from '../model/persona';

vi.mock('../services/aiClient');
vi.mock('../services/creditsService');
vi.mock('../services/byokStorage');

const options: UseAIAutocompleteOptions = {
  typingRevision: 0,
  content: 'O vento uivava através das árvores antigas.',
  cursorPosition: 43,
  userId: 'author',
  userCredits: 5,
  debounceMs: 600,
};
const tick = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(600);
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  vi.mocked(storage.getBYOKConfig).mockReturnValue({ provider: 'firebase_ai' });
  vi.mocked(ai.generateAIResponse).mockResolvedValue('A floresta silenciou.');
  vi.mocked(credits.deductCredit).mockResolvedValue(4);
});
afterEach(() => {
  vi.useRealTimers();
});

it('cancela respostas de personas antigas sem gerar de novo até outra digitação', async () => {
  const writingPersona = resolveWritingPersona(DEFAULT_PERSONAS, 'preset-incisive');
  const props = { ...options, writingPersona };
  let complete: (text: string) => void = () => undefined;
  vi.mocked(ai.generateAIResponse).mockReturnValueOnce(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  const { result, rerender } = renderHook(
    (value: UseAIAutocompleteOptions) => useAIAutocomplete(value),
    { initialProps: props },
  );
  rerender({ ...props, typingRevision: 1 });
  await tick();
  expect(ai.generateAIResponse).toHaveBeenCalledWith(
    expect.objectContaining({
      systemInstruction: expect.stringContaining('Concisão: 95/100') as string,
    }),
  );
  const changed = {
    ...props,
    typingRevision: 1,
    writingPersona: resolveWritingPersona(DEFAULT_PERSONAS, 'preset-intimate'),
  };
  rerender(changed);
  await act(async () => {
    complete('Resposta antiga.');
    await Promise.resolve();
  });
  expect(result.current.suggestion).toBeNull();
  expect(await result.current.acceptSuggestion()).toBeNull();
  expect(credits.deductCredit).not.toHaveBeenCalled();
  await tick();
  expect(ai.generateAIResponse).toHaveBeenCalledOnce();
  rerender({ ...changed, typingRevision: 2 });
  await tick();
  expect(ai.generateAIResponse).toHaveBeenLastCalledWith(
    expect.objectContaining({
      systemInstruction: expect.stringContaining('Introspecção: 95/100') as string,
    }),
  );
});

describe('autocomplete acceptance contract', () => {
  it('requests once after 600ms with context but never charges on generation', async () => {
    const { result } = renderAfterTyping();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(599);
    });
    expect(ai.generateAIResponse).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current.suggestion).toBe('A floresta silenciou.');
    expect(credits.deductCredit).not.toHaveBeenCalled();
    await tick();
    expect(ai.generateAIResponse).toHaveBeenCalledOnce();
  });
  it('never requests for short, disabled, unsigned, or exhausted platform sessions', async () => {
    for (const extra of [
      { content: 'Olá', cursorPosition: 3 },
      { enabled: false },
      { userId: null },
      { userCredits: 0 },
    ]) {
      const dialog = vi.fn();
      const { unmount } = renderAfterTyping({ ...extra, onShowOutOfCredits: dialog });
      await tick();
      expect(dialog).not.toHaveBeenCalled();
      unmount();
    }
    expect(ai.generateAIResponse).not.toHaveBeenCalled();
  });
  it('offers the exhaustion dialog only when manually requested', async () => {
    const dialog = vi.fn();
    const { result } = renderAfterTyping({ userCredits: 0, onShowOutOfCredits: dialog });
    await act(async () => {
      await result.current.triggerManualAutocomplete();
    });
    expect(dialog).toHaveBeenCalledOnce();
    expect(ai.generateAIResponse).not.toHaveBeenCalled();
  });
  it('accepts only once even when Tab or clicks repeat while the debit is pending', async () => {
    let finish!: (value: number) => void;
    vi.mocked(credits.deductCredit).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const onCreditDeducted = vi.fn();
    const { result } = renderAfterTyping({ onCreditDeducted });
    await tick();
    let first!: Promise<string | null>;
    await act(async () => {
      first = result.current.acceptSuggestion();
      expect(await result.current.acceptSuggestion()).toBeNull();
    });
    expect(result.current.isAccepting).toBe(true);
    expect(credits.deductCredit).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish(4);
      expect(await first).toBe('A floresta silenciou.');
    });
    expect(onCreditDeducted).toHaveBeenCalledWith(4);
    expect(result.current.suggestion).toBeNull();
    expect(result.current.isAccepting).toBe(false);
    expect(await result.current.acceptSuggestion()).toBeNull();
  });
  it('does not charge when the target changed before acceptance', async () => {
    const { result } = renderAfterTyping();
    await tick();
    await act(async () => {
      expect(await result.current.acceptSuggestion(() => false)).toBeNull();
    });
    expect(credits.deductCredit).not.toHaveBeenCalled();
  });
  it('returns no text and exposes failed debit without inserting or retrying it', async () => {
    vi.mocked(credits.deductCredit).mockRejectedValueOnce(
      new Error('Saldo de créditos insuficiente.'),
    );
    const { result } = renderAfterTyping();
    await tick();
    await act(async () => {
      expect(await result.current.acceptSuggestion()).toBeNull();
    });
    expect(result.current.error).toContain('insuficiente');
    expect(result.current.suggestion).toBeNull();
    expect(credits.deductCredit).toHaveBeenCalledOnce();
  });
  it('uses the provider of the generated suggestion even if settings change before acceptance', async () => {
    const { result } = renderAfterTyping();
    await tick();
    vi.mocked(storage.getBYOKConfig).mockReturnValue({
      provider: 'openai_byok',
      openaiApiKey: 'test-key',
    });
    await act(async () => {
      await result.current.acceptSuggestion();
    });
    expect(credits.deductCredit).toHaveBeenCalledWith('author', 1);
  });
  it('allows BYOK at zero credits and never debits it', async () => {
    vi.mocked(storage.getBYOKConfig).mockReturnValue({
      provider: 'gemini_byok',
      geminiApiKey: 'test-key',
    });
    const { result } = renderAfterTyping({ userCredits: 0 });
    await tick();
    await act(async () => {
      expect(await result.current.acceptSuggestion()).toBe('A floresta silenciou.');
    });
    expect(credits.deductCredit).not.toHaveBeenCalled();
  });
});

describe('request cancellation', () => {
  it('continued typing immediately hides the old suggestion without charging', async () => {
    const { result, rerender } = renderAfterTyping();
    await tick();
    rerender({ ...options, content: options.content + ' E', cursorPosition: 45 });
    expect(result.current.suggestion).toBeNull();
    expect(await result.current.acceptSuggestion()).toBeNull();
    expect(credits.deductCredit).not.toHaveBeenCalled();
  });
  it.each(['discard', 'edit', 'disable', 'unmount'])(
    'ignores an aborted response after %s',
    async (reason) => {
      let finish!: (value: string) => void;
      vi.mocked(ai.generateAIResponse).mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      const { result, rerender, unmount } = renderAfterTyping();
      await tick();
      const signal = vi.mocked(ai.generateAIResponse).mock.calls[0]?.[0].signal;
      if (reason === 'discard') act(() => result.current.discardSuggestion());
      if (reason === 'edit')
        rerender({ ...options, content: 'Um novo parágrafo completamente diferente.' });
      if (reason === 'disable') rerender({ ...options, enabled: false });
      if (reason === 'unmount') unmount();
      await act(async () => {
        finish('Stale result');
        await Promise.resolve();
      });
      expect(signal?.aborted).toBe(true);
      expect(result.current.suggestion).not.toBe('Stale result');
      expect(credits.deductCredit).not.toHaveBeenCalled();
    },
  );
  it('Escape also cancels the pending debounce before any call', async () => {
    const { result } = renderAfterTyping();
    act(() => result.current.discardSuggestion());
    await tick();
    expect(ai.generateAIResponse).not.toHaveBeenCalled();
  });
  it('does not restart the debounce on unrelated callback identities or an equivalent lore array', async () => {
    const { result } = renderAfterTyping({ loreEntities: [], onShowOutOfCredits: () => {} });
    await tick();
    expect(result.current.suggestion).toBe('A floresta silenciou.');
    await tick();
    expect(ai.generateAIResponse).toHaveBeenCalledOnce();
  });
  it('exposes a network failure without charging or blocking a new request', async () => {
    vi.mocked(ai.generateAIResponse).mockRejectedValueOnce(new Error('Rede indisponível'));
    const { result } = renderAfterTyping();
    await tick();
    expect(result.current.error).toBe('Rede indisponível');
    await act(async () => {
      await result.current.triggerManualAutocomplete();
    });
    expect(result.current.suggestion).toBe('A floresta silenciou.');
    expect(credits.deductCredit).not.toHaveBeenCalled();
  });
});

// Existing acceptance/cancellation scenarios begin after an explicit typing event.
function renderAfterTyping(extra: Partial<UseAIAutocompleteOptions> = {}) {
  const initialProps = { ...options, ...extra };
  const hook = renderHook((value: UseAIAutocompleteOptions) => useAIAutocomplete(value), {
    initialProps,
  });
  hook.rerender({ ...initialProps, typingRevision: 1 });
  return hook;
}

describe('typing-only automatic generation', () => {
  it('never generates on mount, cursor moves, selection changes, or loaded content', async () => {
    const { rerender } = renderHook((value: UseAIAutocompleteOptions) => useAIAutocomplete(value), {
      initialProps: options,
    });
    await tick();
    rerender({ ...options, cursorPosition: 20 });
    await tick();
    rerender({ ...options, enabled: false });
    await tick();
    rerender({ ...options, enabled: true });
    await tick();
    rerender({ ...options, content: options.content + ' Texto carregado.' });
    await tick();
    expect(ai.generateAIResponse).not.toHaveBeenCalled();
  });
  it('waits for the pause after the last typing event and generates once', async () => {
    const { rerender } = renderHook((value: UseAIAutocompleteOptions) => useAIAutocomplete(value), {
      initialProps: options,
    });
    rerender({ ...options, content: options.content + ' A', typingRevision: 1 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    rerender({ ...options, content: options.content + ' As', typingRevision: 2 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(599);
    });
    expect(ai.generateAIResponse).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(ai.generateAIResponse).toHaveBeenCalledOnce();
    await tick();
    expect(ai.generateAIResponse).toHaveBeenCalledOnce();
  });
  it('selection cancels a typing debounce without restarting on a collapsed cursor', async () => {
    const { rerender } = renderHook((value: UseAIAutocompleteOptions) => useAIAutocomplete(value), {
      initialProps: options,
    });
    rerender({ ...options, typingRevision: 1 });
    rerender({ ...options, typingRevision: 1, enabled: false });
    rerender({ ...options, typingRevision: 1, enabled: true, cursorPosition: 20 });
    await tick();
    expect(ai.generateAIResponse).not.toHaveBeenCalled();
    rerender({ ...options, typingRevision: 2 });
    await tick();
    expect(ai.generateAIResponse).toHaveBeenCalledOnce();
  });
});
