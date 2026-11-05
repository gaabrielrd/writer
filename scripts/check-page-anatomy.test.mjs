import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { checkPageAnatomy, countPatterns, measure } from './check-page-anatomy.mjs';

function project(files) {
  const root = mkdtempSync(join(tmpdir(), 'web-page-anatomy-'));
  for (const [file, content] of Object.entries(files)) {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return root;
}

test('conta só botões destrutivos e listas de abas', () => {
  assert.deepEqual(
    countPatterns(`
      <Badge variant="destructive">Erro</Badge>
      <Button onClick={() => remove(id)} variant="danger">Excluir</Button>
      <DropdownItem variant="destructive">Excluir</DropdownItem>
      <div role="tablist" />
    `),
    { tablists: 1, destructiveButtons: 1 },
  );
});

test('aceita o componente Tabs e ignora testes', () => {
  const root = project({
    'src/shared/ui/Tabs.tsx': '<List role="tablist" />',
    'src/features/a/tests/A.test.tsx': '<Button variant="destructive" />',
  });
  try {
    assert.deepEqual(measure(root), {});
    assert.deepEqual(checkPageAnatomy(root, {}), { errors: [], tightened: [] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('barra uso novo e aumento acima da linha de base, e aponta folga para apertar', () => {
  const root = project({
    'src/features/a/A.tsx': '<div role="tablist" /><Button variant="destructive" />',
    'src/features/b/B.tsx': '<Button variant="danger" /><Button variant="danger" />',
    'src/features/c/C.tsx': '<p />',
  });
  try {
    const { errors, tightened } = checkPageAnatomy(root, {
      'src/features/b/B.tsx': { tablists: 0, destructiveButtons: 1 },
      'src/features/c/C.tsx': { tablists: 0, destructiveButtons: 2 },
    });
    assert.equal(errors.length, 3);
    assert.match(errors.join('\n'), /A\.tsx: 1 role="tablist"/);
    assert.match(errors.join('\n'), /B\.tsx: 2 botão/);
    assert.deepEqual(tightened, ['src/features/c/C.tsx']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
