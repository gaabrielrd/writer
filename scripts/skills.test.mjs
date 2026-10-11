import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function project() {
  const root = mkdtempSync(join(tmpdir(), 'writer-skills-'));
  mkdirSync(join(root, 'scripts'));
  for (const script of ['sync-skills.mjs', 'check-skills.mjs']) {
    cpSync(new URL(script, import.meta.url), join(root, 'scripts', script));
  }
  for (const skill of ['plan-feature', 'frontend-skill']) {
    const dir = join(root, 'skills', skill);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${skill}\ndescription: Skill de teste\n---\n`);
  }
  return root;
}

function run(root, script) {
  return spawnSync(process.execPath, [join(root, 'scripts', script)], {
    cwd: root,
    encoding: 'utf8',
  });
}

test('sincronização remove skills excluídas da fonte e não as recria', () => {
  const root = project();
  try {
    assert.equal(run(root, 'sync-skills.mjs').status, 0);
    for (const agent of ['.claude', '.agents']) {
      assert.ok(existsSync(join(root, agent, 'skills', 'frontend-skill', 'SKILL.md')));
    }
    rmSync(join(root, 'skills', 'frontend-skill'), { recursive: true });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const sync = run(root, 'sync-skills.mjs');
      assert.equal(sync.status, 0, sync.stderr);
      for (const agent of ['.claude', '.agents']) {
        assert.equal(existsSync(join(root, agent, 'skills', 'frontend-skill')), false);
        assert.ok(existsSync(join(root, agent, 'skills', 'plan-feature', 'SKILL.md')));
      }
      const check = run(root, 'check-skills.mjs');
      assert.equal(check.status, 0, check.stderr);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('verificação usada pelo validate reporta cópia ausente sem recriá-la', () => {
  const root = project();
  try {
    assert.equal(run(root, 'sync-skills.mjs').status, 0);
    const copy = join(root, '.agents', 'skills', 'frontend-skill');
    rmSync(copy, { recursive: true });

    const check = run(root, 'check-skills.mjs');
    assert.equal(check.status, 1, check.stderr);
    assert.match(check.stderr, /frontend-skill/);
    assert.equal(existsSync(copy), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
