import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT = 'writer-44cd5';
export const FIRESTORE_TARGETS = Object.freeze({
  rules: 'firestore:rules',
  indexes: 'firestore:indexes',
  both: 'firestore:rules,firestore:indexes',
});

/** Fail closed before obtaining a Google identity. Protected environments and IAM must enforce this too. */
export function deploymentPolicy(kind, env) {
  if (!['hosting', 'firestore'].includes(kind)) throw new Error('Destino inválido.');
  const expectedEvent = kind === 'hosting' ? 'push' : 'workflow_dispatch';
  if (
    env.GITHUB_REPOSITORY !== 'gaabrielrd/writer' ||
    env.GITHUB_REPOSITORY_ID !== '1339469949' ||
    env.GITHUB_REPOSITORY_OWNER_ID !== '7004438' ||
    env.GITHUB_REF !== 'refs/heads/master' ||
    env.GITHUB_EVENT_NAME !== expectedEvent
  ) {
    throw new Error('Somente o evento autorizado da master do repositório original.');
  }
  if (!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '')) throw new Error('SHA inválido.');
  if (env.DEPLOY_ENABLED !== 'true') throw new Error('Deploy desabilitado.');
  if (env.DEPLOY_PROJECT !== PROJECT) throw new Error('Projeto inválido.');
  if (kind === 'hosting') {
    if (!/^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/.test(env.HOSTING_SITE_ID ?? '')) {
      throw new Error('Site Hosting precisa ser verificado e configurado.');
    }
    return { project: PROJECT, only: 'hosting', site: env.HOSTING_SITE_ID };
  }
  if (env.CONFIRM_PROJECT !== PROJECT || env.CONFIRM_ROLLOUT !== 'true') {
    throw new Error('Confirme projeto e revisão do rollout de regras/índices.');
  }
  if (!Object.hasOwn(FIRESTORE_TARGETS, env.DEPLOY_RESOURCES ?? '')) {
    throw new Error('Escolha rules, indexes ou both.');
  }
  return { project: PROJECT, only: FIRESTORE_TARGETS[env.DEPLOY_RESOURCES] };
}

export function deploymentConfig(kind, source, policy) {
  if (kind === 'hosting') {
    if (source.hosting?.public !== 'dist' || Array.isArray(source.hosting)) {
      throw new Error('Revisar configuração Hosting antes de publicar.');
    }
    return { hosting: { ...source.hosting, site: policy.site } };
  }
  if (
    source.firestore?.rules !== 'firestore.rules' ||
    source.firestore?.indexes !== 'firestore.indexes.json'
  ) {
    throw new Error('Revisar caminhos Firestore antes de publicar.');
  }
  return { firestore: source.firestore };
}

/** Only public metadata returned by the auth action; never inspect the JSON key. */
export function assertCredentialProject(project) {
  if (project !== PROJECT) throw new Error('Credencial Google ausente ou de outro projeto.');
}

export function assertCurrentMaster(sha, head) {
  if (head !== sha) {
    throw new Error('A master mudou; esta execução antiga não pode publicar.');
  }
}

export async function readMasterSha(token, fetchImplementation = fetch) {
  if (!token) throw new Error('Token GitHub de leitura ausente.');
  const response = await fetchImplementation(
    'https://api.github.com/repos/gaabrielrd/writer/git/ref/heads/master',
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(30_000),
      redirect: 'error',
    },
  );
  if (!response.ok)
    throw new Error(`Não foi possível verificar a master (HTTP ${response.status}).`);
  const ref = await response.json();
  if (
    ref.ref !== 'refs/heads/master' ||
    ref.object?.type !== 'commit' ||
    !/^[a-f0-9]{40}$/.test(ref.object?.sha ?? '')
  ) {
    throw new Error('Resposta inválida ao consultar a master.');
  }
  return ref.object.sha;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const kind = process.argv[2];
  const policy = deploymentPolicy(kind, process.env);
  if (process.argv[3] === '--authenticated') assertCredentialProject(process.env.AUTH_PROJECT_ID);
  const head = await readMasterSha(process.env.GH_READ_TOKEN);
  assertCurrentMaster(process.env.GITHUB_SHA, head);
  const source = JSON.parse(readFileSync('firebase.json', 'utf8'));
  writeFileSync(
    'firebase.deploy.json',
    `${JSON.stringify(deploymentConfig(kind, source, policy), null, 2)}\n`,
  );
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `only=${policy.only}\n`);
  console.log(`Destino validado: ${policy.project}; ${policy.only}; SHA ${process.env.GITHUB_SHA}`);
}
