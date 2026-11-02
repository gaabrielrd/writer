import { createCampaignRestoreNativeWrites } from './campaignRestoreNativeWrites.mjs';
import { BASE_TARGET_FIELDS, restoredBaseId } from './campaignRestoreBaseFormat.mjs';
import { hash } from './campaignRestoreContracts.mjs';
export function createCampaignRestoreBaseWrites(store) {
  return createCampaignRestoreNativeWrites(store, {
    journalCollection: 'baseWrites',
    controlField: 'baseMaterialization',
    action: 'materialize-base',
    targetRoot: (l) => 'users/' + l.uid + '/campaignBases/' + restoredBaseId(l),
    targetFields: BASE_TARGET_FIELDS,
    parent: true,
    bindingFields: ['sourceKey'],
    validateBinding: (v) => {
      if (v.sourceKey !== null) hash(v.sourceKey);
    },
  });
}
