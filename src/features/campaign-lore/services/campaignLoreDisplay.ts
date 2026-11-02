import type { CampaignLoreEntityView } from '../model/campaignLore';
import type { CampaignLorePickerItem } from '../model/campaignLoreDisplay';
import { validateEntity } from './campaignLoreService';
function closed(value: unknown, keys: string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    throw new Error('A ficha projetada não pôde ser validada.');
}
export function validateCampaignLoreDisplayEntity(
  entity: CampaignLoreEntityView,
  sourceKey: string,
): void {
  closed(entity, [
    'name',
    'aliases',
    'category',
    'summary',
    'details',
    'structuredDetails',
    'relations',
  ]);
  closed(entity.structuredDetails, ['appearance', 'personality', 'history', 'notes']);
  validateEntity(entity, sourceKey, true);
  entity.relations.forEach((relation) =>
    closed(relation, ['targetKey', 'relationType', 'description', 'targetName']),
  );
  if (new TextEncoder().encode(JSON.stringify(entity)).byteLength > 4 * 1024 * 1024)
    throw new Error('A ficha ultrapassa o orçamento de leitura.');
}
export function validateCampaignLorePickerItem(item: CampaignLorePickerItem): void {
  closed(item, ['sourceKey', 'name', 'category', 'revision', 'mode', 'legacy']);
  if (
    !/^[a-f0-9]{64}$/.test(item.sourceKey) ||
    typeof item.name !== 'string' ||
    !item.name.trim() ||
    !['character', 'location', 'concept', 'other'].includes(item.category) ||
    !Number.isSafeInteger(item.revision) ||
    item.revision < 0 ||
    !['base', 'override'].includes(item.mode) ||
    typeof item.legacy !== 'boolean'
  )
    throw new Error('A opção de ficha não pôde ser validada.');
}
