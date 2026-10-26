// @vitest-environment node
import { it, expect } from 'vitest';
import { inventoryFixture } from './adventureInventoryFixture.mjs';
import {
  scanAdventureBackupInventory as scan,
  verifyAdventureBackupInventory as verify,
  AdventureInventoryError,
} from '../index';
import { ADVENTURE_RESOURCE_KINDS } from '../../../../functions/src/adventureBackupResourceDefinitions.mjs';
const options = { guard: () => {} };
it('walks actual producers and every registered view, retaining only metadata and bounded ancestors', async () => {
  const f = await inventoryFixture(),
    visits = [];
  const proof = await scan(f.id, f.scanApi, {
    ...options,
    visit: async (scope, row) => {
      visits.push({ scope, row });
      expect(Object.isFrozen(scope)).toBe(true);
      expect(Object.isFrozen(row)).toBe(true);
    },
  });
  expect(proof.validation).toBe('inventory-only');
  expect(proof.counts).toMatchObject({
    structure: 1,
    lore: 2,
    personas: 2,
    images: 2,
    universe: 1,
  });
  expect(proof.counts.history).toBeGreaterThanOrEqual(3);
  expect(
    new Set(
      f.calls.filter((c) => c.method === 'listAdventureBackupResources').map((c) => c.input.kind),
    ),
  ).toEqual(new Set(ADVENTURE_RESOURCE_KINDS));
  expect(
    visits.some((v) => v.scope.kind === 'milestone' && v.scope.parentId === 'inventory-arc-0001'),
  ).toBe(true);
  expect(
    visits.some((v) => v.scope.kind === 'version-chunk' && typeof v.row.ordinal === 'number'),
  ).toBe(true);
  expect(JSON.stringify(proof) + JSON.stringify(visits)).not.toContain('PRIVATE_');
  expect(f.calls.some((c) => /readAdventureBackup|getAdventureBackupImage$/.test(c.method))).toBe(
    false,
  );
  await verify(proof, f.scanApi, options);
  expect(Object.isFrozen(proof.counts)).toBe(true);
});
it('continues through 53 scenes without a page or project cap', async () => {
  const f = await inventoryFixture(53),
    proof = await scan(f.id, f.scanApi, options);
  expect(proof.counts.personas).toBe(54);
  expect(proof.counts.images).toBe(54);
  expect(
    f.calls
      .filter((c) => c.method === 'listAdventureBackupResources' && c.input.kind === 'scene')
      .map((c) => c.input.cursor !== null),
  ).toEqual([false, true]);
  await verify(proof, f.scanApi, options);
});
it('detects a changed child native identity without a root clock or count change', async () => {
  const f = await inventoryFixture(),
    proof = await scan(f.id, f.scanApi, options);
  await f.db.runTransaction((tx) =>
    tx.update(f.db.doc(f.path + '/scenes/' + f.sceneId + '/body/current'), {
      content: 'PRIVATE_CHANGED',
    }),
  );
  const root = await f.handlers.getAdventureBackupSource('author', { adventureId: f.id });
  expect(root.sourceToken).toBe(proof.source.sourceToken);
  await expect(verify(proof, f.scanApi, options)).rejects.toBeInstanceOf(AdventureInventoryError);
});
it('detects a scene persona setter with unchanged root and unchanged counts', async () => {
  const f = await inventoryFixture(),
    proof = await scan(f.id, f.scanApi, options);
  await f.bind(1, 'inventory-persona-change-0001');
  expect(
    (await f.handlers.getAdventureBackupSource('author', { adventureId: f.id })).sourceToken,
  ).toBe(proof.source.sourceToken);
  await expect(verify(proof, f.scanApi, options)).rejects.toBeInstanceOf(AdventureInventoryError);
});
it('detects a universe availability change without inventing a grant or copying lore', async () => {
  const f = await inventoryFixture();
  await f.db.runTransaction((tx) => tx.update(f.db.doc(f.path), { universeId: 'inventory-world' }));
  const proof = await scan(f.id, f.scanApi, options);
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc('universes/inventory-world'), {
      authorId: 'author',
      deleting: false,
      name: 'PRIVATE_WORLD',
    }),
  );
  expect(
    (await f.handlers.getAdventureBackupSource('author', { adventureId: f.id })).sourceToken,
  ).toBe(proof.source.sourceToken);
  await expect(verify(proof, f.scanApi, options)).rejects.toBeInstanceOf(AdventureInventoryError);
});
it('root recreation cannot be adopted with an old proof, even with identical authored fields', async () => {
  const f = await inventoryFixture(),
    proof = await scan(f.id, f.scanApi, options),
    old = structuredClone(f.records.get(f.path));
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(f.path)));
  await f.db.runTransaction((tx) => tx.create(f.db.doc(f.path), old));
  await expect(verify(proof, f.scanApi, options)).rejects.toMatchObject({
    code: 'failed-precondition',
  });
});
for (const [name, edit] of [
  ['private extras', (v) => ({ ...v, privateTitle: 'PRIVATE_LEAK' })],
  ['duplicate IDs', (v) => ({ ...v, items: [v.items[0], v.items[0]] })],
  ['short continuing page', (v) => ({ ...v, nextCursor: 'cursor' })],
  ['missing token', (v) => ({ ...v, items: [{ id: v.items[0].id }] })],
  ['wrong source', (v) => ({ ...v, sourceToken: 'f'.repeat(64) })],
]) {
  it('rejects malformed metadata: ' + name, async () => {
    const f = await inventoryFixture();
    f.intercept(async (method, _input, run) => {
      const result = await run();
      return method === 'listAdventureBackupStructure' ? edit(result) : result;
    });
    await expect(scan(f.id, f.scanApi, options)).rejects.toBeInstanceOf(AdventureInventoryError);
  });
}
it('copies a whole response page before awaiting a visitor', async () => {
  const f = await inventoryFixture();
  await f.scenes.createSceneGroup('author', {
    target: f.target,
    operationId: 'inventory-part-0002',
    title: 'PRIVATE_PART_2',
  });
  let page;
  const seen = [];
  f.intercept(async (method, _input, run) => {
    const result = await run();
    if (method === 'listAdventureBackupStructure') page = result;
    return result;
  });
  const proof = await scan(f.id, f.scanApi, {
    ...options,
    visit: async (scope, row) => {
      if (scope.family === 'structure') {
        seen.push(row.id);
        if (seen.length === 1) page.items[1].id = 'changed-after-await';
      }
    },
  });
  expect(seen).toEqual(['inventory-part-0001', 'inventory-part-0002']);
  f.intercept(null);
  await verify(proof, f.scanApi, options);
});
it('freezes expected source, callback and port method before a suspended request', async () => {
  const f = await inventoryFixture(),
    pin = await f.handlers.getAdventureBackupSource('author', { adventureId: f.id });
  let release, started;
  const atStart = new Promise((r) => {
      started = r;
    }),
    held = new Promise((r) => {
      release = r;
    });
  let first = true,
    visits = 0;
  f.intercept(async (method, _input, run) => {
    if (first && method === 'getAdventureBackupSource') {
      first = false;
      started();
      await held;
    }
    return run();
  });
  const settings = {
      ...options,
      source: { ...pin },
      visit: async () => {
        visits++;
      },
    },
    oldCall = f.scanApi.call;
  const running = scan(f.id, f.scanApi, settings);
  await atStart;
  settings.source.sourceToken = 'e'.repeat(64);
  settings.visit = async () => {
    throw Error('late callback');
  };
  f.scanApi.call = async () => {
    throw Error('late port');
  };
  release();
  const proof = await running;
  expect(proof.source.sourceToken).toBe(pin.sourceToken);
  expect(visits).toBeGreaterThan(0);
  f.scanApi.call = oldCall;
});
it('account change after a held request prevents any visitor and all later calls', async () => {
  const f = await inventoryFixture();
  let release,
    started,
    current = true;
  const atStart = new Promise((r) => {
      started = r;
    }),
    held = new Promise((r) => {
      release = r;
    });
  f.intercept(async (_method, _input, run) => {
    const result = await run();
    started();
    await held;
    return result;
  });
  let visits = 0;
  const running = scan(f.id, f.scanApi, {
    guard: () => {
      if (!current) throw Error('actor changed');
    },
    visit: async () => {
      visits++;
    },
  }).catch((e) => e);
  await atStart;
  current = false;
  release();
  expect((await running).message).toBe('actor changed');
  expect(visits).toBe(0);
  expect(f.calls).toHaveLength(1);
});
it('abort after a visitor suspends cannot advance into a child or return a proof', async () => {
  const f = await inventoryFixture(),
    abort = new AbortController();
  let release, started;
  const atStart = new Promise((r) => {
      started = r;
    }),
    held = new Promise((r) => {
      release = r;
    });
  const running = scan(f.id, f.scanApi, {
    ...options,
    signal: abort.signal,
    visit: async () => {
      started();
      await held;
    },
  }).catch((e) => e);
  await atStart;
  const calls = f.calls.length;
  abort.abort();
  release();
  expect((await running).name).toBe('AbortError');
  expect(f.calls).toHaveLength(calls);
});
it('visitor failure propagates instead of creating an empty successful inventory', async () => {
  const f = await inventoryFixture(),
    failure = Error('destination failed');
  await expect(
    scan(f.id, f.scanApi, {
      ...options,
      visit: async () => {
        throw failure;
      },
    }),
  ).rejects.toBe(failure);
  expect(f.calls).toHaveLength(2);
});
it('host proof validates counters and does not run a capture visitor during verification', async () => {
  const f = await inventoryFixture(),
    proof = await scan(f.id, f.scanApi, options),
    before = f.calls.length;
  await expect(
    verify({ ...proof, counts: { ...proof.counts, resources: -1 } }, f.scanApi, options),
  ).rejects.toBeInstanceOf(AdventureInventoryError);
  expect(f.calls).toHaveLength(before);
  await verify(proof, f.scanApi, {
    ...options,
    visit: async () => {
      throw Error('must not write');
    },
  });
});

