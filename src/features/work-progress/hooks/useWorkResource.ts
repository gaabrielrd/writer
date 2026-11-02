import { useEffect, useRef, useState } from 'react';
import { workErrorMessage } from '../model/workProgress';
export function useWorkResource<T>(identity: string, load: () => Promise<T>) {
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });
  const [attempt, setAttempt] = useState(0);
  const key = identity + ':' + attempt;
  const [result, setResult] = useState<
    { key: string; value: T; error?: never } | { key: string; error: string; value?: never }
  >();
  useEffect(() => {
    let active = true;
    void loader.current().then(
      (value) => {
        if (active) setResult({ key, value });
      },
      (cause) => {
        if (active) setResult({ key, error: workErrorMessage(cause) });
      },
    );
    return () => {
      active = false;
    };
  }, [key]);
  const current = result?.key === key ? result : undefined;
  return {
    loading: !current,
    value: current?.value,
    error: current?.error ?? '',
    retry: () => setAttempt((n) => n + 1),
  };
}
