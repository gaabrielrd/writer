import { adventureImportDb } from '../../../../functions/test/helpers/adventureImportDb.mjs';
import {
  adoptionFixture,
  adoptFixture,
} from '../../../../functions/test/helpers/bookLoreEditAdoptionFixture.mjs';
import { createBookLoreEditOutcomeService } from '../../../../functions/src/bookLoreEditOutcome.mjs';
export async function nativeEditOutcomeFixture(identity) {
  const d = adventureImportDb({ nativeUpdates: true }),
    f = await adoptionFixture(d.db, {
      editId: identity.editId,
      changes: [{ target: { field: 'isPublic' }, value: false }],
    });
  await adoptFixture(f);
  const service = createBookLoreEditOutcomeService({ db: d.db }),
    before = d.commits.length;
  return {
    input: { ...identity, startHash: f.startHash, sourceToken: f.intent.sourceToken },
    call(method, value) {
      if (method !== 'bookLoreEditOutcome') throw Error('Unexpected production method');
      return service.bookLoreEditOutcome('author', value);
    },
    writes: () => d.commits.slice(before).flat(),
  };
}
