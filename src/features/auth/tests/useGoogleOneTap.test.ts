import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useGoogleOneTap } from '../hooks/useGoogleOneTap';

describe('useGoogleOneTap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete (window as { google?: unknown }).google;
  });

  it('inicializa o Google One Tap quando window.google ja esta disponivel', () => {
    const mockInitialize = vi.fn();
    const mockPrompt = vi.fn();

    window.google = {
      accounts: {
        id: {
          initialize: mockInitialize,
          prompt: mockPrompt,
          renderButton: vi.fn(),
        },
      },
    };

    const onSuccess = vi.fn();
    renderHook(() => useGoogleOneTap({ onSuccess }));

    expect(mockInitialize).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: '404822288771-uvpfno7e3ianqfkls677tflqhviujk19.apps.googleusercontent.com',
        auto_select: false,
      }),
    );
    expect(mockPrompt).toHaveBeenCalledTimes(1);
  });

  it('chama onSuccess quando o callback do One Tap e disparado', () => {
    let capturedCallback: ((response: { credential: string }) => void) | undefined;
    const mockInitialize = vi
      .fn()
      .mockImplementation((config: { callback: (response: { credential: string }) => void }) => {
        capturedCallback = config.callback;
      });
    const mockPrompt = vi.fn();

    window.google = {
      accounts: {
        id: {
          initialize: mockInitialize,
          prompt: mockPrompt,
          renderButton: vi.fn(),
        },
      },
    };

    const onSuccess = vi.fn();
    renderHook(() => useGoogleOneTap({ onSuccess }));

    expect(capturedCallback).toBeDefined();
    if (capturedCallback) {
      capturedCallback({ credential: 'test-jwt-token' });
    }

    expect(onSuccess).toHaveBeenCalledWith('test-jwt-token');
  });

  it('nao inicializa se disabled for true', () => {
    const mockInitialize = vi.fn();
    window.google = {
      accounts: {
        id: {
          initialize: mockInitialize,
          prompt: vi.fn(),
          renderButton: vi.fn(),
        },
      },
    };

    const onSuccess = vi.fn();
    renderHook(() => useGoogleOneTap({ onSuccess, disabled: true }));

    expect(mockInitialize).not.toHaveBeenCalled();
  });
});
