import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export function withFileRollback(root, targets, action) {
  const backupRoot = mkdtempSync(join(tmpdir(), 'web-template-backup-'));
  const existing = new Set();

  try {
    for (const target of targets) {
      const source = join(root, target);
      if (!existsSync(source)) continue;
      existing.add(target);
      const backup = join(backupRoot, target);
      mkdirSync(dirname(backup), { recursive: true });
      cpSync(source, backup, { recursive: true });
    }

    return action();
  } catch (error) {
    for (const target of targets) {
      const destination = join(root, target);
      rmSync(destination, { recursive: true, force: true });
      if (!existing.has(target)) continue;
      const backup = join(backupRoot, target);
      mkdirSync(dirname(destination), { recursive: true });
      cpSync(backup, destination, { recursive: true });
    }
    throw error;
  } finally {
    rmSync(backupRoot, { recursive: true, force: true });
  }
}
