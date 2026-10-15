import { useEffect, useRef, useState } from 'react';
import { isWorkConflict, isWorkFailureDefinitive, workErrorMessage } from '../model/workProgress';
export function useWorkMutation<I, R>(
  execute: (input: I) => Promise<R>,
  onSuccess: (result: R, input: I) => void,
) {
  const active = useRef(true),
    inFlight = useRef(false),
    pending = useRef<I | null>(null),
    success = useRef(onSuccess);
  useEffect(() => {
    success.current = onSuccess;
  });
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [state, setState] = useState({ busy: false, error: '', conflict: false, uncertain: false });
  async function run(build: () => I) {
    if (inFlight.current || !active.current) return;
    inFlight.current = true;
    setState({ busy: true, error: '', conflict: false, uncertain: Boolean(pending.current) });
    try {
      const input = pending.current ?? build();
      pending.current = input;
      const result = await execute(input);
      if (active.current) {
        pending.current = null;
        setState({ busy: false, error: '', conflict: false, uncertain: false });
        success.current(result, input);
      }
    } catch (cause) {
      if (active.current) {
        if (isWorkFailureDefinitive(cause)) pending.current = null;
        setState({
          busy: false,
          error: workErrorMessage(cause),
          conflict: isWorkConflict(cause),
          uncertain: pending.current !== null,
        });
      }
    } finally {
      inFlight.current = false;
    }
  }
  return { ...state, run, locked: state.busy || state.uncertain };
}
