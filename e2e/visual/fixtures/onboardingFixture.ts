import {
  defaultProfile,
  parseProfile,
  type ProfileInput,
  type WriterProfile,
} from '../../../src/features/onboarding/model/profile';
const key = (uid: string) => 'writer.visual.onboarding:' + uid;
export async function loadWriterProfile(uid: string): Promise<WriterProfile | null> {
  await Promise.resolve();
  const stored = sessionStorage.getItem(key(uid));
  if (stored) return parseProfile(JSON.parse(stored));
  return sessionStorage.getItem('writer.visual.onboarding-new') === 'true'
    ? null
    : parseProfile({ ...defaultProfile, schemaVersion: 1, revision: 1 });
}
export async function saveWriterProfile(
  uid: string,
  expected: number,
  input: ProfileInput,
): Promise<WriterProfile> {
  const previous = await loadWriterProfile(uid);
  if ((previous?.revision ?? 0) !== expected)
    throw new Error('O perfil mudou. Recarregue antes de salvar.');
  const next = parseProfile({ ...input, schemaVersion: 1, revision: expected + 1 });
  sessionStorage.setItem(key(uid), JSON.stringify(next));
  return next;
}
