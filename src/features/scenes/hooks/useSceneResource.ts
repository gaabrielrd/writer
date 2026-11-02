import { useEffect, useRef, useState } from 'react';
import { sceneErrorMessage } from '../model/sceneError';
export function useSceneResource<T>(key: string, fetchResource: () => Promise<T>) {
  const fetchRef = useRef(fetchResource);
  useEffect(() => {
    fetchRef.current = fetchResource;
  });
  const [attempt, setAttempt] = useState(0);
  const identity = key + ':' + attempt;
  const [result, setResult] = useState<{ key: string; value?: T; error: string }>();
  useEffect(() => {
    const control = { active: true };
    const loader = fetchRef.current;
    void loader().then(
      (value) => {
        if (control.active) setResult({ key: identity, value, error: '' });
      },
      (failure) => {
        if (control.active) setResult({ key: identity, error: sceneErrorMessage(failure) });
      },
    );
    return () => {
      control.active = false;
    };
  }, [identity]);
  const current = result?.key === identity ? result : undefined;
  return {
    value: current?.value,
    error: current?.error ?? '',
    loading: !current,
    retry: () => setAttempt((value) => value + 1),
  };
}
