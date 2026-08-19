#!/usr/bin/env node
// Verifica a integridade das skills e se as cópias geradas estão sincronizadas.
//
// Executado dentro de `npm run validate`. Sai com código != 0 em caso de erro.
// Uso: `npm run check:skills` (ou `node scripts/check-skills.mjs`).
//
// Regras verificadas:
//  1. Cada skill em `skills/` possui um `SKILL.md`.
//  2. O frontmatter YAML tem `name` e `description` não vazios.
//  3. O `name` do frontmatter bate com o nome da pasta.
//  4. As cópias em `.claude/skills` e `.agents/skills` existem e são
//     idênticas (mesmo conjunto de arquivos e conteúdo byte a byte).
//
// Compatível com macOS, Linux e Windows: apenas APIs nativas do Node.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');

const sourceDir = join(projectRoot, 'skills');
const destinations = [
  join(projectRoot, '.claude', 'skills'),
  join(projectRoot, '.agents', 'skills'),
];

/** @type {string[]} */
const errors = [];

function listSkillDirs(dir) {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * Lista, recursivamente, os caminhos de arquivo relativos a `dir`.
 * Usa separadores "/" normalizados para comparar entre plataformas.
 * @returns {string[]} caminhos relativos ordenados.
 */
function listFilesRecursive(dir) {
  /** @type {string[]} */
  const files = [];
  function walk(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        files.push(relative(dir, full).split(sep).join('/'));
      }
    }
  }
  if (existsSync(dir)) {
    walk(dir);
  }
  return files.sort();
}

/**
 * Parser mínimo de frontmatter YAML: lê os pares chave: valor entre as
 * duas primeiras linhas `---`. Sem libs externas. Suporta apenas o
 * formato simples `chave: valor` usado nos SKILL.md.
 * @returns {Record<string, string> | null}
 */
function parseFrontmatter(content) {
  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  if (lines[0]?.trim() !== '---') {
    return null;
  }
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) {
    return null;
  }

  /** @type {Record<string, string>} */
  const data = {};
  for (let i = 1; i < end; i += 1) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith('#')) {
      continue;
    }
    const idx = line.indexOf(':');
    if (idx === -1) {
      continue;
    }
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    // Remove aspas simples/duplas envolventes, se houver.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) {
      data[key] = value;
    }
  }
  return data;
}

function validateMetadata(skill) {
  const skillMd = join(sourceDir, skill, 'SKILL.md');
  if (!existsSync(skillMd) || !statSync(skillMd).isFile()) {
    errors.push(`Skill "${skill}": arquivo SKILL.md ausente.`);
    return;
  }

  const content = readFileSync(skillMd, 'utf8');
  const meta = parseFrontmatter(content);
  if (!meta) {
    errors.push(
      `Skill "${skill}": frontmatter YAML ausente ou malformado em SKILL.md (esperado bloco entre linhas "---").`,
    );
    return;
  }

  if (!meta.name) {
    errors.push(`Skill "${skill}": campo "name" ausente ou vazio no frontmatter.`);
  } else if (meta.name !== skill) {
    errors.push(
      `Skill "${skill}": campo "name" ("${meta.name}") difere do nome da pasta ("${skill}").`,
    );
  }

  if (!meta.description) {
    errors.push(`Skill "${skill}": campo "description" ausente ou vazio no frontmatter.`);
  }
}

function compareCopies(skills) {
  const sourceFilesBySkill = new Map(
    skills.map((skill) => [skill, listFilesRecursive(join(sourceDir, skill))]),
  );

  for (const destRoot of destinations) {
    if (!existsSync(destRoot)) {
      errors.push(`Copia ausente: "${destRoot}" nao existe. Rode "npm run sync:skills".`);
      continue;
    }

    // Conjunto de skills deve ser o mesmo.
    const destSkills = listSkillDirs(destRoot);
    const missing = skills.filter((s) => !destSkills.includes(s));
    const extra = destSkills.filter((s) => !skills.includes(s));
    if (missing.length > 0) {
      errors.push(
        `"${destRoot}": skill(s) faltando: ${missing.join(', ')}. Rode "npm run sync:skills".`,
      );
    }
    if (extra.length > 0) {
      errors.push(
        `"${destRoot}": skill(s) extra(s) nao presentes na fonte: ${extra.join(', ')}. Rode "npm run sync:skills".`,
      );
    }

    // Comparação arquivo a arquivo (conjunto + conteúdo byte a byte).
    for (const skill of skills) {
      const srcFiles = sourceFilesBySkill.get(skill) ?? [];
      const destFiles = listFilesRecursive(join(destRoot, skill));

      const srcSet = new Set(srcFiles);
      const destSet = new Set(destFiles);

      for (const file of srcFiles) {
        if (!destSet.has(file)) {
          errors.push(
            `"${destRoot}/${skill}": arquivo faltando na copia: ${file}. Rode "npm run sync:skills".`,
          );
          continue;
        }
        const srcContent = readFileSync(join(sourceDir, skill, file));
        const destContent = readFileSync(join(destRoot, skill, file));
        if (!srcContent.equals(destContent)) {
          errors.push(
            `"${destRoot}/${skill}": conteudo divergente em ${file}. Rode "npm run sync:skills".`,
          );
        }
      }

      for (const file of destFiles) {
        if (!srcSet.has(file)) {
          errors.push(
            `"${destRoot}/${skill}": arquivo extra na copia (nao existe na fonte): ${file}. Rode "npm run sync:skills".`,
          );
        }
      }
    }
  }
}

function main() {
  const skills = listSkillDirs(sourceDir);

  if (skills.length === 0) {
    console.error(`Nenhuma skill encontrada em "${sourceDir}".`);
    process.exit(1);
  }

  for (const skill of skills) {
    validateMetadata(skill);
  }

  compareCopies(skills);

  if (errors.length > 0) {
    console.error('Verificacao de skills FALHOU:\n');
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    console.error(`\nTotal de problemas: ${errors.length}. Corrija ou rode "npm run sync:skills".`);
    process.exit(1);
  }

  console.log(`Verificacao de skills OK: ${skills.length} skill(s) validada(s) e sincronizada(s).`);
  for (const skill of skills) {
    console.log(`  - ${skill}`);
  }
  process.exit(0);
}

main();
