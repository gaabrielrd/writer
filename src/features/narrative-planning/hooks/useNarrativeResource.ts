import { useEffect, useRef, useState } from 'react';
import { narrativeErrorMessage } from '../model/narrativeError';
export function useNarrativeResource<T>(key: string, loadResource: () => Promise<T>) {
  const loaderRef = useRef(loadResource);
  useEffect(() => {
    loaderRef.current = loadResource;
  });
  const [attempt, setAttempt] = useState(0);
  const identity = key + ':' + attempt;
  const [result, setResult] = useState<{ key: string; value?: T; error: string }>();
  useEffect(() => {
    const control = { active: true };
    const loader = loaderRef.current;
    void loader().then(
      (value) => {
        if (control.active) setResult({ key: identity, value, error: '' });
      },
      (failure) => {
        if (control.active) setResult({ key: identity, error: narrativeErrorMessage(failure) });
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
