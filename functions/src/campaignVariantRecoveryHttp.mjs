// Set inside the callable callback, before application authentication/dispatch.
export function setCampaignVariantRecoveryHeaders(method, request) {
  if (method === 'prepareCampaignLoreVariant')
    request.rawRequest.res.setHeader('Cache-Control', 'private, no-store');
}
