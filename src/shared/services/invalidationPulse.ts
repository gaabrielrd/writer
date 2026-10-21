export interface InvalidationScope {
  actorId: string;
  scope: string;
}

interface Slot {
  generation: number;
  target: EventTarget;
}

const slots = new Map<string, Slot>();
const channelName = 'writer:invalidation';
let channel: BroadcastChannel | null | undefined;
let subscriptions = 0;

function validScope(value: unknown): value is InvalidationScope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 2 &&
    ['actorId', 'scope'].every(
      (key) =>
        typeof record[key] === 'string' && record[key].length > 0 && record[key].length <= 1024,
    )
  );
}

function keyOf(value: InvalidationScope): string {
  if (!validScope(value)) throw new Error('Escopo de invalidação inválido.');
  return JSON.stringify([value.actorId, value.scope]);
}

function slotFor(value: InvalidationScope): Slot {
  const key = keyOf(value);
  let slot = slots.get(key);
  if (!slot) {
    slot = { generation: 0, target: new EventTarget() };
    slots.set(key, slot);
  }
  return slot;
}

function invalidate(slot: Slot): void {
  slot.generation++;
  slot.target.dispatchEvent(new Event('invalidate'));
}

function closeChannel(): void {
  try {
    channel?.close();
  } catch {
    // A transport failure never prevents local presentation invalidation.
  }
  channel = undefined;
}

function openChannel(): BroadcastChannel | null {
  if (channel !== undefined) return channel;
  try {
    channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(channelName);
    if (channel) {
      channel.onmessage = (event: MessageEvent<unknown>) => {
        if (!validScope(event.data)) return;
        const slot = slots.get(keyOf(event.data));
        if (slot) invalidate(slot);
      };
    }
  } catch {
    channel = null;
  }
  return channel;
}

/** Presentation hint only; neither a permission nor proof of a remote mutation. */
export function getInvalidationGeneration(scope: InvalidationScope): number {
  return slotFor(scope).generation;
}

export function publishInvalidation(scope: InvalidationScope): void {
  invalidate(slotFor(scope));
  try {
    openChannel()?.postMessage({ actorId: scope.actorId, scope: scope.scope });
  } catch {
    closeChannel();
  } finally {
    if (!subscriptions) closeChannel();
  }
}

export function subscribeInvalidation(scope: InvalidationScope, listener: () => void): () => void {
  const slot = slotFor(scope);
  const handler = () => listener();
  slot.target.addEventListener('invalidate', handler);
  subscriptions++;
  openChannel();
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    slot.target.removeEventListener('invalidate', handler);
    subscriptions--;
    if (!subscriptions) closeChannel();
  };
}
