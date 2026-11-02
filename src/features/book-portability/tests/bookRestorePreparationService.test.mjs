// @vitest-environment node
import { it, expect } from 'vitest';
import { isDeepStrictEqual } from 'node:util';
import { createBookRestorePreparationDriver } from '../services/bookRestorePreparationDriver.ts';
import { adventureImportDb } from '../../../../functions/test/helpers/adventureImportDb.mjs';
import { createBookRestoreUploadService } from '../../../../functions/src/bookRestoreUpload.mjs';
import { invokeBookRestoreCallable } from '../../../../functions/src/bookRestoreCallable.mjs';
import { bookLegacyFixture } from '../../../../functions/test/helpers/bookLegacyFixture.mjs';
import { coverRestoreFixture } from '../../../../functions/test/helpers/bookRestoreCoverFixture.mjs';
import { source } from '../../../../functions/test/helpers/bookContentFixture.mjs';
import { sha256 } from '../../../../functions/src/bookRestoreUploadContracts.mjs';

for (const format of ['native', 'legacy'])
  it(
    'client prepares ' +
      format +
      ' through the real closed service, recovers a lost response and pauses before activation',
    async () => {
      const f = adventureImportDb({ nativeUpdates: true }),
        uid = 'author',
        id = 'client-prepare-' + format + '-0001',
        factory = () => createBookRestoreUploadService({ db: f.db, now: () => 1000 }),
        call = async (method, input) =>
          JSON.parse(
            JSON.stringify(await invokeBookRestoreCallable(factory(), method, uid, input)),
          );
      const src = format === 'native' ? await source(coverRestoreFixture({ kind: 'none' })) : null,
        bytes = src
          ? Buffer.from(await src.read(0, src.size))
          : Buffer.from(JSON.stringify(bookLegacyFixture(6))),
        started = await call('startBookRestore', {
          operationId: id,
          source: {
            format: format === 'native' ? 'writer-book-archive' : 'writer-book-backup',
            version: format === 'native' ? 1 : 6,
            byteLength: bytes.length,
            sha256: sha256(bytes),
          },
          reviewHash: 'a'.repeat(64),
        });
      let p = started.progress;
      await factory().getBookRestoreRecoveryKey(uid, {
        restoreId: id,
        jobToken: p.jobToken,
        reviewHash: p.reviewHash,
      });
      for (let n = 0; n < Math.ceil(bytes.length / 65536); n++) {
        const part = bytes.subarray(n * 65536, (n + 1) * 65536);
        p = (
          await call('appendBookRestoreChunk', {
            restoreId: id,
            jobToken: p.jobToken,
            operationId: id + '-upload-' + n,
            expectedCheckpoint: p.checkpoint,
            index: n,
            chunkHash: sha256(part),
            chunkBase64: part.toString('base64'),
          })
        ).progress;
      }
      const identity = { ownerId: uid, restoreId: id, jobToken: p.jobToken, bookId: p.bookId },
        sent = [],
        journal = {
          async read() {
            return structuredClone(stored);
          },
          async compareAndSet(old, next) {
            if (!isDeepStrictEqual(old, stored)) return false;
            stored = structuredClone(next);
            return true;
          },
        };
      let stored = null,
        sequence = 0,
        lost = false,
        driver;
      const api = {
          get: (input) => call('getBookRestore', input),
          async advance(action, input) {
            sent.push({ action, input: structuredClone(input) });
            if (action === 'advanceBookRestoreIntegrity') expect(input.limit).toBe(16);
            else expect(Object.hasOwn(input, 'limit')).toBe(false);
            const r = await call(action, input);
            if (action === 'advanceBookRestoreLore' && !lost) {
              lost = true;
              throw Error('Lost after native commit');
            }
            return r;
          },
        },
        make = () =>
          createBookRestorePreparationDriver({
            identity,
            api,
            journal,
            check: () => {},
            operationId: () => id + '-step-' + sequence++,
          });
      driver = make();
      let result,
        units = 0;
      for (; units < 2500; units++) {
        try {
          result = await driver.step();
        } catch (error) {
          if (error.message !== 'Lost after native commit')
            throw new Error(
              format + ' ' + sent.at(-1)?.action + ': ' + error.code + '/' + error.details?.reason,
              { cause: error },
            );
          const pending = structuredClone(stored),
            previous = sent.at(-1);
          driver = make();
          result = await driver.step();
          expect(sent.at(-1)).toEqual(previous);
          expect(pending.operationId).toBe(previous.input.operationId);
        }
        if (result.kind === 'paused') break;
      }
      expect(units).toBeLessThan(2500);
      expect(lost).toBe(true);
      expect(result).toMatchObject({
        kind: 'paused',
        reason: 'review-required',
        progress: {
          state: 'content-verified',
          preparation: { schemaVersion: 13, phase: 'activation-ready' },
        },
      });
      expect(stored).toBeNull();
      expect(f.records.has('books/' + p.bookId)).toBe(false);
      expect(sent.some((x) => x.action === 'activateBookRestore')).toBe(false);
      const before = f.commits.length,
        operations = sequence;
      expect(await driver.step()).toEqual(result);
      expect(sequence).toBe(operations);
      expect(f.commits.slice(before).every((writes) => writes.length === 0)).toBe(true);
      const review = await factory().getBookRestoreActivationReview(uid, {
        restoreId: id,
        jobToken: p.jobToken,
      });
      expect(review.bookId).toBe(p.bookId);
      expect(review.summary.visibility).toBe('private');
    },
    30000,
  );
