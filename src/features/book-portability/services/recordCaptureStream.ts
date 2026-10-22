import type { BookBackupRecord } from '../model/backupContainer';
interface Pending {
  record: BookBackupRecord;
  accept: () => void;
  reject: (reason: unknown) => void;
}
type Outcome<T> =
  { kind: 'running' } | { kind: 'done'; value: T } | { kind: 'failed'; error: unknown };
/** Internal bridge: one slot, acknowledged only after the consumer resumes past yield. */
export async function* recordCaptureStream<T>(
  produce: (write: (record: BookBackupRecord) => Promise<void>, signal: AbortSignal) => Promise<T>,
  options: { signal?: AbortSignal; check: () => void },
): AsyncGenerator<BookBackupRecord, T | undefined, void> {
  const controller = new AbortController();
  const state: {
    slot: Pending | null;
    active: Pending | null;
    wake: (() => void) | null;
    outcome: Outcome<T>;
    closed: boolean;
  } = { slot: null, active: null, wake: null, outcome: { kind: 'running' }, closed: false };
  const notify = () => {
    const next = state.wake;
    state.wake = null;
    next?.();
  };
  const onAbort = () => {
    controller.abort(options.signal?.reason);
    notify();
  };
  options.signal?.addEventListener('abort', onAbort, { once: true });
  if (options.signal?.aborted) onAbort();
  function check() {
    options.check();
    controller.signal.throwIfAborted();
    if (state.closed) throw new DOMException('Captura encerrada.', 'AbortError');
  }
  const write = async (record: BookBackupRecord) => {
    check();
    if (state.slot !== null || state.active !== null)
      throw new Error('O produtor não aguardou o consumo do registro.');
    await new Promise<void>((accept, reject) => {
      state.slot = { record, accept, reject };
      notify();
    });
    check();
  };
  // Observe both completion paths even when an unabortable callable settles after cancellation.
  void Promise.resolve()
    .then(() => {
      check();
      return produce(write, controller.signal);
    })
    .then(
      (value) => {
        state.outcome = { kind: 'done', value };
        notify();
      },
      (error: unknown) => {
        state.outcome = { kind: 'failed', error };
        notify();
      },
    );
  try {
    for (;;) {
      check();
      const outcome = state.outcome;
      if (outcome.kind === 'failed') throw outcome.error;
      if (state.slot !== null) {
        state.active = state.slot;
        state.slot = null;
        yield state.active.record;
        check();
        const acknowledged = state.active;
        state.active = null;
        acknowledged.accept();
      } else {
        if (outcome.kind === 'done') return outcome.value;
        await new Promise<void>((resolve) => {
          state.wake = resolve;
        });
      }
    }
  } finally {
    state.closed = true;
    const reason = new DOMException('Consumo encerrado antes da conclusão.', 'AbortError');
    controller.abort(reason);
    state.active?.reject(reason);
    state.slot?.reject(reason);
    state.active = null;
    state.slot = null;
    notify();
    options.signal?.removeEventListener('abort', onAbort);
  }
}
