/// <reference types="vitest/globals" />

// Node contracts do not load React, DOM matchers or browser cleanup.
if (typeof window !== 'undefined') {
  await import('./setupDom');
}

export {};
