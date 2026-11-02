// A new visit reads its CAS base only after this tab's earlier visit finishes.
// The UID key prevents one account's pending work from delaying another account.
const pendingVisits = new Map<string, Promise<unknown>>();
export function runWorkActivity<T>(uid: string, work: () => Promise<T>): Promise<T> {
  const previous = pendingVisits.get(uid);
  const request = (async () => {
    if (previous) await previous.catch(() => undefined);
    return work();
  })();
  pendingVisits.set(uid, request);
  void request
    .finally(() => {
      if (pendingVisits.get(uid) === request) pendingVisits.delete(uid);
    })
    .catch(() => undefined);
  return request;
}
