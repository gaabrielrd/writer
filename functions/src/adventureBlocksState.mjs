import { workFail } from './workProgressContracts.mjs';
export const adventureBlockTypes = [
  'introduction',
  'preparation',
  'scene',
  'location',
  'quest',
  'clue',
  'ending',
];
export const adventureBlockAudiences = ['creator', 'gm', 'players'];
export function blockInteger(value, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum)
    workFail('failed-precondition', 'O agregado dos blocos precisa de verificação.');
  return value;
}
export function adventureBlockState(scene, { repair = false } = {}) {
  const marked = scene.hasBlocks === true,
    main = blockInteger(marked ? scene.mainWordCount : (scene.mainWordCount ?? scene.wordCount)),
    total = blockInteger(scene.wordCount),
    structure = blockInteger(scene.blocksStructureRevision ?? (marked ? undefined : 0)),
    nextOrder = blockInteger(scene.nextBlockOrder ?? (marked ? undefined : 1), 1),
    mainOrder = blockInteger(scene.mainBlockOrder ?? 0);
  let extra = 0,
    count = 0;
  if (!repair) {
    extra = blockInteger(scene.blockWordCount ?? (marked ? undefined : 0));
    count = blockInteger(scene.blockCount ?? (marked ? undefined : 0));
    if (total !== main + extra || !Number.isSafeInteger(main + extra))
      workFail('failed-precondition', 'O agregado dos blocos precisa de verificação.');
  }
  return { main, extra, count, total, structure, nextOrder, mainOrder };
}
export function adventureBlockExtra(target, scene) {
  if (target.kind !== 'adventure' || !scene) return 0;
  if (!scene.hasBlocks && scene.blockWordCount === undefined && scene.blockCount === undefined)
    return 0;
  return adventureBlockState(scene).extra;
}
export function adventureBlockCountStatus(scene) {
  const sceneRevision = blockInteger(scene.revision),
    structureRevision = blockInteger(
      scene.blocksStructureRevision ?? (scene.hasBlocks ? undefined : 0),
    ),
    mainBodyHash = scene.bodyHash;
  if (typeof mainBodyHash !== 'string' || !/^[a-f0-9]{64}$/.test(mainBodyHash))
    workFail('failed-precondition', 'Não foi possível verificar a identidade do texto principal.');
  let state = null,
    repairable = true;
  try {
    state = adventureBlockState(scene);
  } catch (cause) {
    if (cause.code !== 'failed-precondition') throw cause;
  }
  if (!state) {
    try {
      adventureBlockState(scene, { repair: true });
    } catch (cause) {
      if (cause.code !== 'failed-precondition') throw cause;
      repairable = false;
    }
  }
  return {
    sceneRevision,
    mainBodyHash,
    structureRevision,
    sceneWordCount: state?.total ?? null,
    needsVerification: !state,
    repairable,
  };
}
export function adventureSceneFields(scene) {
  const state = adventureBlockState(scene);
  return {
    mainWordCount: state.main,
    blockWordCount: state.extra,
    blockCount: state.count,
    blocksStructureRevision: state.structure,
    nextBlockOrder: state.nextOrder,
    mainBlockOrder: state.mainOrder,
    mainBlockTitle: scene.mainBlockTitle ?? 'Texto principal',
    mainBlockType: scene.mainBlockType ?? 'scene',
    mainBlockAudience: scene.mainBlockAudience ?? 'creator',
  };
}
