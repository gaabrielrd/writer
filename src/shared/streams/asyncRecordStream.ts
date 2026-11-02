interface Pending<R> {
  record: R;
  accept: () => void;
  reject: (reason: unknown) => void;
}
type Outcome<T> =
  { kind: 'running' } | { kind: 'done'; value: T } | { kind: 'failed'; error: unknown };
/** One pending record, acknowledged only after consumption resumes. No domain or I/O. */
export function asyncRecordStream<R, T>(
  produce: (write: (record: R) => Promise<void>, signal: AbortSignal) => Promise<T>,
  options: { signal?: AbortSignal; check: () => void },
): AsyncGenerator<R, T | undefined, void> {
  const producer = produce,
    checkContext = options.check,
    signal = options.signal,
    controller = new AbortController();
  const state: {
    slot: Pending<R> | null;
    active: Pending<R> | null;
    wake: (() => void) | null;
    outcome: Outcome<T>;
    closed: boolean;
  } = {
    slot: null,
    active: null,
    wake: null,
    outcome: { kind: 'running' },
    closed: false,
  };
  const notify = () => {
    const next = state.wake;
    state.wake = null;
    next?.();
  };
  function close(
    reason: unknown = new DOMException('Consumo encerrado antes da conclusão.', 'AbortError'),
  ) {
    state.closed = true;
    if (!controller.signal.aborted) controller.abort(reason);
    state.active?.reject(reason);
    state.slot?.reject(reason);
    state.active = null;
    state.slot = null;
    notify();
    signal?.removeEventListener('abort', onAbort);
  }
  function onAbort() {
    close(signal?.reason);
  }
  function check() {
    checkContext();
    controller.signal.throwIfAborted();
    if (state.closed) throw new DOMException('Captura encerrada.', 'AbortError');
  }
  async function* run(): AsyncGenerator<R, T | undefined, void> {
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
    const write = async (record: R) => {
      check();
      if (state.slot !== null || state.active !== null)
        throw new Error('O produtor não aguardou o consumo do registro.');
      await new Promise<void>((accept, reject) => {
        state.slot = { record, accept, reject };
        notify();
      });
      check();
    };
    void Promise.resolve()
      .then(() => {
        check();
        return producer(write, controller.signal);
      })
      .then(
        (value) => {
          if (!state.closed) {
            state.outcome = { kind: 'done', value };
            notify();
          }
        },
        (error: unknown) => {
          if (!state.closed) {
            state.outcome = { kind: 'failed', error };
            notify();
          }
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
      close();
    }
  }
  const stream = run(),
    pull = stream.next.bind(stream),
    finish = stream.return.bind(stream),
    raise = stream.throw.bind(stream);
  stream.next = () => {
    const pending = pull();
    void pending.catch(() => {});
    return pending;
  };
  stream.return = (): Promise<IteratorReturnResult<undefined>> => {
    close();
    void finish(undefined).catch(() => {});
    return Promise.resolve({ done: true, value: undefined });
  };
  stream.throw = (error: unknown) => {
    close(error);
    void raise(error).catch(() => {});
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Preserve the explicit iterator throw reason, including non-Error values.
    return Promise.reject(error);
  };
  return stream;
}
