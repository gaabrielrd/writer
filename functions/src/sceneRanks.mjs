import { sceneFail } from './sceneContracts.mjs';

const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const MAX_SCENE_RANK_BYTES = 128;
export function validSceneRank(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_SCENE_RANK_BYTES &&
    /^[0-9A-Za-z]+$/.test(value) &&
    !value.endsWith('0')
  );
}
// Canonical fractional keys never end in the lowest digit, so every open interval
// admits another key until the explicit index budget requires rebalancing.
export function sceneRankBetween(lower = null, upper = null) {
  if (
    (lower !== null && !validSceneRank(lower)) ||
    (upper !== null && !validSceneRank(upper)) ||
    (lower !== null && upper !== null && lower >= upper)
  )
    sceneFail(
      'failed-precondition',
      'Reorganize as posições antes de continuar.',
      'rank-exhausted',
    );
  let prefix = '';
  for (let i = 0; i < MAX_SCENE_RANK_BYTES; i++) {
    const left = lower && i < lower.length ? alphabet.indexOf(lower[i]) : 0;
    const right = upper && i < upper.length ? alphabet.indexOf(upper[i]) : 61;
    if (left === right) {
      prefix += alphabet[left];
      continue;
    }
    if (right - left > 1) return prefix + alphabet[Math.floor((left + right) / 2)];
    prefix += alphabet[left];
    // Once below the upper bound, only the remaining lower suffix constrains us.
    upper = null;
  }
  sceneFail(
    'failed-precondition',
    'As posições precisam ser reorganizadas. O texto foi preservado.',
    'rank-exhausted',
  );
}
// Fixed width base62 index plus a nonzero terminator preserves numeric order.
// 10 digits cover all safe JS integer scene counts without a commercial quota.
export function rebalancedSceneRank(index) {
  if (!Number.isSafeInteger(index) || index < 0)
    sceneFail('failed-precondition', 'Contagem de posições inválida.');
  let value = index,
    result = '';
  do {
    result = alphabet[value % 62] + result;
    value = Math.floor(value / 62);
  } while (value);
  return result.padStart(10, '0') + 'V';
}