it('refuses a root change in the final universe visitor before returning any proof', async () => {
  const f = await inventoryFixture();
  await expect(
    scan(f.id, f.scanApi, {
      ...options,
      visit: async (scope) => {
        if (scope.family === 'universe')
          await f.db.runTransaction((tx) =>
            tx.update(f.db.doc(f.path), { title: 'PRIVATE_LATE_TITLE' }),
          );
      },
    }),
  ).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(f.calls.at(-1).method).toBe('getAdventureBackupSource');
});
it('rejects a duplicate across page boundaries, even if the counts would stay equal', async () => {
  const f = await inventoryFixture(53);
  let firstId;
  f.intercept(async (method, input, run) => {
    const value = await run();
    if (method === 'listAdventureBackupResources' && input.kind === 'scene') {
      if (input.cursor === null) firstId = value.items[0].id;
      else value.items[0].id = firstId;
    }
    return value;
  });
  await expect(scan(f.id, f.scanApi, options)).rejects.toBeInstanceOf(AdventureInventoryError);
});
it('requires an explicit optional absence slot instead of silently accepting an empty singleton', async () => {
  const f = await inventoryFixture();
  f.intercept(async (method, input, run) => {
    const value = await run();
    return method === 'listAdventureBackupResources' && input.kind === 'scene-planning'
      ? { ...value, items: [] }
      : value;
  });
  await expect(scan(f.id, f.scanApi, options)).rejects.toBeInstanceOf(AdventureInventoryError);
});
it('compares portable IDs by UTF-8 byte order, including astral characters', async () => {
  const f = await inventoryFixture();
  f.intercept(async (method, _input, run) => {
    const value = await run();
    if (method === 'listAdventureBackupStructure')
      return {
        ...value,
        items: [
          { ...value.items[0], id: '\ue000' },
          { ...value.items[0], id: '😀' },
        ],
      };
    return value;
  });
  const proof = await scan(f.id, f.scanApi, options);
  expect(proof.counts.structure).toBe(2);
  await verify(proof, f.scanApi, options);
});
it('source I/O failure yields no proof and a fresh explicit attempt can succeed', async () => {
  const f = await inventoryFixture(),
    failure = Error('transient read failure');
  f.intercept(async (method, _input, run) => {
    if (method === 'listAdventureBackupStructure') throw failure;
    return run();
  });
  await expect(scan(f.id, f.scanApi, options)).rejects.toBe(failure);
  f.intercept(null);
  const proof = await scan(f.id, f.scanApi, options);
  await verify(proof, f.scanApi, options);
});

it('walks an adventure activated by the native importer with children older than the root', async () => {
  const { adventureImportDb } =
    await import('../../../../functions/test/helpers/adventureImportDb.mjs');
  const { activateBackupImportedAdventure } =
    await import('../../../../functions/test/helpers/adventureBackupImportFixture.mjs');
  const { inventoryReadHarness } = await import('./adventureInventoryFixture.mjs');
  const f = adventureImportDb({ nativeUpdates: true }),
    imported = await activateBackupImportedAdventure(f.db);
  const api = inventoryReadHarness(f).scanApi;
  const proof = await scan(imported.adventureId, api, options);
  expect(proof.counts.structure).toBe(1);
  expect(proof.counts.personas).toBe(2);
  expect(proof.counts.images).toBe(1);
  await verify(proof, api, options);
});

it('refuses an absent required body instead of treating it as optional metadata', async () => {
  const f = await inventoryFixture();
  f.intercept(async (method, input, run) => {
    const value = await run();
    return method === 'listAdventureBackupResources' && input.kind === 'scene-body'
      ? { ...value, items: value.items.map((item) => ({ ...item, present: false })) }
      : value;
  });
  await expect(scan(f.id, f.scanApi, options)).rejects.toBeInstanceOf(AdventureInventoryError);
});
