/// <reference types="vitest/globals" />

import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Desmonta a arvore, limpa o DOM e o localStorage apos cada teste.
afterEach(() => {
  cleanup();
  localStorage.clear();
});
