import { describe, expect, it, vi } from 'vitest';
import { getToken } from 'firebase/app-check';
import { auth, appCheck, firebaseApp } from '../firebase';

vi.mock('@/shared/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/config')>();
  return {
    ...actual,
    env: {
      ...actual.env,
      useFirebaseEmulators: true,
      firebase: {
        ...actual.env.firebase,
        apiKey: 'demo-writer-key',
        projectId: 'demo-writer',
        storageBucket: 'demo-writer.firebasestorage.app',
        appCheckKey: undefined,
      },
    },
  };
});

describe('Firebase local', () => {
  it('usa Auth em loopback no projeto demo', () => {
    expect(firebaseApp.options.projectId).toBe('demo-writer');
    expect(auth.emulatorConfig).toMatchObject({ host: '127.0.0.1', port: 9099 });
  });

  it('fornece token App Check local sem reCAPTCHA ou troca remota', async () => {
    expect(appCheck).not.toBeNull();
    const result = await getToken(appCheck!);
    const [header = '', payload = '', signature] = result.token.split('.');
    expect(JSON.parse(atob(header))).toEqual({ alg: 'none', typ: 'JWT' });
    expect(JSON.parse(atob(payload))).toMatchObject({ aud: ['projects/demo-writer'] });
    expect(signature).toBe('');
  });
});
