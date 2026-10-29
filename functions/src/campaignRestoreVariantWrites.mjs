import { createCampaignRestoreNativeWrites } from './campaignRestoreNativeWrites.mjs';
import {
  VARIANT_TARGET_FIELDS,
  restoredLoreGenerationId,
} from './campaignRestoreVariantFormat.mjs';
import { hash, integer } from './campaignRestoreContracts.mjs';
export function createCampaignRestoreVariantWrites(store) {
  return createCampaignRestoreNativeWrites(store, {
    journalCollection: 'variantWrites',
    controlField: 'variantMaterialization',
    action: 'materialize-variants',
    targetRoot: (l) =>
      'campaigns/' + l.job.campaignId + '/loreGenerations/' + restoredLoreGenerationId(l),
    targetFields: VARIANT_TARGET_FIELDS,
    parent: true,
    bindingFields: ['row', 'authorizationHash'],
    validateBinding(v) {
      if (v.row !== null) integer(v.row);
      hash(v.authorizationHash);
    },
  });
}
