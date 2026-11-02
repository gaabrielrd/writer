import { createUniverseService } from './universes.mjs';
import { createStudioService } from './studio.mjs';
import { createAdventureImportService } from './adventureImport.mjs';
import { createAdventureLoreService } from './adventureLore.mjs';
import { createCampaignsService } from './campaigns.mjs';
import { createCampaignNotesService } from './campaignNotes.mjs';
import { createCampaignPreparationService } from './campaignPreparation.mjs';
import { createCampaignSessionsService } from './campaignSessions.mjs';
import { createCampaignSessionReferencesService } from './campaignSessionReferences.mjs';
import { createCampaignSessionScenesService } from './campaignSessionScenes.mjs';
import { createCampaignLoreService } from './campaignLore.mjs';
import { createCampaignComparisonService } from './campaignComparison.mjs';
import { createCampaignComparisonReadService } from './campaignComparisonRead.mjs';
import { createCampaignAdoptionService } from './campaignAdoption.mjs';
import { createCampaignDeletionService } from './campaignDeletion.mjs';
import { createCampaignVariantRemoteRecoveryService } from './campaignVariantRemoteRecovery.mjs';
import { createCampaignVariantRecoveryService } from './campaignVariantRecovery.mjs';
import { createCampaignCaptureService } from './campaignCapture.mjs';
import { createCampaignBaseReadService } from './campaignBaseRead.mjs';
import { createWorkProgressService } from './workProgress.mjs';
import { createWorkHistoryService } from './workHistory.mjs';
import { createBookBackupReadService } from './bookBackupRead.mjs';
import { createBookLoreReadService } from './bookLoreRead.mjs';
import { createBookBackupResourceService } from './bookBackupResourceRead.mjs';
import { createBookBackupPersonaService } from './bookBackupPersonaRead.mjs';
import { createBookBackupUniverseService } from './bookBackupUniverseRead.mjs';
import { createBookBackupDraftService } from './bookBackupDraftRead.mjs';
import { createBookBackupCoverService } from './bookBackupCoverRead.mjs';
import { createAdventureBlocksService } from './adventureBlocks.mjs';
import { createAdventurePreviewService } from './adventurePreview.mjs';
import { createScenesService } from './scenes.mjs';
import { createNarrativePlanningService } from './narrativePlanning.mjs';
import { createLoreAnalysisService } from './loreAnalysis.mjs';
import { createAssistedBookService } from './assistedBook.mjs';
import { createImageLibraryService } from './imageLibrary.mjs';

export const DOMAIN_SERVICES = {
  booksApi: ['studio', 'workProgress', 'generation'],
  workApi: ['workHistory', 'workProgress'],
  loreApi: ['bookLoreRead', 'universeService', 'loreAnalysis'],
  planningApi: ['narrative', 'scenes'],
  adventuresApi: ['adventureLore', 'adventurePreview', 'adventureBlocks', 'studio'],
  adventurePortabilityApi: ['adventureImport'],
  bookPortabilityApi: [
    'bookBackupCover',
    'bookBackupDraft',
    'bookBackupUniverse',
    'bookBackupPersonas',
    'bookBackupResources',
    'bookBackupRead',
  ],
  campaignsApi: [
    'campaignPreparation',
    'campaignSessionScenes',
    'campaignSessionReferences',
    'campaignSessions',
    'campaignDeletion',
    'campaignLore',
    'campaignVariantRecovery',
    'campaignVariantRemoteRecovery',
    'campaignNotes',
    'campaigns',
    'studio',
  ],
  campaignSyncApi: [
    'campaignAdoption',
    'campaignComparison',
    'campaignComparisonRead',
    'campaignBaseRead',
    'campaignCapture',
    'campaignVariantRemoteRecovery',
  ],
  generationApi: ['assisted', 'generation'],
  mediaApi: ['generation', 'imageLibrary'],
  loreAnalysisApi: ['loreAnalysis'],
};

/** Lazy server composition; only services owned by a sector are constructed. */
export function createSectorServices({
  db,
  assets,
  backupStorage,
  loreGenerator,
  assistedGenerator,
  assistedCost,
  coverCost,
  generationFactory,
}) {
  const SERVICE_FACTORIES = {
    universeService: () => createUniverseService({ db }),
    studio: () => createStudioService({ db }),
    adventureImport: () => createAdventureImportService({ db }),
    adventureLore: () => createAdventureLoreService({ db }),
    campaigns: () => createCampaignsService({ db }),
    campaignNotes: () => createCampaignNotesService({ db }),
    campaignPreparation: () => createCampaignPreparationService({ db }),
    campaignSessions: () => createCampaignSessionsService({ db }),
    campaignSessionReferences: () => createCampaignSessionReferencesService({ db }),
    campaignSessionScenes: () => createCampaignSessionScenesService({ db, assets }),
    campaignLore: () => createCampaignLoreService({ db }),
    campaignComparison: () => createCampaignComparisonService({ db, assets }),
    campaignComparisonRead: () => createCampaignComparisonReadService({ db, assets }),
    campaignAdoption: () => createCampaignAdoptionService({ db }),
    campaignDeletion: () => createCampaignDeletionService({ db }),
    campaignVariantRemoteRecovery: () => createCampaignVariantRemoteRecoveryService({ db }),
    campaignVariantRecovery: () => createCampaignVariantRecoveryService({ db }),
    campaignCapture: () => createCampaignCaptureService({ db, assets }),
    campaignBaseRead: () => createCampaignBaseReadService({ db, assets }),
    workProgress: () => createWorkProgressService({ db }),
    workHistory: () => createWorkHistoryService({ db }),
    bookBackupRead: () => createBookBackupReadService({ db }),
    bookLoreRead: () => createBookLoreReadService({ db }),
    bookBackupResources: () => createBookBackupResourceService({ db }),
    bookBackupPersonas: () => createBookBackupPersonaService({ db }),
    bookBackupUniverse: () => createBookBackupUniverseService({ db }),
    bookBackupDraft: () => createBookBackupDraftService({ db }),
    bookBackupCover: () => createBookBackupCoverService({ db, assets: backupStorage }),
    adventureBlocks: () => createAdventureBlocksService({ db }),
    adventurePreview: () => createAdventurePreviewService({ db, assets }),
    scenes: () => createScenesService({ db }),
    narrative: () => createNarrativePlanningService({ db }),
    loreAnalysis: () => createLoreAnalysisService({ db, generator: loreGenerator }),
    assisted: () =>
      createAssistedBookService({
        db,
        assets,
        generator: assistedGenerator,
        costs: { text: assistedCost.value(), cover: coverCost.value() },
      }),
    generation: () => generationFactory(),
    imageLibrary: () => createImageLibraryService({ db, assets }),
  };
  return function* services(domain) {
    for (const name of DOMAIN_SERVICES[domain] ?? []) yield SERVICE_FACTORIES[name]();
  };
}
