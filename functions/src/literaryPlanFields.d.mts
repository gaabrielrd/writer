export const LITERARY_PLAN_SCHEMA: Readonly<
  Record<
    | 'bookOverview'
    | 'actTreatment'
    | 'chapterBrief'
    | 'scenePreparation'
    | 'localWorldbuilding'
    | 'knowledgeState'
    | 'planting'
    | 'seriesBridge',
    { label: string; fields: Record<string, string> }
  >
>;
export const LITERARY_REFERENCE_KINDS: readonly [
  'act',
  'chapter',
  'scene',
  'arc',
  'event',
  'localLore',
  'globalLore',
  'volumeUnit',
];
