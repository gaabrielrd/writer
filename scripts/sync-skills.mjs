#!/usr/bin/env node
// Sincroniza as skills canônicas de `skills/` para as cópias geradas
// em `.claude/skills` e `.agents/skills`.
//
// NÃO edite as cópias manualmente: elas são recriadas por este script.
// Uso: `npm run sync:skills` (ou `node scripts/sync-skills.mjs`).
//
// Compatível com macOS, Linux e Windows: usa apenas APIs nativas do Node
// (node:fs, node:path, node:url) — sem comandos de shell.

import { existsSync, mkdirSync, readdirSync, rmSync, cpSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { externalSkills } from './skill-registry.mjs';

// Raiz do projeto: diretório pai de `scripts/`.
const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');

const sourceDir = join(projectRoot, 'skills');
const destinations = [
  join(projectRoot, '.claude', 'skills'),
  join(projectRoot, '.agents', 'skills'),
];

/**
 * Lista os diretórios de skill dentro de `skills/`.
 * Arquivos soltos na raiz de `skills/` são ignorados.
 * @returns {string[]} nomes das pastas de skill.
 */
function listSkillDirs(dir) {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function syncSkills() {
  const skills = listSkillDirs(sourceDir);
  const external = externalSkills(projectRoot);

  if (skills.length === 0) {
    console.error(`Nenhuma skill encontrada em "${sourceDir}". Nada a sincronizar.`);
    return;
  }

  for (const destRoot of destinations) {
    // Preserve registered provider installations, including platform-specific
    // agents and binaries. Everything else remains generated from skills/.
    if (existsSync(destRoot)) {
      const actualRoot = realpathSync(destRoot);
      if (!actualRoot.startsWith(realpathSync(projectRoot) + sep))
        throw new Error('Destino de skills fora do projeto.');
      for (const entry of readdirSync(destRoot)) {
        if (external.has(entry)) continue;
        const target = resolve(actualRoot, entry);
        if (!target.startsWith(actualRoot + sep)) throw new Error('Destino de skill inválido.');
        rmSync(target, { recursive: true, force: true });
      }
    }
    mkdirSync(destRoot, { recursive: true });

    for (const skill of skills) {
      const src = join(sourceDir, skill);
      const dest = join(destRoot, skill);
      cpSync(src, dest, { recursive: true });
    }

    console.log(`Sincronizadas ${skills.length} skill(s) para "${destRoot}":`);
    for (const skill of skills) {
      console.log(`  - ${skill}`);
    }
  }

  console.log('\nSincronizacao concluida com sucesso.');
}

syncSkills();
