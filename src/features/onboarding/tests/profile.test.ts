import { describe, expect, it } from 'vitest';
import { defaultProfile, parseProfile, profileLabel, tourSteps } from '../model/profile';
const valid = () => ({ ...defaultProfile, schemaVersion: 1, revision: 1 });
describe('writer creation profile', () => {
  it('accepts independent and combined interests without changing the defaults', () => {
    const profile = parseProfile({ ...valid(), interests: ['campaign'] });
    expect(profileLabel(profile)).toBe('Campanhas');
    profile.interests.push('book');
    expect(defaultProfile.interests).toEqual(['book', 'adventure', 'campaign']);
    expect(profileLabel(parseProfile(valid()))).toBe('Livros e Aventuras e Campanhas');
  });
  it.each([
    { interests: [] },
    { interests: ['book', 'book'] },
    { interests: ['commerce'] },
    { revision: 0 },
    { revision: 1.5 },
    { schemaVersion: 2 },
    { step: 6 },
    { tour: 'paid' },
    { guidance: 'automatic' },
    { startingPoint: 'generate' },
    { apiKey: 'unexpected' },
    { questionnaire: null },
  ])('rejects malformed or expanded profile data: %j', (change) => {
    expect(() => parseProfile({ ...valid(), ...change })).toThrow('Perfil de criação inválido');
  });
  it('offers shorter essential guidance and campaign-specific writing advice', () => {
    const profile = parseProfile({ ...valid(), interests: ['campaign'], guidance: 'guided' });
    expect(tourSteps(profile)).toHaveLength(6);
    expect(tourSteps(profile)[2]?.text).toContain('prepare uma sessão');
    expect(tourSteps({ ...profile, guidance: 'essential' })).toHaveLength(4);
    expect(tourSteps(profile).every((step) => !step.path || step.path.startsWith('/'))).toBe(true);
  });
});
