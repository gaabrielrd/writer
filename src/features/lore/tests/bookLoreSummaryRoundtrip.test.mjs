// @vitest-environment node
import { expect, it } from 'vitest';
import { createBookLoreReadClient } from '../services/bookLoreReadClient.ts';
import { createBookLoreReadService } from '../../../../functions/src/bookLoreRead.mjs';
import { adventureImportDb } from '../../../../functions/test/helpers/adventureImportDb.mjs';
import { seedBookLoreGeneration } from '../../../../functions/test/helpers/bookLoreGenerationFixture.mjs';

it('17 real native fiches reach the listing in two RPCs, then details load only on explicit capture', async () => {
  const f = adventureImportDb({ nativeUpdates: true });
  for (let n = 0; n < 17; n++)
    await seedBookLoreGeneration(f.db, {
      id: 'id-' + String(n).padStart(2, '0'),
      noBase: true,
      fields: {
        name: 'Name ' + n,
        category: 'other',
        summary: 'Summary ' + n,
        details: 'Private details ' + n,
        structuredDetails: { notes: 'Private notes' },
      },
    });
  const server = createBookLoreReadService({ db: f.db }),
    calls = [];
  const client = createBookLoreReadClient(
    async (method, input) => {
      calls.push({ method, input });
      return server[method]('author', input);
    },
    () => {},
    { tokenVersion: 2 },
  );
  const rows = await client.listSummaries('book');
  expect(rows).toHaveLength(17);
  expect(rows[0]).toMatchObject({ name: 'Name 0', summary: 'Summary 0', relationCount: 0 });
  expect(
    rows.some((row) => 'details' in row || 'structuredDetails' in row || 'relations' in row),
  ).toBe(false);
  expect(calls.map((call) => call.method)).toEqual(['listBookLoreRead', 'listBookLoreRead']);
  const complete = await client.capture('book', rows[0].id, rows[0].sourceToken);
  expect(complete.data.details).toBe('Private details 0');
  expect(complete.data.structuredDetails).toEqual({ notes: 'Private notes' });
});
