import test from 'node:test';
import assert from 'node:assert/strict';
import { createSectorServices } from '../src/domainServices.mjs';
import { FUNCTION_DOMAINS } from '../src/functionDomains.mjs';
import { createGenerationService } from '../src/generation.mjs';
import { BOOK_RESTORE_METHODS } from '../src/bookRestoreUploadContracts.mjs';
import { ADVENTURE_RESTORE_METHODS } from '../src/adventureRestoreCallable.mjs';
import { ADVENTURE_BACKUP_METHODS } from '../src/adventureBackupCallable.mjs';
import { ADVENTURE_DELETION_METHODS } from '../src/adventureDeletionCallable.mjs';
import { BOOK_PUBLICATION_METHODS } from '../src/bookLorePublication.mjs';
import { BOOK_LORE_RECOVERY_METHODS } from '../src/bookLoreWriteRecovery.mjs';
import { workFixture } from './workProgressFixtures.mjs';

test('every registered action belongs to a real sector service or its explicit specialized port', () => {
  const { db } = workFixture(),
    assets = {},
    services = createSectorServices({
      db,
      assets,
      backupStorage: {},
      loreGenerator: () => {},
      assistedGenerator: () => {},
      assistedCost: { value: () => 1 },
      coverCost: { value: () => 1 },
      generationFactory: () =>
        createGenerationService({
          db,
          assets,
          generator: () => {},
          costs: { synopsis: 1, cover: 1 },
        }),
    }),
    specialized = new Set([
      ...BOOK_RESTORE_METHODS,
      ...ADVENTURE_RESTORE_METHODS,
      ...ADVENTURE_BACKUP_METHODS,
      ...ADVENTURE_DELETION_METHODS,
      ...BOOK_PUBLICATION_METHODS,
      ...BOOK_LORE_RECOVERY_METHODS,
      'bookLoreEdit',
      'bookLoreEditOutcome',
      'bookLoreRemoval',
    ]);
  const missing = [];
  for (const [domain, definition] of Object.entries(FUNCTION_DOMAINS)) {
    if (definition.sourceFactory === 'universeLoreImportCallable') continue;
    const handlers = [...services(domain)];
    for (const [action, method] of Object.entries(definition.actions))
      if (
        !specialized.has(method) &&
        !handlers.some(
          (handler) => Object.hasOwn(handler, method) && typeof handler[method] === 'function',
        )
      )
        missing.push(domain + ':' + action);
  }
  assert.deepEqual(missing, []);
});
