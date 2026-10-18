import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkArchitecture } from './check-architecture.mjs';

function withProject(files, assertion) {
  const root = mkdtempSync(join(tmpdir(), 'web-architecture-'));
  try {
    for (const [path, content] of Object.entries(files)) {
      const file = join(root, 'src', path);
      mkdirSync(join(file, '..'), { recursive: true });
      writeFileSync(file, content);
    }
    assertion(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('aceita consumo pela interface pública da feature', () => {
  withProject(
    { 'app/App.tsx': "import { Notes } from '@/features/notes';", 'features/notes/index.ts': '' },
    (root) => assert.deepEqual(checkArchitecture(root), []),
  );
});

test('rejeita import interno entre features', () => {
  withProject(
    { 'features/search/index.ts': "export { parse } from '@/features/notes/model/note';" },
    (root) => assert.equal(checkArchitecture(root).length, 1),
  );
});

test('rejeita dependência de domínio dentro de shared', () => {
  withProject({ 'shared/lib/format.ts': "import type { Note } from '@/features/notes';" }, (root) =>
    assert.equal(checkArchitecture(root).length, 1),
  );
});

test('rejeita import dinâmico de arquivo interno de outra feature', () => {
  withProject(
    {
      'features/search/index.ts': "const notes = import('@/features/notes/services/noteStorage');",
    },
    (root) => assert.equal(checkArchitecture(root).length, 1),
  );
});

test('rejeita fetch fora de uma fronteira de serviço', () => {
  withProject(
    { 'features/search/components/Search.tsx': "export const load = () => fetch('/api');" },
    (root) =>
      assert.match(checkArchitecture(root).join('\n'), /fetch.*services, adapters ou repositories/),
  );
});

test('rejeita localStorage fora de uma fronteira de persistência', () => {
  withProject(
    {
      'features/notes/components/Notes.tsx': "export const load = () => localStorage.getItem('x');",
    },
    (root) => assert.match(checkArchitecture(root).join('\n'), /localStorage.*services/),
  );
});

test('rejeita import.meta.env fora do módulo de configuração', () => {
  withProject(
    { 'features/search/services/search.ts': 'export const url = import.meta.env.VITE_API_URL;' },
    (root) => assert.match(checkArchitecture(root).join('\n'), /import\.meta\.env.*shared\/config/),
  );
});

test('aceita APIs de fronteira nos caminhos permitidos', () => {
  withProject(
    {
      'features/search/services/search.ts': "export const load = () => fetch('/api');",
      'features/notes/repositories/notes.ts':
        "export const load = () => window.localStorage.getItem('notes');",
      'shared/config/env.ts': 'export const raw = import.meta.env;',
    },
    (root) => assert.deepEqual(checkArchitecture(root), []),
  );
});

test('ignora comentários, strings e arquivos de teste', () => {
  withProject(
    {
      'features/search/components/Search.tsx':
        "// fetch('/api')\nexport const text = 'localStorage import.meta.env';",
      'features/search/tests/Search.test.ts':
        'export const load = () => fetch(String(import.meta.env.VITE_API_URL)); localStorage.clear();',
    },
    (root) => assert.deepEqual(checkArchitecture(root), []),
  );
});

for (const statement of [
  "import type { Campaign } from '@/features/campaigns';",
  "export { close } from '@/features/campaign-lore';",
  "const close = import('@/features/campaign-bases');",
]) {
  test(`mantém exclusão como folha: ${statement}`, () => {
    withProject({ 'features/campaign-deletions/index.ts': statement }, (root) =>
      assert.match(checkArchitecture(root).join('\n'), /deve permanecer folha/),
    );
  });
}

test('compõe exclusão somente em campaigns e preserva neutralidade de shared', () => {
  withProject(
    {
      'features/campaign-deletions/index.ts': "import { useAuth } from '@/features/auth';",
      'features/campaigns/index.ts': "export { Deletion } from '@/features/campaign-deletions';",
      'features/studio/index.ts': "import { Deletion } from '@/features/campaigns';",
    },
    (root) => assert.deepEqual(checkArchitecture(root), []),
  );
  withProject(
    { 'features/studio/index.ts': "const panel = import('@/features/campaign-deletions');" },
    (root) => assert.match(checkArchitecture(root).join('\n'), /somente campaigns/),
  );
  withProject(
    { 'shared/services/pulse.ts': "import type { Proof } from '@/features/campaign-deletions';" },
    (root) => assert.match(checkArchitecture(root).join('\n'), /shared não pode importar/),
  );
});

test('sessões permanecem folha e são compostas somente em campaigns', () => {
  withProject(
    {
      'features/campaign-sessions/index.ts': "import { useAuth } from '@/features/auth';",
      'features/campaigns/index.ts': "export { Panel } from '@/features/campaign-sessions';",
    },
    (root) => assert.deepEqual(checkArchitecture(root), []),
  );
  for (const statement of [
    "import type { Campaign } from '@/features/campaigns';",
    "export { close } from '@/features/campaign-deletions';",
    "const lore = import('@/features/campaign-lore');",
  ])
    withProject({ 'features/campaign-sessions/index.ts': statement }, (root) =>
      assert.match(checkArchitecture(root).join('\n'), /campaign-sessions deve permanecer folha/),
    );
  withProject(
    { 'features/studio/index.ts': "const panel = import('@/features/campaign-sessions');" },
    (root) => assert.match(checkArchitecture(root).join('\n'), /somente campaigns/),
  );
});

test('referências usam lore público e são compostas somente em campaigns', () => {
  withProject(
    {
      'features/campaign-session-references/index.ts':
        "import { useAuth } from '@/features/auth'; export { View } from '@/features/campaign-lore';",
      'features/campaigns/index.ts':
        "export { Panel } from '@/features/campaign-session-references';",
    },
    (root) => assert.deepEqual(checkArchitecture(root), []),
  );
  for (const statement of [
    "import type { Session } from '@/features/campaign-sessions';",
    "export { close } from '@/features/campaign-deletions';",
    "const base = import('@/features/campaign-bases');",
    "import type { Campaign } from '@/features/campaigns';",
  ])
    withProject({ 'features/campaign-session-references/index.ts': statement }, (root) =>
      assert.match(checkArchitecture(root).join('\n'), /campaign-session-references usa somente/),
    );
  withProject(
    {
      'features/campaign-session-references/index.ts':
        "export { View } from '@/features/campaign-lore/components/View';",
    },
    (root) => assert.match(checkArchitecture(root).join('\n'), /apenas por sua interface pública/),
  );
  for (const feature of ['studio', 'campaign-lore', 'campaign-sessions'])
    withProject(
      {
        [`features/${feature}/index.ts`]:
          "const panel = import('@/features/campaign-session-references');",
      },
      (root) => assert.notDeepEqual(checkArchitecture(root), []),
    );
});
