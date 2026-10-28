// @vitest-environment node
import { it, expect } from 'vitest';
import {
  readBookRestoreActivationReview as review,
  readBookRestoreMediaStatus as media,
  readBookRestoreArchiveStatus as archive,
} from '../services/bookRestoreFinalizationViews.ts';
import {
  readyMedia,
  finishMedia,
  mediaState,
  uid,
} from '../../../../functions/test/helpers/bookRestoreMediaFixture.mjs';
import {
  readyArchive,
  archiveStep,
  finishArchive,
} from '../../../../functions/test/helpers/bookRestoreArchiveFixture.mjs';
import { createImageLibraryService } from '../../../../functions/src/imageLibrary.mjs';
const identity = (f) => ({
  ownerId: uid,
  restoreId: f.id,
  jobToken: f.p.jobToken,
  bookId: f.p.bookId,
});
it('real activation review preserves bounded title/counts and private decisions without returning extra content', async () => {
  const f = await readyMedia({ none: true }),
    read = review(f.review, identity(f));
  expect(read).toEqual(f.review);
  expect(read.summary.visibility).toBe('private');
  expect(Object.isFrozen(read.summary.counts)).toBe(true);
  for (const change of [
    (r) => {
      r.bookId = 'other';
    },
    (r) => {
      r.checkpoint = -1;
    },
    (r) => {
      r.reviewToken = 'bad';
    },
    (r) => {
      r.summary.titlePreview = 'x'.repeat(301);
    },
    (r) => {
      r.summary.visibility = 'public';
    },
    (r) => {
      r.summary.counts.words = -1;
    },
    (r) => {
      r.summary.cover.kind = 'unknown';
    },
    (r) => {
      r.summary.draft.outcome = 'preparing';
    },
    (r) => {
      r.summary.privateText = 'NEVER_RETURN';
    },
  ]) {
    const raw = structuredClone(f.review);
    change(raw);
    expect(() => review(raw, identity(f))).toThrow();
  }
  const wide = structuredClone(f.review);
  wide.summary.universe = {
    originKind: 'reference',
    observed: 'available',
    universeId: 'w'.repeat(250),
  };
  expect(review(wide, identity(f)).summary.universe.universeId).toHaveLength(250);
});
for (const none of [true, false])
  it(
    'real media ' +
      (none ? 'none' : 'library') +
      ' distinguishes pending, final receipt and current availability',
    async () => {
      const f = await readyMedia({ none }),
        before = media(await mediaState(f));
      expect(before.state).toBe('pending');
      expect(before.completedAt).toBeNull();
      const result = await finishMedia(f),
        view = media(result);
      expect(view.state).toBe(none ? 'none' : 'ready');
      expect(view.imageAvailable).toBe(!none);
      expect(media(await mediaState(f))).toEqual(view);
      for (const change of [
        (r) => {
          r.receipt.action = 'wrong';
        },
        (r) => {
          r.receipt.completedAt++;
        },
        (r) => {
          r.media.imageAvailable = !r.media.imageAvailable;
        },
        (r) => {
          r.media.completedAt = null;
        },
        (r) => {
          r.media.state = 'pending';
        },
      ]) {
        const raw = structuredClone(result);
        change(raw);
        expect(() => media(raw)).toThrow();
      }
    },
  );
it('owner-deleted original cover can finish unavailable without being treated as a ready image', async () => {
  const f = await readyMedia(),
    imageId = f.p.preparation.cover.imageId,
    library = createImageLibraryService({
      db: f.db,
      assets: {
        retireRestoreImage: f.assets.retire,
        remove: (path) => f.storage.bucket().file(path).delete({ ignoreNotFound: true }),
      },
    });
  await library.detach(uid, f.p.bookId, imageId);
  await library.remove(uid, { id: imageId });
  expect(media(await finishMedia(f))).toMatchObject({
    state: 'unavailable',
    imageState: 'unavailable',
    imageAvailable: false,
  });
});
it('real archive progress and historical/current phases are metadata-only, bounded and source-bound', async () => {
  const f = await readyArchive({ none: true }),
    ctx = identity(f),
    empty = archive(f.archiveProgress, ctx);
  expect(empty.phase).toBe('not-started');
  expect(empty.revision).toBe(0);
  const first = await archiveStep(f),
    current = archive(first.progress, ctx);
  expect(current.revision).toBe(1);
  expect(current).not.toHaveProperty('after');
  const done = await finishArchive(f, first.progress),
    view = archive(done, ctx);
  expect(view.phase).toBe('done');
  expect(view.removed.bytes).toBe(f.p.uploadedBytes);
  const replay = await archiveStep(f);
  expect(archive(replay.receipt, ctx).revision).toBe(1);
  expect(archive(replay.progress, ctx)).toEqual(view);
  for (const change of [
    (r) => {
      r.ownerId = 'other';
    },
    (r) => {
      r.restoreId = 'other-restore-0001';
    },
    (r) => {
      r.jobToken = 'c'.repeat(64);
    },
    (r) => {
      r.contextToken = 'bad';
    },
    (r) => {
      r.revision = -1;
    },
    (r) => {
      r.completedAt = null;
    },
    (r) => {
      r.removed.bytes = -1;
    },
  ]) {
    const raw = structuredClone(done);
    change(raw);
    expect(() => archive(raw, ctx)).toThrow();
  }
});
