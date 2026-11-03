import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth';
import { loadWriterProfile, saveWriterProfile } from '../services/profileService';
import type { ProfileInput, WriterProfile } from '../model/profile';
import { OnboardingContext, type OnboardingState } from './onboardingContext';
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user ? (
    <ProfileSession key={user.uid} uid={user.uid}>
      {children}
    </ProfileSession>
  ) : (
    children
  );
}
function ProfileSession({ uid, children }: { uid: string; children: ReactNode }) {
  const [profile, setProfile] = useState<WriterProfile | null>(null);
  const [status, setStatus] = useState<OnboardingState['status']>('loading');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [questionnaireOpen, setQuestionnaireOpen] = useState(false);
  const alive = useRef(true);
  const lock = useRef(false);
  const epoch = useRef(0);
  const revision = useRef(0);
  const reload = useCallback(async () => {
    if (lock.current) return;
    const current = ++epoch.current;
    setStatus('loading');
    setError('');
    try {
      const value = await loadWriterProfile(uid);
      if (!alive.current || epoch.current !== current) return;
      revision.current = value?.revision ?? 0;
      setProfile(value);
      setStatus('ready');
      if (!value) setQuestionnaireOpen(true);
    } catch (cause) {
      if (alive.current && epoch.current === current) {
        setError(cause instanceof Error ? cause.message : 'Não foi possível carregar seu perfil.');
        setStatus('error');
      }
    }
  }, [uid]);
  useEffect(() => {
    alive.current = true;
    const runtime = epoch;
    const activation = ++runtime.current;
    void Promise.resolve().then(() => {
      if (alive.current && runtime.current === activation) void reload();
    });
    return () => {
      alive.current = false;
      runtime.current++;
    };
  }, [reload]);
  const save = async (input: ProfileInput) => {
    if (lock.current || status !== 'ready') return false;
    lock.current = true;
    setSaving(true);
    setError('');
    try {
      const value = await saveWriterProfile(uid, revision.current, input);
      if (!alive.current) return false;
      revision.current = value.revision;
      setProfile(value);
      return true;
    } catch (cause) {
      if (alive.current)
        setError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível salvar. Confira o perfil antes de tentar novamente.',
        );
      return false;
    } finally {
      lock.current = false;
      if (alive.current) setSaving(false);
    }
  };
  return (
    <OnboardingContext.Provider
      value={{
        profile,
        status,
        saving,
        error,
        questionnaireOpen,
        openQuestionnaire: () => setQuestionnaireOpen(true),
        closeQuestionnaire: () => setQuestionnaireOpen(false),
        reload,
        save,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}
