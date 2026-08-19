import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useAIAutocomplete } from '../hooks/useAIAutocomplete';
import * as aiClientModule from '../services/aiClient';
import * as creditsServiceModule from '../services/creditsService';
import * as byokStorageModule from '../services/byokStorage';

vi.mock('../services/aiClient');
vi.mock('../services/creditsService');
vi.mock('../services/byokStorage');

describe('useAIAutocomplete hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(byokStorageModule.getBYOKConfig).mockReturnValue({
      provider: 'firebase_ai',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('nao busca sugestao se o texto antes do cursor for muito curto', () => {
    const { result } = renderHook(() =>
      useAIAutocomplete({
        content: 'Olá',
        cursorPosition: 3,
        userCredits: 10,
        debounceMs: 100,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(aiClientModule.generateAIResponse).not.toHaveBeenCalled();
    expect(result.current.suggestion).toBeNull();
  });

  it('dispara sugestao apos o debounce quando ha creditos e texto suficiente', async () => {
    vi.mocked(aiClientModule.generateAIResponse).mockResolvedValueOnce(
      'e a noite caiu sobre a cidade.',
    );

    const { result } = renderHook(() =>
      useAIAutocomplete({
        content: 'O vento uivava através das árvores antigas da floresta.',
        cursorPosition: 53,
        userCredits: 5,
        debounceMs: 200,
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });

    expect(aiClientModule.generateAIResponse).toHaveBeenCalled();
    expect(result.current.suggestion).toBe('e a noite caiu sobre a cidade.');
  });

  it('notifica falta de creditos e nao busca quando saldo e zero', () => {
    const onShowOutOfCredits = vi.fn();

    renderHook(() =>
      useAIAutocomplete({
        content: 'O vento uivava através das árvores antigas da floresta.',
        cursorPosition: 53,
        userCredits: 0,
        onShowOutOfCredits,
        debounceMs: 200,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(aiClientModule.generateAIResponse).not.toHaveBeenCalled();
    expect(onShowOutOfCredits).toHaveBeenCalled();
  });

  it('aceita sugestao e debita 1 credito quando nao usa BYOK', async () => {
    vi.mocked(aiClientModule.generateAIResponse).mockResolvedValueOnce('continuação mágica');
    vi.mocked(creditsServiceModule.deductCredit).mockResolvedValueOnce(4);
    const onCreditDeducted = vi.fn();

    const { result } = renderHook(() =>
      useAIAutocomplete({
        content: 'Texto inicial longo o suficiente para disparar.',
        cursorPosition: 47,
        userId: 'user-123',
        userCredits: 5,
        onCreditDeducted,
        debounceMs: 100,
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(150);
      await Promise.resolve();
    });

    expect(result.current.suggestion).toBe('continuação mágica');

    let acceptedText: string | null = null;
    await act(async () => {
      acceptedText = await result.current.acceptSuggestion();
    });

    expect(acceptedText).toBe('continuação mágica');
    expect(creditsServiceModule.deductCredit).toHaveBeenCalledWith('user-123', 1);
    expect(onCreditDeducted).toHaveBeenCalledWith(4);
    expect(result.current.suggestion).toBeNull();
  });

  it('descartar sugestao limpa a sugestao sem debitar creditos', async () => {
    vi.mocked(aiClientModule.generateAIResponse).mockResolvedValueOnce('sugestao descartavel');

    const { result } = renderHook(() =>
      useAIAutocomplete({
        content: 'Texto longo para acionar a busca de IA no editor.',
        cursorPosition: 50,
        userId: 'user-123',
        userCredits: 5,
        debounceMs: 100,
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(150);
      await Promise.resolve();
    });

    expect(result.current.suggestion).toBe('sugestao descartavel');

    act(() => {
      result.current.discardSuggestion();
    });

    expect(result.current.suggestion).toBeNull();
    expect(creditsServiceModule.deductCredit).not.toHaveBeenCalled();
  });
});
