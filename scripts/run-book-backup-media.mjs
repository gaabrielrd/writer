import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { dirname, join, resolve, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { availablePort, processCompletion } from './run-firestore-rules.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function firebaseEntry() {
  if (process.env.WRITER_FIREBASE_CLI) {
    const explicit = resolve(process.env.WRITER_FIREBASE_CLI);
    if (!existsSync(explicit))
      throw new Error('WRITER_FIREBASE_CLI deve apontar para lib/bin/firebase.js instalado.');
    return explicit;
  }
  try {
    return createRequire(import.meta.url).resolve('firebase-tools/lib/bin/firebase.js');
  } catch {
    /* Global CLI is sufficient; no project dependency is required. */
  }
  try {
    const executable = process.platform === 'win32' ? 'where.exe' : 'which',
      args = process.platform === 'win32' ? ['firebase.cmd'] : ['firebase'];
    const candidates = execFileSync(executable, args, { encoding: 'utf8', windowsHide: true })
      .trim()
      .split(/\r?\n/);
    for (const entry of candidates) {
      if (process.platform !== 'win32') return entry;
      const script = join(dirname(entry), 'node_modules/firebase-tools/lib/bin/firebase.js');
      if (existsSync(script)) return script;
    }
  } catch {
    /* A missing CLI has a clear local setup error below. */
  }
  throw new Error(
    'Instale Firebase CLI global para test:media, ou configure WRITER_FIREBASE_CLI com o caminho de lib/bin/firebase.js.',
  );
}
export async function runBookBackupMedia() {
  const cli = firebaseEntry(),
    temporaryRoot = resolve(root, '.firebase');
  await mkdir(temporaryRoot, { recursive: true });
  const directory = await mkdtemp(join(temporaryRoot, 'media-emulators-'));
  // Firebase CLI owns emulator startup and graceful shutdown through emulators:exec.
  const firestore = await availablePort(),
    storage = await availablePort(),
    hub = await availablePort(),
    logging = await availablePort();
  const config = join(directory, 'firebase.json');
  await writeFile(
    config,
    JSON.stringify({
      firestore: { rules: join(root, 'firestore.rules') },
      storage: { rules: join(root, 'storage.rules') },
      emulators: {
        firestore: { host: '127.0.0.1', port: firestore },
        storage: { host: '127.0.0.1', port: storage },
        hub: { host: '127.0.0.1', port: hub },
        logging: { host: '127.0.0.1', port: logging },
        ui: { enabled: false },
        singleProjectMode: false,
      },
    }),
  );
  const environment = {
    ...process.env,
    WRITER_COVER_STORAGE_BUCKET: 'demo-writer-backup-cover.appspot.com',
    METADATA_SERVER_DETECTION: 'none',
  };
  delete environment.STORAGE_EMULATOR_HOST;
  delete environment.FIREBASE_STORAGE_EMULATOR_HOST;
  delete environment.FIRESTORE_EMULATOR_HOST;
  let terminal = false,
    exitCode,
    unsafeCleanup = false;
  try {
    const child = spawn(
      process.execPath,
      [
        cli,
        'emulators:exec',
        '--only',
        'firestore,storage',
        '--project',
        'demo-writer-backup-cover',
        '--config',
        config,
        '--non-interactive',
        'node --test tests/storage/bookBackupCover.rules.test.mjs',
      ],
      {
        cwd: root,
        stdio: 'inherit',
        windowsHide: true,
        env: environment,
      },
    );
    const result = await processCompletion(child);
    terminal = true;
    if (result.error) throw result.error;
    exitCode = result.code ?? 1;
  } finally {
    // Delete only our resolved checkout-local temporary configuration after CLI termination.
    if (terminal) {
      const actual = await realpath(directory),
        parent = await realpath(temporaryRoot);
      if (!actual.startsWith(parent + sep) || !basename(actual).startsWith('media-emulators-'))
        unsafeCleanup = true;
      else await rm(actual, { recursive: true, force: true });
    }
  }
  if (unsafeCleanup) throw new Error('Diretório temporário fora do checkout.');
  return exitCode;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await runBookBackupMedia();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
