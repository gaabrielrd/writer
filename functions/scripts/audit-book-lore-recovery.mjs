import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorize, closed, restoreHash } from '../src/bookRestoreUploadContracts.mjs';
import { recoveryId, recoveryRequest } from '../src/bookLoreWriteRecoveryContracts.mjs';
import { createBookLoreRecoveryAuditService } from '../src/bookLoreRecoveryAudit.mjs';

const invalid = () => {
  throw Error('Argumentos ou revisão inválidos.');
};
export function parseAuditArguments(args) {
  const values = new Map(),
    allowed = new Set(['--project', '--uid', '--after', '--limit', '--apply']);
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i],
      value = args[i + 1];
    if (
      !allowed.has(name) ||
      values.has(name) ||
      typeof value !== 'string' ||
      !value ||
      value.startsWith('--')
    )
      invalid();
    values.set(name, value);
  }
  const projectId = values.get('--project'),
    uid = values.get('--uid');
  if (typeof projectId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,127}$/.test(projectId))
    invalid();
  authorize(uid);
  const apply = values.get('--apply') ?? null,
    after = values.get('--after') ?? null,
    rawLimit = values.get('--limit') ?? '25',
    limit = Number(rawLimit);
  if (!/^[0-9]+$/.test(rawLimit) || !Number.isInteger(limit) || limit < 1 || limit > 50) invalid();
  if (after !== null) recoveryId(after);
  if (apply && (values.has('--after') || values.has('--limit'))) invalid();
  return { projectId, uid, apply, after, limit };
}
export function reviewedAuditControls(report, options) {
  closed(report, ['schemaVersion', 'projectId', 'uid', 'items', 'next']);
  if (
    report.schemaVersion !== 1 ||
    report.projectId !== options.projectId ||
    report.uid !== options.uid ||
    !Array.isArray(report.items) ||
    report.items.length > 50
  )
    invalid();
  if (report.next !== null) recoveryId(report.next);
  const controls = [],
    ids = new Set(),
    statuses = ['eligible', 'already-revoked', 'book-present', 'needs-review'];
  for (const item of report.items) {
    closed(item, ['writeId', 'bookId', 'status'], ['keyPresent', 'reason', 'control']);
    if (!statuses.includes(item.status)) invalid();
    recoveryId(item.writeId);
    if (item.bookId !== null) recoveryId(item.bookId);
    if (item.keyPresent !== undefined && typeof item.keyPresent !== 'boolean') invalid();
    if (
      item.reason !== undefined &&
      ![
        'missing-deletion-marker',
        'unsupported-deletion-marker',
        'invalid-deletion-marker',
        'inconsistent-control',
      ].includes(item.reason)
    )
      invalid();
    if (ids.has(item.writeId)) invalid();
    ids.add(item.writeId);
    if (item.status === 'eligible') {
      closed(item.control, ['writeId', 'requestHash', 'jobToken', 'deletionToken']);
      const r = recoveryRequest(
          options.uid,
          {
            writeId: item.control.writeId,
            requestHash: item.control.requestHash,
            jobToken: item.control.jobToken,
          },
          true,
        ),
        deletionToken = restoreHash(item.control.deletionToken);
      if (item.bookId === null || r.writeId !== item.writeId) invalid();
      controls.push({ ...r, deletionToken });
    } else if (item.control !== undefined) invalid();
  }
  return controls;
}
async function readReview(path) {
  const file = await open(path, 'r');
  try {
    const maximum = 1_048_576,
      info = await file.stat();
    if (!info.isFile() || info.size > maximum) invalid();
    const bytes = Buffer.alloc(maximum + 1);
    let length = 0;
    while (length < bytes.length) {
      const part = await file.read(bytes, length, bytes.length - length, length);
      if (!part.bytesRead) break;
      length += part.bytesRead;
    }
    if (length > maximum) invalid();
    return JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes.subarray(0, length)));
  } finally {
    await file.close();
  }
}
async function createDb(projectId) {
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  if (emulator && !/^127[.]0[.]0[.]1:[0-9]+$/.test(emulator)) invalid();
  const { initializeApp } = await import('firebase-admin/app'),
    { getFirestore } = await import('firebase-admin/firestore');
  return getFirestore(initializeApp({ projectId }));
}
/** Dry run by default. Applying requires an explicit reviewed file for the same scope. */
export async function runHistoricalRecoveryAudit(args, dependencies = {}) {
  const options = parseAuditArguments(args),
    controls = options.apply
      ? reviewedAuditControls(await (dependencies.readReview ?? readReview)(options.apply), options)
      : null,
    db = await (dependencies.createDb ?? createDb)(options.projectId),
    service = createBookLoreRecoveryAuditService({ db });
  try {
    if (controls === null)
      return {
        exitCode: 0,
        report: {
          projectId: options.projectId,
          ...(await service.auditBookLoreRecoveryKeys(options.uid, {
            limit: options.limit,
            after: options.after,
          })),
        },
      };
    const results = [];
    for (const control of controls) {
      try {
        results.push(await service.revokeAuditedBookLoreRecovery(options.uid, control));
      } catch (error) {
        results.push({
          writeId: control.writeId,
          status: 'failed',
          code: [
            'invalid-argument',
            'failed-precondition',
            'permission-denied',
            'unavailable',
          ].includes(error?.code)
            ? error.code
            : 'internal',
        });
        return {
          exitCode: 1,
          report: { schemaVersion: 1, projectId: options.projectId, uid: options.uid, results },
        };
      }
    }
    return {
      exitCode: 0,
      report: { schemaVersion: 1, projectId: options.projectId, uid: options.uid, results },
    };
  } finally {
    await db.terminate?.();
  }
}
if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  runHistoricalRecoveryAudit(process.argv.slice(2))
    .then((result) => {
      process.stdout.write(JSON.stringify(result.report, null, 2) + '\n');
      process.exitCode = result.exitCode;
    })
    .catch(() => {
      process.stderr.write(
        'Auditoria interrompida. Confira os argumentos, credenciais e a revisão.\n',
      );
      process.exitCode = 1;
    });
}
