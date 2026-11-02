import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
  FUNCTION_DOMAINS,
  FUNCTION_ROUTES,
  STREAMING_FUNCTIONS,
} from '../functions/src/functionDomains.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pathName = (path) => relative(root, path).replaceAll('\\', '/');
async function files(path, suffixes) {
  const found = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) found.push(...(await files(child, suffixes)));
    else if (suffixes.some((s) => entry.name.endsWith(s))) found.push(child);
  }
  return found;
}
const consumers = new Map(),
  services = new Map();
for (const file of await files(resolve(root, 'src'), ['.ts', '.tsx'])) {
  if (file.includes('/tests/') || file.includes('\\tests\\') || file.endsWith('.test.ts')) continue;
  const ast = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isStringLiteral(node) && Object.hasOwn(FUNCTION_ROUTES, node.text)) {
      if (!consumers.has(node.text)) consumers.set(node.text, new Set());
      consumers.get(node.text).add(pathName(file));
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
for (const file of await files(resolve(root, 'functions/src'), ['.mjs'])) {
  if (file.endsWith('functionDomains.mjs') || file.endsWith('index.mjs')) continue;
  const ast = ts.createSourceFile(
    file,
    await readFile(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  function visit(node) {
    if (
      (ts.isMethodDeclaration(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isPropertyAssignment(node) ||
        ts.isVariableDeclaration(node)) &&
      node.name
    ) {
      const name = node.name.getText(ast).replace(/^['"]|['"]$/g, '');
      if (!services.has(name)) services.set(name, new Set());
      services.get(name).add(pathName(file));
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left)
    ) {
      const name = node.left.name.text;
      if (!services.has(name)) services.set(name, new Set());
      services.get(name).add(pathName(file));
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
const baseline = JSON.parse(
  await readFile(resolve(root, 'docs/infrastructure/functions-before.json'), 'utf8'),
);
const actions = Object.entries(FUNCTION_ROUTES)
  .sort()
  .map(([action, endpoint]) => ({
    action,
    endpoint,
    method: FUNCTION_DOMAINS[endpoint].actions[action],
    serviceCandidates: [...(services.get(FUNCTION_DOMAINS[endpoint].actions[action]) ?? [])].sort(),
    consumers: [...(consumers.get(action) ?? [])].sort(),
    headers:
      'Functions SDK + existing method-specific setters in functions/src/index.mjs; sector defaults to private/no-store',
  }));
const output = {
  baselineCommit: baseline.commit,
  before: { total: baseline.resources.length, callable: 308, http: 4, events: 5, schedules: 3 },
  after: {
    total: Object.keys(FUNCTION_DOMAINS).length + STREAMING_FUNCTIONS.length + 12,
    sectorCallable: Object.keys(FUNCTION_DOMAINS).length,
    streamingCallable: STREAMING_FUNCTIONS.length,
    http: 4,
    events: 5,
    schedules: 3,
  },
  compatibility:
    'No legacy endpoints: prototype without active users, explicitly authorized 2026-11-02.',
  domains: Object.entries(FUNCTION_DOMAINS).map(([endpoint, domain]) => ({
    endpoint,
    actionCount: Object.keys(domain.actions).length,
    ...domain.options,
    serviceAccount: 'platform default; no IAM change',
    secrets: domain.requiresGenerationKey ? ['BOOK_GENERATION_GEMINI_KEY'] : [],
  })),
  retained: baseline.resources.filter((r) => !Object.hasOwn(FUNCTION_ROUTES, r.name)),
  actions,
};
await mkdir(resolve(root, 'docs/infrastructure'), { recursive: true });
await writeFile(
  resolve(root, 'docs/infrastructure/functions-inventory.json'),
  JSON.stringify(output, null, 2) + '\n',
);
console.log(
  'Functions inventory:',
  output.before.total,
  '->',
  output.after.total,
  '; actions:',
  actions.length,
);
