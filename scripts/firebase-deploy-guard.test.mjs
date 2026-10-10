import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  assertCurrentMaster,
  deploymentConfig,
  deploymentPolicy,
  readMasterSha,
  FIRESTORE_TARGETS,
} from './firebase-deploy-guard.mjs';

const sha = 'a'.repeat(40);
const trusted = {
  GITHUB_REPOSITORY: 'gaabrielrd/writer',
  GITHUB_REPOSITORY_ID: '1339469949',
  GITHUB_REPOSITORY_OWNER_ID: '7004438',
  GITHUB_REF: 'refs/heads/master',
  GITHUB_EVENT_NAME: 'push',
  GITHUB_SHA: sha,
  DEPLOY_ENABLED: 'true',
  DEPLOY_PROJECT: 'writer-44cd5',
  WIF_PROVIDER: 'projects/123/locations/global/workloadIdentityPools/writer/providers/github',
  DEPLOY_SERVICE_ACCOUNT: 'writer-hosting@writer-44cd5.iam.gserviceaccount.com',
  HOSTING_SITE_ID: 'verified-site-fixture',
};
const manual = {
  ...trusted,
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  CONFIRM_PROJECT: 'writer-44cd5',
  CONFIRM_ROLLOUT: 'true',
  DEPLOY_RESOURCES: 'rules',
};

test('allows only explicitly enabled trusted Hosting pushes', () => {
  assert.deepEqual(deploymentPolicy('hosting', trusted), {
    project: 'writer-44cd5',
    only: 'hosting',
    site: 'verified-site-fixture',
  });
  for (const value of [undefined, '', 'false', 'TRUE', '1']) {
    assert.throws(
      () => deploymentPolicy('hosting', { ...trusted, DEPLOY_ENABLED: value }),
      /desabilitado/,
    );
  }
});

test('rejects fork, renamed identity, PR, dispatch, tag and non-master Hosting', () => {
  for (const [key, value] of [
    ['GITHUB_REPOSITORY', 'attacker/writer'],
    ['GITHUB_REPOSITORY_ID', '1'],
    ['GITHUB_REPOSITORY_OWNER_ID', '1'],
    ['GITHUB_REF', 'refs/heads/main'],
    ['GITHUB_REF', 'refs/tags/master'],
    ['GITHUB_EVENT_NAME', 'pull_request'],
    ['GITHUB_EVENT_NAME', 'pull_request_target'],
    ['GITHUB_EVENT_NAME', 'workflow_run'],
    ['GITHUB_EVENT_NAME', 'workflow_dispatch'],
  ])
    assert.throws(() => deploymentPolicy('hosting', { ...trusted, [key]: value }), /Somente/);
});

test('rejects absent or malformed destination and identity configuration', () => {
  for (const [key, value] of [
    ['GITHUB_SHA', 'master'],
    ['GITHUB_SHA', ''],
    ['DEPLOY_PROJECT', 'other'],
    ['WIF_PROVIDER', ''],
    ['WIF_PROVIDER', 'untrusted'],
    ['DEPLOY_SERVICE_ACCOUNT', ''],
    ['DEPLOY_SERVICE_ACCOUNT', 'sa@other.iam.gserviceaccount.com'],
    ['HOSTING_SITE_ID', ''],
    ['HOSTING_SITE_ID', 'site; echo unsafe'],
    ['HOSTING_SITE_ID', 'https://other.example'],
  ])
    assert.throws(() => deploymentPolicy('hosting', { ...trusted, [key]: value }));
  assert.throws(() => deploymentPolicy('functions', trusted), /Destino/);
});

test('manual choice maps only to rules, indexes or their union', () => {
  for (const [choice, only] of Object.entries(FIRESTORE_TARGETS)) {
    assert.equal(deploymentPolicy('firestore', { ...manual, DEPLOY_RESOURCES: choice }).only, only);
  }
  for (const choice of [
    undefined,
    '',
    'hosting',
    'firestore',
    '__proto__',
    'rules --force',
    'both; echo unsafe',
  ]) {
    assert.throws(
      () => deploymentPolicy('firestore', { ...manual, DEPLOY_RESOURCES: choice }),
      /Escolha/,
    );
  }
});

test('manual deployment requires project, rollout and trusted master confirmation', () => {
  for (const update of [
    { CONFIRM_PROJECT: '' },
    { CONFIRM_PROJECT: 'other' },
    { CONFIRM_ROLLOUT: 'false' },
    { CONFIRM_ROLLOUT: undefined },
    { GITHUB_EVENT_NAME: 'push' },
    { GITHUB_REF: 'refs/heads/feature' },
    { GITHUB_REPOSITORY_ID: 'other' },
    { DEPLOY_ENABLED: '' },
  ])
    assert.throws(() => deploymentPolicy('firestore', { ...manual, ...update }));
});

