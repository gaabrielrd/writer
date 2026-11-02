import { getFunctions, httpsCallable as sdkCallable } from 'firebase/functions';
import type { Functions, HttpsCallable, HttpsCallableOptions } from 'firebase/functions';
export { getFunctions };

/** Transport composition is injected by app; this module knows no product domains. */
export function createCallableRouter(
  routes: Readonly<Record<string, string>>,
  passthrough: readonly string[],
  sdk: typeof sdkCallable = sdkCallable,
): typeof sdkCallable {
  const destinations = new Map(Object.entries(routes));
  const direct = new Set(passthrough);
  return function routed<RequestData = unknown, ResponseData = unknown, StreamData = unknown>(
    functions: Functions,
    name: string,
    options?: HttpsCallableOptions,
  ): HttpsCallable<RequestData, ResponseData, StreamData> {
    const endpoint = destinations.get(name);
    if (!endpoint) {
      if (direct.has(name))
        return sdk<RequestData, ResponseData, StreamData>(functions, name, options);
      throw Object.assign(new Error('Ação de servidor não registrada.'), {
        code: 'functions/invalid-argument',
      });
    }
    const invoke = sdk<unknown, ResponseData, StreamData>(functions, endpoint, options);
    const envelope = (payload?: RequestData | null) => ({
      version: 1,
      action: name,
      payload: payload === undefined ? {} : payload,
    });
    const call: HttpsCallable<RequestData, ResponseData, StreamData> = (payload) =>
      invoke(envelope(payload));
    call.stream = (payload, streamOptions) => invoke.stream(envelope(payload), streamOptions);
    return call;
  };
}

// The app entrypoint supplies the routing table before mounting any feature.
// Isolated consumers can inject their own SDK adapter without booting the app.
let transport: typeof sdkCallable = sdkCallable;
export function configureCallableRouting(
  routes: Readonly<Record<string, string>>,
  passthrough: readonly string[],
): void {
  transport = createCallableRouter(routes, passthrough);
}
export function httpsDomainCallable<
  RequestData = unknown,
  ResponseData = unknown,
  StreamData = unknown,
>(
  functions: Functions,
  name: string,
  options?: HttpsCallableOptions,
): HttpsCallable<RequestData, ResponseData, StreamData> {
  return options === undefined
    ? transport<RequestData, ResponseData, StreamData>(functions, name)
    : transport<RequestData, ResponseData, StreamData>(functions, name, options);
}
export { httpsDomainCallable as httpsCallable };
