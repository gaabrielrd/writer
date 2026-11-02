import 'vitest';
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

// Vitest 5 no longer reads Jest's global matcher declarations.
declare module 'vitest' {
  // Declaration merging requires an interface to augment Vitest matchers.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Matchers<R, T> extends TestingLibraryMatchers<T, R> {}
}
