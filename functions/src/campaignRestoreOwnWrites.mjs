import { OWN_TARGET_FIELDS } from './campaignRestoreOwnFormat.mjs';
import { createCampaignRestoreNativeWrites } from './campaignRestoreNativeWrites.mjs';
export { NATIVE_WRITE_FIELDS as OWN_WRITE_FIELDS } from './campaignRestoreNativeWrites.mjs';
export function createCampaignRestoreOwnWrites(store) {
  return createCampaignRestoreNativeWrites(store, {
    journalCollection: 'ownWrites',
    controlField: 'ownMaterialization',
    action: 'materialize-own',
    targetRoot: (l) => 'campaigns/' + l.job.campaignId,
    targetFields: OWN_TARGET_FIELDS,
  });
}
