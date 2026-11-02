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
export async function runBookBackupMedia(
  testFiles = ['tests/storage/bookBackupCover.rules.test.mjs'],
  namePattern,
) {
  if (namePattern !== undefined && !/^[A-Za-z0-9_-]{1,80}$/.test(namePattern))
    throw new Error('Filtro de teste deve ser uma palavra simples.');
  if (
    !Array.isArray(testFiles) ||
    !testFiles.length ||
    testFiles.length > 8 ||
    testFiles.some(
      (file) =>
        typeof file !== 'string' ||
        file.split('/').length !== 3 ||
        file.split('/')[0] !== 'tests' ||
        file.split('/')[1] !== 'storage' ||
        !/^[A-Za-z0-9_.-]+[.]test[.]mjs$/.test(file.split('/')[2]) ||
        !existsSync(resolve(root, file)),
    )
  )
    throw new Error('Selecione arquivos locais de tests/storage.');
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
        'node --test --test-concurrency=1 --test-reporter=tap ' +
          (namePattern ? '--test-name-pattern=' + namePattern + ' ' : '') +
          testFiles.join(' '),
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
    const args = process.argv.slice(2),
      patterns = args.filter((arg) => arg.startsWith('--test-name-pattern='));
    if (patterns.length > 1) throw new Error('Use somente um filtro de teste.');
    const files = args.filter((arg) => !patterns.includes(arg));
    process.exitCode = await runBookBackupMedia(
      files.length ? files : undefined,
      patterns[0]?.slice('--test-name-pattern='.length),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
