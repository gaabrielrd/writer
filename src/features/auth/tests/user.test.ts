import { describe, expect, it } from 'vitest';
import { createDefaultProfile, INITIAL_FREE_CREDITS } from '../model/user';

describe('user model', () => {
  it('cria perfil padrao com 100 creditos e tier gratuito', () => {
    const profile = createDefaultProfile('user-123', 'autor@exemplo.com', 'Autor Teste', null);

    expect(profile.uid).toBe('user-123');
    expect(profile.email).toBe('autor@exemplo.com');
    expect(profile.displayName).toBe('Autor Teste');
    expect(profile.photoUrl).toBeNull();
    expect(profile.credits).toBe(INITIAL_FREE_CREDITS);
    expect(profile.tier).toBe('free');
    expect(profile.createdAt).toBeGreaterThan(0);
    expect(profile.updatedAt).toBeGreaterThan(0);
  });
});
