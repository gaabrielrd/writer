import { FUNCTION_ROUTES } from '../../src/functionDomains.mjs';

/** Existing action-level journeys now enter the real SDK sector endpoint with its wire envelope. */
export function domainSdkFixture(exports) {
  return Object.assign(
    {},
    exports,
    Object.fromEntries(
      Object.entries(FUNCTION_ROUTES).map(([action, name]) => {
        const endpoint = exports[name];
        const envelope = (payload) => ({ version: 1, action, payload });
        const handler = (req, res) => {
          req.body = { ...req.body, data: envelope(req.body?.data) };
          return endpoint(req, res);
        };
        handler.__endpoint = endpoint.__endpoint;
        handler.run = (request) => endpoint.run({ ...request, data: envelope(request.data) });
        return [action, handler];
      }),
    ),
  );
}
