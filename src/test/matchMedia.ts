import { vi } from 'vitest';

/** Simulate a viewport that matches only the given media query; returns a restore function. */
export function mockMatchMedia(matching: string) {
  const previous = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: query === matching,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
  return () => {
    if (previous) Object.defineProperty(window, 'matchMedia', previous);
    else Reflect.deleteProperty(window, 'matchMedia');
  };
}
