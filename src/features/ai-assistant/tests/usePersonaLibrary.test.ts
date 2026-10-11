import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { usePersonaLibrary } from '../hooks/usePersonaLibrary';
import { DEFAULT_PERSONAS, type AIPersona } from '../model/persona';
import { subscribePersonas } from '../services/personaService';
vi.mock('../services/personaService', () => ({ subscribePersonas: vi.fn() }));

it('limpa personas na troca de conta e ignora assinaturas antigas, inclusive falhas tardias', () => {
  const subscriptions: {
    owner: string;
    changed: (items: AIPersona[]) => void;
    failed: (error: Error) => void;
    stop: () => void;
  }[] = [];
  vi.mocked(subscribePersonas).mockImplementation((owner, changed, failed) => {
    const stop = vi.fn();
    subscriptions.push({ owner, changed, failed, stop });
    return stop;
  });
  const { result, rerender, unmount } = renderHook<
    ReturnType<typeof usePersonaLibrary>,
    string | null
  >((owner: string | null) => usePersonaLibrary(owner), { initialProps: 'author' });
  expect(result.current.loading).toBe(true);
  const custom = { ...DEFAULT_PERSONAS[0]!, id: 'custom-private' };
  act(() => subscriptions[0]!.changed([custom]));
  expect(result.current.personas).toContainEqual(custom);
  rerender('other');
  expect(result.current.personas).not.toContainEqual(custom);
  expect(result.current.loading).toBe(true);
  act(() => {
    subscriptions[0]!.changed([custom]);
    subscriptions[0]!.failed(new Error('Antiga'));
  });
  expect(result.current.error).toBeNull();
  act(() => subscriptions[1]!.failed(new Error('Falha atual')));
  expect(result.current.error).toBe('Falha atual');
  act(() => result.current.retry());
  expect(result.current.loading).toBe(true);
  act(() => subscriptions[2]!.changed([]));
  expect(result.current.loading).toBe(false);
  rerender(null);
  expect(result.current.personas).toHaveLength(6);
  expect(result.current.error).toBeNull();
  unmount();
  expect(subscriptions[0]!.stop).toHaveBeenCalledOnce();
  expect(subscriptions[1]!.stop).toHaveBeenCalledOnce();
  expect(subscriptions[2]!.stop).toHaveBeenCalledOnce();
});
