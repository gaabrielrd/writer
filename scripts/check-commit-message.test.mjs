import assert from 'node:assert/strict';
import test from 'node:test';
import { checkCommitMessage } from './check-commit-message.mjs';

test('aceita mensagens no padrão do projeto', () => {
  assert.deepEqual(checkCommitMessage('feat: adiciona filtro de busca'), []);
  assert.deepEqual(checkCommitMessage('fix(notes): corrige revisão conflitante'), []);
  assert.deepEqual(checkCommitMessage('feat!: remove suporte ao formato antigo'), []);
});

test('ignora comentários e usa o corpo apenas como contexto', () => {
  const message = [
    'docs: documenta as variáveis de ambiente',
    '',
    'Explica o prefixo VITE_ e o arquivo .env.local.',
    '# Please enter the commit message for your changes.',
  ].join('\n');

  assert.deepEqual(checkCommitMessage(message), []);
});

test('rejeita mensagem sem tipo conhecido', () => {
  const errors = checkCommitMessage('atualiza uns arquivos');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /fora do padrão/);
});

test('rejeita tipo inexistente e descrição vazia', () => {
  assert.equal(checkCommitMessage('wip: ').length, 1);
  assert.equal(checkCommitMessage('feat:').length, 1);
});

test('rejeita primeira linha longa demais', () => {
  const errors = checkCommitMessage(`feat: ${'a'.repeat(80)}`);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /limite é 72/);
});

test('rejeita ponto final na primeira linha', () => {
  const errors = checkCommitMessage('chore: ajusta o lint.');
  assert.deepEqual(
    errors.map((error) => error.includes('ponto final')),
    [true],
  );
});

test('rejeita mensagem vazia', () => {
  assert.equal(checkCommitMessage('\n\n# comentário\n').length, 1);
});

test('não interfere em commits gerados pelo git', () => {
  assert.deepEqual(checkCommitMessage("Merge branch 'master' into feat/x"), []);
  assert.deepEqual(checkCommitMessage('fixup! feat: adiciona filtro'), []);
  assert.deepEqual(checkCommitMessage('Revert "feat: adiciona filtro"'), []);
});
