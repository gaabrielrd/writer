/// <reference types="vitest/globals" />

import { expect } from 'vitest';
import * as domMatchers from '@testing-library/jest-dom/matchers';

import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

expect.extend(domMatchers);

if (typeof window !== 'undefined')
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

// Desmonta a arvore, limpa o DOM e o localStorage apos cada teste.
afterEach(() => {
  cleanup();
  if (typeof localStorage !== 'undefined') localStorage.clear();
});