test('deploy configuration never includes unrelated Firebase products', () => {
  const source = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8'));
  source.functions = { source: 'functions' };
  assert.deepEqual(
    Object.keys(deploymentConfig('hosting', source, { site: 'verified-site-fixture' })),
    ['hosting'],
  );
  assert.equal(
    deploymentConfig('hosting', source, { site: 'verified-site-fixture' }).hosting.site,
    'verified-site-fixture',
  );
  assert.deepEqual(deploymentConfig('firestore', source, {}), { firestore: source.firestore });
  assert.throws(() => deploymentConfig('hosting', { hosting: { public: '.' } }, {}), /Revisar/);
  assert.throws(
    () => deploymentConfig('firestore', { firestore: { rules: 'other.rules' } }, {}),
    /Revisar/,
  );
});

test('old executions and missing master cannot release', () => {
  assert.doesNotThrow(() => assertCurrentMaster(sha, sha));
  for (const remote of ['', 'b'.repeat(40), 'master']) {
    assert.throws(() => assertCurrentMaster(sha, remote), /master mudou/);
  }
});

const workflow = (name) =>
  readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), 'utf8');

test('workflow contracts isolate identities and serialize both production entrypoints', () => {
  for (const name of ['deploy-hosting', 'deploy-firestore']) {
    const source = workflow(name);
    assert.match(source, /group: firebase-production-writer-44cd5/);
    assert.match(source, /cancel-in-progress: false/);
    assert.doesNotMatch(
      source,
      /--force|FIREBASE_TOKEN|credentials_json|firebaseServiceAccount|pull_request_target|workflow_run/,
    );
    assert.match(source, /vars\.FIREBASE_\w+_DEPLOY_ENABLED == 'true'/);
    assert.equal((source.match(/id-token: write/g) ?? []).length, 1);
    const deploy = source.slice(source.indexOf('\n  deploy:'));
    assert.match(deploy, /id-token: write/);
    assert.equal((source.match(/google-github-actions\/auth@/g) ?? []).length, 1);
    assert.ok(
      deploy.indexOf('firebase-deploy-guard.mjs') < deploy.indexOf('google-github-actions/auth@'),
    );
    for (const use of source.matchAll(/uses: ([^\s]+)/g)) assert.match(use[1], /@[a-f0-9]{40}$/);
    assert.equal(
      (source.match(/uses: actions\/checkout@/g) ?? []).length,
      (source.match(/ref: \$\{\{ github.sha \}\}/g) ?? []).length,
    );
  }
});

test('Hosting waits for validation and integration and verifies the same build without rebuilding', () => {
  const source = workflow('deploy-hosting');
  assert.match(source, /needs: \[validate, integration\]/);
  assert.match(source, /overwrite: true/);
  for (const check of [
    'npm run validate',
    'npm audit --audit-level=high',
    'npm run test:rules',
    'npm run test:e2e',
    'playwright.visual.config.ts',
  ])
    assert.ok(source.includes(check));
  const deploy = source.slice(source.indexOf('\n  deploy:'));
  assert.match(deploy, /sha256sum --check hosting.sha256/);
  assert.match(deploy, /diff -u hosting.sha256 actual.sha256/);
  assert.match(deploy, /name: hosting-\$\{\{ github.sha \}\}/);
  assert.match(deploy, /firebase deploy --only hosting /);
  assert.doesNotMatch(deploy, /npm run build|npm ci|npm run validate/);
  assert.match(deploy, /writer-release.txt/);
});

test('Firestore only dispatches manually and tests rules before its deploy job', () => {
  const source = workflow('deploy-firestore');
  assert.match(source, /workflow_dispatch:/);
  assert.doesNotMatch(source, /\n {2}push:|\n {2}pull_request:/);
  assert.match(source, /options: \[rules, indexes, both\]/);
  assert.match(source, /needs: \[validate\]/);
  assert.match(source, /npm run test:rules/);
  assert.match(source, /CONFIRM_PROJECT: \$\{\{ inputs.confirm_project \}\}/);
  assert.match(source, /--only "\$FIRESTORE_ONLY"/);
  assert.match(source, /default: false/);
});

test('master verification uses only the fixed GitHub endpoint and ephemeral read token', async () => {
  let calls = 0;
  const head = await readMasterSha('fixture-token', async (url, options) => {
    calls += 1;
    assert.equal(url, 'https://api.github.com/repos/gaabrielrd/writer/git/ref/heads/master');
    assert.equal(options.headers.Authorization, 'Bearer fixture-token');
    assert.equal(options.redirect, 'error');
    return {
      ok: true,
      json: async () => ({ ref: 'refs/heads/master', object: { type: 'commit', sha } }),
    };
  });
  assert.equal(head, sha);
  assert.equal(calls, 1);
});

test('missing authorization, API errors and unexpected refs fail closed', async () => {
  await assert.rejects(
    readMasterSha('', () => {
      throw new Error('must not request');
    }),
    /Token/,
  );
  await assert.rejects(
    readMasterSha('fixture-token', async () => ({ ok: false, status: 403 })),
    /HTTP 403/,
  );
  for (const ref of [
    {},
    { ref: 'refs/heads/other', object: { type: 'commit', sha } },
    { ref: 'refs/heads/master', object: { type: 'tag', sha } },
    { ref: 'refs/heads/master', object: { type: 'commit', sha: 'bad' } },
  ]) {
    await assert.rejects(
      readMasterSha('fixture-token', async () => ({ ok: true, json: async () => ref })),
      /Resposta inválida/,
    );
  }
});
