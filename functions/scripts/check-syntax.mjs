import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const source = new URL('../src/', import.meta.url);
async function modules(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) result.push(...(await modules(path)));
    else if (entry.name.endsWith('.mjs')) result.push(fileURLToPath(path));
  }
  return result;
}
const paths = (await modules(source)).sort();
if (!paths.length) throw Error('No Functions source modules found');
for (const path of paths) {
  const result = spawnSync(process.execPath, ['--check', path], {
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('Functions syntax checked: ' + paths.length + ' modules');
