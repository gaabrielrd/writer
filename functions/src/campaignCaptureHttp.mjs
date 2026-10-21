// CallableRequest.rawRequest is the Express request used by Firebase's onCall wrapper.
export function setCampaignMediaHeaders(method, request) {
  if (
    [
      'readCampaignBaseImage',
      'readCampaignComparisonImage',
      'readCampaignSessionSceneImage',
    ].includes(method)
  )
    request.rawRequest.res.setHeader('Cache-Control', 'private, no-store');
}
