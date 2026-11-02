import { createAdventureBackupReadService } from './adventureBackupRead.mjs';
import { createAdventureBackupResourceService } from './adventureBackupResourceRead.mjs';
import { createAdventureBackupLoreService } from './adventureBackupLoreRead.mjs';
import { createAdventureBackupPersonaService } from './adventureBackupPersonaRead.mjs';
import { createAdventureBackupHistoryService } from './adventureBackupHistoryRead.mjs';
import { createAdventureBackupImageService } from './adventureBackupImageRead.mjs';
import { createAdventureBackupUniverseService } from './adventureBackupUniverseRead.mjs';
/** Own read-only composition. Storage must provide the bounded generation-aware backup port. */
export function createAdventureBackupService({ db, assets }) {
  return Object.freeze({
    ...createAdventureBackupReadService({ db }),
    ...createAdventureBackupResourceService({ db }),
    ...createAdventureBackupLoreService({ db }),
    ...createAdventureBackupPersonaService({ db }),
    ...createAdventureBackupHistoryService({ db }),
    ...createAdventureBackupImageService({ db, assets }),
    ...createAdventureBackupUniverseService({ db }),
  });
}
