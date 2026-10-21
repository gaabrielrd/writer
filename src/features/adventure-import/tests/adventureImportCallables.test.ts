import { expect, it, vi } from 'vitest';
import * as api from '../services/adventureImportCallables';
const state = vi.hoisted(() => ({ calls: [] as { name: string; input: unknown }[] }));
vi.mock('@/shared/lib', () => ({ getFirebaseApp: () => ({ name: 'writer' }) }));
vi.mock('firebase/functions', () => ({
  getFunctions: () => ({ region: 'us-central1' }),
  httpsCallable: (_functions: unknown, name: string) => async (input: unknown) => {
    await Promise.resolve();
    state.calls.push({ name, input });
    return { data: { kind: 'wire' } };
  },
}));
it('usa os oito bindings específicos e conserva o payload sem executor genérico', async () => {
  const names = [
    'startAdventureImport',
    'resolveAdventureImportStart',
    'listAdventureImports',
    'getAdventureImport',
    'appendAdventureImportSection',
    'advanceAdventureImport',
    'activateAdventureImport',
    'cancelAdventureImport',
  ] as const;
  for (const name of names) {
    const input = { operationId: 'ImportFixture0001' };
    expect(await (api[name] as (v: unknown) => Promise<unknown>)(input)).toEqual({ kind: 'wire' });
    expect(state.calls.at(-1)).toEqual({ name, input });
  }
});
