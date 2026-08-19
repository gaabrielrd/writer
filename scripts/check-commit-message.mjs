#!/usr/bin/env node
// Valida a mensagem de commit contra a convenção descrita em
// docs/development-process.md, sem adicionar dependências ao projeto.
//
// Executado pelo hook `commit-msg` do husky.
// Uso: `node scripts/check-commit-message.mjs .git/COMMIT_EDITMSG`
//
// Regras verificadas:
//  1. A primeira linha segue `tipo(escopo opcional): descrição`.
//  2. O tipo pertence à lista permitida.
//  3. A descrição não é vazia nem começa com letra maiúscula solta.
//  4. A primeira linha tem no máximo 72 caracteres.
//
// Commits gerados pelo git (merge, revert, fixup, squash) são ignorados.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const ALLOWED_TYPES = [
  'feat',
  'fix',
  'docs',
  'test',
  'refactor',
  'chore',
  'perf',
  'build',
  'ci',
  'style',
  'revert',
];

const MAX_SUBJECT_LENGTH = 72;
const SUBJECT_PATTERN = new RegExp(`^(${ALLOWED_TYPES.join('|')})(\\([a-z0-9._/-]+\\))?!?: .+$`);
const GENERATED_PATTERN = /^(merge |revert "|fixup!|squash!|amend!)/i;

/**
 * @param {string} message conteúdo bruto do arquivo de mensagem
 * @returns {string[]} lista de problemas; vazia quando a mensagem é válida
 */
export function checkCommitMessage(message) {
  const lines = message
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .join('\n')
    .trim()
    .split('\n');

  const subject = lines[0]?.trim() ?? '';

  if (!subject) return ['a mensagem de commit está vazia.'];
  if (GENERATED_PATTERN.test(subject)) return [];

  const errors = [];

  if (!SUBJECT_PATTERN.test(subject)) {
    errors.push(
      `primeira linha fora do padrão "tipo: descrição". Recebido: "${subject}".\n` +
        `    Tipos aceitos: ${ALLOWED_TYPES.join(', ')}.\n` +
        '    Exemplo: feat: adiciona filtro de busca na lista de clientes',
    );
  }

  if (subject.length > MAX_SUBJECT_LENGTH) {
    errors.push(
      `primeira linha com ${subject.length} caracteres; o limite é ${MAX_SUBJECT_LENGTH}.` +
        ' Mova os detalhes para o corpo do commit.',
    );
  }

  if (subject.endsWith('.')) {
    errors.push('primeira linha não deve terminar com ponto final.');
  }

  return errors;
}

function main() {
  const file = process.argv[2];

  if (!file) {
    console.error('Uso: node scripts/check-commit-message.mjs <arquivo-da-mensagem>');
    process.exitCode = 1;
    return;
  }

  const errors = checkCommitMessage(readFileSync(file, 'utf8'));

  if (errors.length) {
    console.error('Mensagem de commit FALHOU:\n');
    for (const error of errors) console.error(`  - ${error}`);
    console.error('\nConvenção completa em docs/development-process.md.');
    process.exitCode = 1;
    return;
  }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) main();
