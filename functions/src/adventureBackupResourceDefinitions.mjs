export const ADVENTURE_RESOURCE_DEFINITIONS = Object.freeze(
  Object.fromEntries(
    Object.entries({
      progress: { path: 'workProgress', singleton: 'current', control: true, optional: true },
      checklist: { path: 'workChecklist', control: true },
      arc: { path: 'arcs', owner: true, nativeKind: 'arc' },
      event: { path: 'timelineEvents', owner: true, nativeKind: 'event' },
      milestone: { path: 'milestones', parent: 'arcs', owner: true, nativeKind: 'milestone' },
      'arc-order': {
        path: 'narrativeControls',
        singleton: true,
        sequence: 'arc',
        control: true,
        optional: true,
      },
      'event-order': {
        path: 'narrativeControls',
        singleton: true,
        sequence: 'event',
        control: true,
        optional: true,
      },
      'milestone-order': {
        path: 'narrativeControls',
        parent: 'arcs',
        rootCollection: true,
        singleton: true,
        sequence: 'milestone',
        control: true,
        optional: true,
      },
      'narrative-link': { path: 'narrativeLinks', narrativeSource: true },
      'part-control': { path: 'parts', control: true },
      'scene-control': {
        path: 'sceneControls',
        singleton: 'unassigned',
        control: true,
        optional: true,
      },
      scene: { path: 'scenes', owner: true },
      'scene-body': { path: 'body', parent: 'scenes', singleton: 'current', body: true },
      'scene-planning': {
        path: 'planning',
        parent: 'scenes',
        singleton: 'current',
        optional: true,
      },
      'scene-reference': { path: 'references', parent: 'scenes' },
      block: { path: 'sceneBlocks', owner: true, scene: true },
      'block-body': { path: 'body', parent: 'sceneBlocks', singleton: 'current', body: true },
    }).map(([key, value]) => [key, Object.freeze(value)]),
  ),
);
export const ADVENTURE_RESOURCE_KINDS = Object.freeze(Object.keys(ADVENTURE_RESOURCE_DEFINITIONS));
