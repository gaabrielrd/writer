import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
  REQUIRED_COMPONENTS,
  REQUIRED_THEME_TOKENS,
  checkStyleguide,
} from './check-styleguide.mjs';

function write(root, file, content) {
  const path = join(root, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function project() {
  const root = mkdtempSync(join(tmpdir(), 'web-styleguide-'));
  const declarations = REQUIRED_THEME_TOKENS.map((token) => `  ${token}: initial;`).join('\n');
  write(root, 'src/styles/globals.css', `:root {\n${declarations}\n}\n`);
  write(root, 'src/main.tsx', "import './styles/globals.css';\n");
  write(
    root,
    'package.json',
    JSON.stringify({
      dependencies: { 'lucide-react': '^1.0.0' },
    }),
  );
  write(
    root,
    'src/shared/ui/index.ts',
    REQUIRED_COMPONENTS.map((name) => `export { ${name} } from './${name}';`).join('\n'),
  );
  return root;
}

test('aceita um projeto que segue o styleguide', () => {
  const root = project();
  try {
    write(root, 'src/app/App.tsx', "import { Home } from 'lucide-react';\n");
    assert.deepEqual(checkStyleguide(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('avisa quando falta um token obrigatório', () => {
  const root = project();
  try {
    write(root, 'src/styles/globals.css', ':root {\n  --background: initial;\n}\n');
    const warnings = checkStyleguide(root);
    assert.match(warnings.join('\n'), /token obrigatório "--primary"/);
    assert.doesNotMatch(warnings.join('\n'), /token obrigatório "--background"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('avisa sobre outra biblioteca de ícones e sobre a ausência da padrão', () => {
  const root = project();
  try {
    write(root, 'package.json', JSON.stringify({ dependencies: { 'react-icons': '^5.0.0' } }));
    write(root, 'src/app/App.tsx', "import { FaHome } from 'react-icons/fa';\n");
    const warnings = checkStyleguide(root).join('\n');
    assert.match(warnings, /"lucide-react" deve estar em dependencies/);
    assert.match(warnings, /"react-icons" concorre/);
    assert.match(warnings, /App\.tsx: importe ícones de "lucide-react"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('avisa quando globals.css some e quando main.tsx não importa o css global', () => {
  const root = project();
  try {
    rmSync(join(root, 'src/styles/globals.css'));
    write(root, 'src/main.tsx', 'export {};\n');
    const warnings = checkStyleguide(root).join('\n');
    assert.match(warnings, /folha de estilos global ausente/);
    assert.match(warnings, /importe "\.\/styles\/globals\.css"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('avisa quando o kit base perde um componente', () => {
  const root = project();
  try {
    write(root, 'src/shared/ui/index.ts', "export { Button } from './Button';\n");
    const warnings = checkStyleguide(root).join('\n');
    assert.match(warnings, /o kit base perdeu o componente "Table"/);
    assert.doesNotMatch(warnings, /o kit base perdeu o componente "Button"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
