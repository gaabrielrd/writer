import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDomainHandler } from '../src/domainCallable.mjs';
import { FUNCTION_DOMAINS, FUNCTION_ROUTES } from '../src/functionDomains.mjs';
import { createSectorServices } from '../src/domainServices.mjs';
import { STANDARD_TRAITS } from '../src/personaProfile.mjs';
import { studioDb } from './helpers/studioDb.mjs';

test('generationApi carries private persona context, generation and idempotent acceptance through the real sector port', async () => {
  const { db, records } = studioDb();
  let calls = 0;
  records.set('universes/world', {
    authorId: 'author',
    name: 'Mundo',
    description: 'Mistério',
    loreVersion: 1,
    privacyVersion: 0,
    updatedAt: 1,
  });
  records.set('users/author', { credits: 0 });
  const services = createSectorServices({
    db,
    assets: {},
    backupStorage: {},
    loreGenerator: () => {},
    assistedGenerator: () => {},
    assistedCost: { value: () => 2 },
    coverCost: { value: () => 5 },
    generationFactory: () => ({}),
    personaGenerator: async () => {
      calls++;
      return JSON.stringify({
        name: 'Voz contextual',
        description: 'Mistério íntimo.',
        instructions: 'Preserve fatos e use uma voz próxima.',
        rationale: 'O contexto sugere proximidade e tensão.',
        values: Object.fromEntries(STANDARD_TRAITS.map((trait) => [trait.id, 50])),
        customTraits: [],
      });
    },
  });
  const handler = createDomainHandler({
    domain: FUNCTION_DOMAINS.generationApi,
    name: 'generationApi',
    invoke: async (method, request) => {
      for (const service of services('generationApi'))
        if (Object.hasOwn(service, method)) return service[method](request.auth?.uid, request.data);
      throw new Error('Missing real port');
    },
  });
  const request = (payload, uid = 'author') => ({
    auth: uid ? { uid } : null,
    app: { appId: 'demo-app' },
    data: { version: 1, action: 'personaGeneration', payload },
  });
  assert.equal(FUNCTION_ROUTES.personaGeneration, 'generationApi');
  await assert.rejects(
    handler(request({ action: 'context', universeId: 'world', entityIds: [] }, null)),
    { code: 'unauthenticated' },
  );
  const context = await handler(request({ action: 'context', universeId: 'world', entityIds: [] }));
  assert.equal(calls, 0);
  const result = await handler(
    request({
      action: 'generate',
      universeId: 'world',
      entityIds: [],
      contextToken: context.contextToken,
      requestId: 'request-persona-domain001',
    }),
  );
  const { name, description, instructions, traits } = result.persona;
  const accept = request({
    action: 'accept',
    requestId: result.requestId,
    persona: { name, description, instructions, traits },
  });
  assert.deepEqual(await handler(accept), await handler(accept));
  assert.equal(calls, 1);
  assert.equal(records.get('users/author').credits, 0);
  assert.equal([...records.keys()].filter((path) => path.includes('/aiPersonas/')).length, 1);
});
