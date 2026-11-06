import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Explicit ownership: provider-managed platform variants are never generated copies. */
export function externalSkills(projectRoot) {
  const path = join(projectRoot, 'skills', 'external-skills.json');
  if (!existsSync(path)) return new Map();
  const registry = JSON.parse(readFileSync(path, 'utf8'));
  if (registry.version !== 1 || !Array.isArray(registry.skills))
    throw new Error('Registro de skills externas inválido.');
  const result = new Map();
  for (const skill of registry.skills) {
    if (
      !skill ||
      typeof skill.name !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.name) ||
      typeof skill.version !== 'string' ||
      !skill.version.trim() ||
      Object.keys(skill).some((key) => !['name', 'version'].includes(key)) ||
      result.has(skill.name) ||
      existsSync(join(projectRoot, 'skills', skill.name))
    )
      throw new Error('Registro de skills externas inválido ou em conflito com a fonte canônica.');
    result.set(skill.name, skill.version);
  }
  return result;
}
