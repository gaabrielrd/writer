import { createCampaignRestoreNativeWrites } from './campaignRestoreNativeWrites.mjs';
import {
  VARIANT_TARGET_FIELDS,
  VARIANT_AUTHORIZATION_CODEC,
  restoredLoreGenerationId,
} from './campaignRestoreVariantFormat.mjs';
import { hash, integer, bad } from './campaignRestoreContracts.mjs';
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
    bindingOptionalFields: ['authorizationCodec'],
    validateBinding(v) {
      if (v.row !== null) integer(v.row);
      hash(v.authorizationHash);
      if (
        Object.hasOwn(v, 'authorizationCodec') &&
        v.authorizationCodec !== VARIANT_AUTHORIZATION_CODEC
      )
        bad();
    },
  });
}
