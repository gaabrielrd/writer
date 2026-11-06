import assert from 'node:assert/strict';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function project() {
  const root = mkdtempSync(join(tmpdir(), 'writer-skills-'));
  mkdirSync(join(root, 'scripts'));
  for (const script of ['sync-skills.mjs', 'check-skills.mjs', 'skill-registry.mjs']) {
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

test('registered external platform variants survive sync byte-for-byte while canonical copies remain verified', () => {
  const root = project();
  try {
    writeFileSync(
      join(root, 'skills', 'external-skills.json'),
      JSON.stringify({ version: 1, skills: [{ name: 'external-design', version: '1.0' }] }),
    );
    for (const agent of ['.claude', '.agents']) {
      const directory = join(root, agent, 'skills', 'external-design');
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        join(directory, 'SKILL.md'),
        `---\nname: external-design\ndescription: External\nversion: 1.0\n---\nVariant ${agent}\n`,
      );
      writeFileSync(join(directory, 'binary'), Buffer.from([0, 1, 255]));
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.equal(run(root, 'sync-skills.mjs').status, 0);
      assert.equal(run(root, 'check-skills.mjs').status, 0);
      for (const agent of ['.claude', '.agents']) {
        assert.match(
          readFileSync(join(root, agent, 'skills/external-design/SKILL.md'), 'utf8'),
          new RegExp(`Variant ${agent}`),
        );
        assert.deepEqual(
          readFileSync(join(root, agent, 'skills/external-design/binary')),
          Buffer.from([0, 1, 255]),
        );
      }
    }
    writeFileSync(
      join(root, '.agents/skills/external-design/SKILL.md'),
      '---\nname: external-design\ndescription: External\nversion: 2.0\n---\n',
    );
    assert.equal(run(root, 'check-skills.mjs').status, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('external registration is optional on clean installs and rejects unknown extras and unsafe names', () => {
  const root = project();
  try {
    const path = join(root, 'skills', 'external-skills.json');
    writeFileSync(
      path,
      JSON.stringify({ version: 1, skills: [{ name: 'external-design', version: '1.0' }] }),
    );
    assert.equal(run(root, 'sync-skills.mjs').status, 0);
    assert.equal(run(root, 'check-skills.mjs').status, 0);
    mkdirSync(join(root, '.agents/skills/unknown'), { recursive: true });
    assert.equal(run(root, 'check-skills.mjs').status, 1);
    writeFileSync(
      path,
      JSON.stringify({ version: 1, skills: [{ name: '../unsafe', version: '1.0' }] }),
    );
    assert.equal(run(root, 'sync-skills.mjs').status, 1);
    assert.ok(existsSync(join(root, '.agents/skills/plan-feature/SKILL.md')));
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
