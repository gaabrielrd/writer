import { writeLiteraryBackupProcess } from './literaryBackupFence.mjs';
import { workId, workFail, workDate, digest, readWorkMetadata } from './workProgressContracts.mjs';
import { validateId } from './generation.mjs';
import { readLiteraryPublicationPolicy } from './literaryPublicationPolicy.mjs';
import { prepareLiteraryDependencyWrite } from './literaryDependencyClock.mjs';
import { renderPublicRichText, countVisibleWords } from './visibleWordCount.mjs';
import {
  readLiteraryIntegrationChapter,
  listLiteraryIntegrationChapters,
  orderLiteraryIntegrationChapters,
  listLiteraryIntegrationUnits,
  readLiteraryIntegrationMarkup,
} from './literaryIntegrationSources.mjs';
import {
  literaryPublicationScope as scope,
  literaryPublicationRef as ref,
  literaryPublicationEntry as entry,
  literaryPublicRevision as publicRef,
  readLiteraryPublicationSource as source,
  readLiteraryPublicationIntegration as integration,
  readLiteraryPublicationBook as bookOrigin,
  literaryPublicationSummary as summary,
  publicationText,
  publicationHash,
  publicationActName,
  assertLiteraryPublicationUnitCoverage,
  persistLiteraryPublicationStep as persist,
} from './literaryPublicationContracts.mjs';
const stopped = ['canceled', 'stale', 'published'];
const counter = (value) => {
  if (!Number.isSafeInteger(value) || value < 0)
    workFail('failed-precondition', 'Contagem da publicação inválida.');
  return value;
};
function includesChapter(job, chapter) {
  if (job.policy === 'book') return true;
  if (job.policy === 'act')
    return (
      chapter.actId === job.unitId ||
      (chapter.actOrder !== null &&
        (chapter.actOrder < job.selection.order ||
          (chapter.actOrder === job.selection.order &&
            chapter.actId.localeCompare(job.unitId) < 0)))
    );
  return (
    chapter.id === job.unitId ||
    orderLiteraryIntegrationChapters([chapter, job.selection])[0].id === chapter.id
  );
}
export function createLiteraryPublicationService({ db, now = Date.now }) {
  async function current(tx, c, jobRef, job) {
    if (stopped.includes(job.state)) return false;
    let actual;
    try {
      actual = await source(tx, c);
    } catch (cause) {
      if (!['permission-denied', 'not-found', 'failed-precondition'].includes(cause.code))
        throw cause;
      writeLiteraryBackupProcess(tx, c, 'publication', 'update', jobRef, {
        state: 'stale',
        message: 'Uma origem ficou indisponível. Preserve o manifesto e confira as fontes.',
      });
      job.state = 'stale';
      return false;
    }
    if (actual.bookToken !== job.bookToken || actual.token !== job.sourceFence) {
      writeLiteraryBackupProcess(tx, c, 'publication', 'update', jobRef, {
        state: 'stale',
        message:
          'A fonte ou a edição pública mudou. Preserve este manifesto e prepare uma nova versão.',
      });
      job.state = 'stale';
      return false;
    }
    let accepted;
    try {
      accepted = await integration(tx, c, job.integration.id);
    } catch (cause) {
      if (!['permission-denied', 'not-found', 'failed-precondition'].includes(cause.code))
        throw cause;
      writeLiteraryBackupProcess(tx, c, 'publication', 'update', jobRef, {
        state: 'stale',
        message: 'A integração deixou de estar aprovada. Confira a decisão atual.',
      });
      job.state = 'stale';
      return false;
    }
    if (
      accepted.token !== job.integration.token ||
      accepted.sourceFence !== actual.manuscriptFence
    ) {
      writeLiteraryBackupProcess(tx, c, 'publication', 'update', jobRef, {
        state: 'stale',
        message: 'A integração aprovada mudou. Confira a nova decisão antes de publicar.',
      });
      job.state = 'stale';
      return false;
    }
    return true;
  }
  const chapterAt = async (tx, c, jobId, index) => {
    const page = await tx.get(
      db
        .collection(c.path + '/literaryPublicationChapters')
        .where('jobId', '==', jobId)
        .where('index', '==', index)
        .limit(1),
    );
    if (page.docs.length !== 1)
      workFail('failed-precondition', 'O manifesto tem uma posição ausente.');
    return page.docs[0];
  };
  return {
    async startLiteraryPublication(uid, data) {
      const c = scope(db, uid, data, [
          'jobId',
          'policy',
          'unitId',
          'integrationId',
          'expectedIntegrationToken',
          'authorName',
          'checks',
        ]),
        jobId = validateId(data.jobId),
        policy = data.policy,
        unitId = data.unitId == null ? null : workId(data.unitId),
        integrationId = validateId(data.integrationId),
        expectedIntegrationToken = publicationHash(data.expectedIntegrationToken),
        authorName = publicationText(data.authorName, 120);
      if (
        !['book', 'act', 'chapter'].includes(policy) ||
        (policy === 'book' && unitId !== null) ||
        (policy !== 'book' && unitId === null) ||
        !data.checks ||
        Object.keys(data.checks).sort().join(',') !==
          'finalTextReviewed,navigationReviewed,publicationAuthorized' ||
        Object.values(data.checks).some((value) => value !== true)
      )
        workFail(
          'invalid-argument',
          'Confirme o escopo e as verificações autorais desta publicação.',
        );
      const fingerprint = digest({
        method: 'startLiteraryPublication',
        policy,
        unitId,
        integrationId,
        expectedIntegrationToken,
        authorName,
        checks: data.checks,
      });
      return db.runTransaction(async (tx) => {
        const captured = await source(tx, c),
          jobRef = ref(c, 'literaryPublications', jobId),
          previous = (await tx.get(jobRef)).data(),
          operationRef = ref(c, 'literaryOperations', jobId),
          receipt = (await tx.get(operationRef)).data();
        if (previous) {
          if (previous.bookToken !== captured.bookToken)
            workFail('failed-precondition', 'Este pedido pertence a outra origem.');
          if (previous.fingerprint !== undefined && previous.fingerprint !== fingerprint)
            workFail('invalid-argument', 'Manifesto usado por outro pedido.');
          if (
            receipt &&
            (receipt.method !== 'startLiteraryPublication' || receipt.fingerprint !== fingerprint)
          )
            workFail('invalid-argument', 'Pedido usado por outra operação.');
          if (!receipt) {
            const clock = await prepareLiteraryDependencyWrite(tx, c);
            tx.create(operationRef, {
              method: 'startLiteraryPublication',
              fingerprint,
              id: jobId,
              revision: 1,
              updatedAt: previous.createdAt,
              bookToken: captured.bookToken,
            });
            clock.commit();
          }
          return summary(previous);
        }
        if (receipt) workFail('already-exists', 'Este identificador já acompanha outra operação.');
        // Historical receipts above retain their original meaning after a policy change.
        const publicationPolicy = await readLiteraryPublicationPolicy(tx, c);
        if (publicationPolicy.policy && publicationPolicy.policy.unit !== policy)
          workFail(
            'failed-precondition',
            'Escolha a unidade definida no contrato antes de preparar uma nova edição.',
            'publication-policy-unit',
          );
        const accepted = await integration(tx, c, integrationId);
        if (
          accepted.sourceFence !== captured.manuscriptFence ||
          accepted.sourceFence !== expectedIntegrationToken
        )
          workFail('failed-precondition', 'A integração não corresponde ao manuscrito atual.');
        let selection = null;
        if (policy === 'chapter') selection = await readLiteraryIntegrationChapter(tx, c, unitId);
        if (policy === 'act') {
          const act = (
            await readWorkMetadata(tx, db.doc(c.path + '/acts/' + unitId), [
              'name',
              'order',
              'deleting',
            ])
          ).data();
          if (!act || act.deleting || !Number.isSafeInteger(act.order) || act.order < 1)
            workFail('not-found', 'Ato indisponível.');
          if (
            !(
              await tx.get(
                db
                  .collection(c.path + '/chapters')
                  .where('actId', '==', unitId)
                  .limit(1)
                  .select(),
              )
            ).docs.length
          )
            workFail('failed-precondition', 'O ato escolhido não tem capítulos.');
          selection = { id: unitId, order: act.order };
        }
        if (
          accepted.level !== 'book' &&
          (accepted.level !== 'act' ||
            policy === 'book' ||
            (policy === 'act' && accepted.actId !== unitId) ||
            (policy === 'chapter' && accepted.actId !== selection.actId))
        )
          workFail('failed-precondition', 'A integração aceita não cobre a unidade escolhida.');
        if (
          (await readWorkMetadata(tx, publicRef(c, jobId), [])).exists ||
          captured.previous?.revisionId === jobId
        )
          workFail('already-exists', 'Esta edição pública já existe.');
        for (const kind of ['acts', 'chapters', 'lore']) {
          if (
            (
              await tx.get(
                db
                  .collection(publicRef(c, jobId).path + '/' + kind)
                  .limit(1)
                  .select(),
              )
            ).docs.length
          )
            workFail('already-exists', 'Há conteúdo anterior neste destino de publicação.');
        }
        const createdAt = workDate(now, captured.root.updatedAt ?? 0),
          title = publicationText(captured.root.title, 300),
          manifestHash = digest({
            domain: 'literary-publication-manifest-v1',
            bookToken: captured.bookToken,
            jobId,
            policy,
            unitId,
            authorName,
            title,
            integration: accepted,
          }),
          job = {
            schemaVersion: 1,
            jobId,
            fingerprint,
            bookToken: captured.bookToken,
            sourceFence: captured.token,
            manuscriptFence: captured.manuscriptFence,
            previous: captured.previous,
            privacyVersion: captured.privacyVersion,
            policy,
            unitId,
            selection,
            integration: accepted,
            authorName,
            title,
            checks: data.checks,
            state: 'planning',
            phase: 'candidates',
            cursor: null,
            orderCursor: null,
            candidates: 0,
            chapterCount: 0,
            targetFound: policy === 'book',
            priorRead: 0,
            removalCount: 0,
            removalHash: digest({
              domain: 'literary-publication-removals-v1',
              jobId,
              previous: captured.previous,
            }),
            chapterIndex: 0,
            compiledChapters: 0,
            unitCursor: null,
            unitCount: 0,
            verifiedUnits: 0,
            verifiedChapters: 0,
            verifiedCandidates: 0,
            candidateVerifyCursor: null,
            actCount: 0,
            wordCount: 0,
            manifestHash,
            createdAt,
          };
        const clock = await prepareLiteraryDependencyWrite(tx, c);
        writeLiteraryBackupProcess(tx, c, 'publication', 'create', jobRef, job);
        tx.create(operationRef, {
          method: 'startLiteraryPublication',
          fingerprint,
          id: jobId,
          revision: 1,
          updatedAt: createdAt,
          bookToken: captured.bookToken,
        });
        clock.commit();
        tx.update(c.ref, { hasLiteraryPublications: true });
        return summary(job);
      });
    },
    async getLiteraryPublication(uid, data) {
      const c = scope(db, uid, data, ['jobId']),
        jobId = validateId(data.jobId);
      return db.runTransaction(async (tx) => {
        const actual = await bookOrigin(tx, c),
          jobRef = ref(c, 'literaryPublications', jobId),
          job = (await tx.get(jobRef)).data();
        if (!job) return { jobId, state: 'unconfirmed' };
        if (job.bookToken !== actual.bookToken)
          workFail('failed-precondition', 'O manifesto pertence a outra origem.');
        await current(tx, c, jobRef, job);
        return summary(job);
      });
    },
    async listLiteraryPublications(uid, data) {
      const c = scope(db, uid, data, ['afterId']),
        after = data.afterId == null ? null : workId(data.afterId);
      return db.runTransaction(async (tx) => {
        const actual = await bookOrigin(tx, c);
        let query = db
          .collection(c.path + '/literaryPublications')
          .orderBy('__name__')
          .limit(12)
          .select(
            'jobId',
            'progressRevision',
            'title',
            'authorName',
            'integration.id',
            'bookToken',
            'policy',
            'unitId',
            'state',
            'phase',
            'candidates',
            'verifiedCandidates',
            'chapterCount',
            'compiledChapters',
            'unitCount',
            'verifiedUnits',
            'verifiedChapters',
            'actCount',
            'wordCount',
            'removalCount',
            'manifestHash',
            'removalHash',
            'createdAt',
            'preparedAt',
            'publishedAt',
            'publicationUrl',
            'message',
          );
        if (after) query = query.startAfter(after);
        const page = await tx.get(query);
        return {
          items: page.docs
            .filter((row) => row.data().bookToken === actual.bookToken)
            .map((row) => summary(row.data())),
          nextAfterId: page.docs.length === 12 ? page.docs.at(-1).id : null,
        };
      });
    },
    async listLiteraryPublicationManifest(uid, data) {
      const c = scope(db, uid, data, ['jobId', 'afterIndex']),
        jobId = validateId(data.jobId),
        after = data.afterIndex == null ? null : counter(data.afterIndex);
      return db.runTransaction(async (tx) => {
        const actual = await bookOrigin(tx, c),
          job = (await tx.get(ref(c, 'literaryPublications', jobId))).data();
        if (!job || job.bookToken !== actual.bookToken)
          workFail('not-found', 'Manifesto indisponível.');
        let query = db
          .collection(c.path + '/literaryPublicationChapters')
          .where('jobId', '==', jobId)
          .orderBy('index')
          .limit(12)
          .select(
            'chapterId',
            'index',
            'title',
            'actId',
            'compiled',
            'wordCount',
            'projectionHash',
          );
        if (after !== null) query = query.startAfter(after);
        const page = await tx.get(query);
        return {
          items: page.docs.map((row) => row.data()),
          nextAfterIndex: page.docs.length === 12 ? page.docs.at(-1).data().index : null,
        };
      });
    },
    async listLiteraryPublicationRemovals(uid, data) {
      const c = scope(db, uid, data, ['jobId', 'afterId']),
        jobId = validateId(data.jobId),
        after = data.afterId == null ? null : workId(data.afterId);
      return db.runTransaction(async (tx) => {
        const actual = await bookOrigin(tx, c),
          job = (await tx.get(ref(c, 'literaryPublications', jobId))).data();
        if (!job || job.bookToken !== actual.bookToken)
          workFail('not-found', 'Manifesto indisponível.');
        let query = db
          .collection(c.path + '/literaryPublicationRemovals')
          .where('jobId', '==', jobId)
          .orderBy('chapterId')
          .limit(12)
          .select('chapterId', 'title', 'previousRevisionId');
        if (after !== null) query = query.startAfter(after);
        const page = await tx.get(query);
        return {
          items: page.docs.map((row) => row.data()),
          nextAfterId: page.docs.length === 12 ? page.docs.at(-1).data().chapterId : null,
        };
      });
    },
    async cancelLiteraryPublication(uid, data) {
      const c = scope(db, uid, data, ['jobId']),
        jobId = validateId(data.jobId);
      return db.runTransaction(async (tx) => {
        const actual = await bookOrigin(tx, c),
          jobRef = ref(c, 'literaryPublications', jobId),
          job = (await tx.get(jobRef)).data();
        if (job?.bookToken && job.bookToken !== actual.bookToken)
          workFail('failed-precondition', 'O manifesto pertence a outra origem.');
        if (job && ['published', 'canceled'].includes(job.state)) return summary(job);
        const next = job
          ? { ...job, state: 'canceled' }
          : {
              schemaVersion: 1,
              jobId,
              state: 'canceled',
              bookToken: actual.bookToken,
              createdAt: workDate(now),
            };
        const clock = await prepareLiteraryDependencyWrite(tx, c);
        persist(tx, c, jobRef, job, next);
        clock.commit();
        return summary(next);
      });
    },
    async advanceLiteraryPublication(uid, data) {
      const c = scope(db, uid, data, ['jobId']),
        jobId = validateId(data.jobId);
      return db.runTransaction(async (tx) => {
        const actual = await bookOrigin(tx, c),
          jobRef = ref(c, 'literaryPublications', jobId),
          job = (await tx.get(jobRef)).data();
        if (job && job.bookToken !== actual.bookToken)
          workFail('failed-precondition', 'O manifesto pertence a outra origem.');
        if (!job) workFail('not-found', 'Manifesto indisponível.');
        if (!(await current(tx, c, jobRef, job)) || job.state === 'prepared') return summary(job);
        if (job.phase === 'candidates') {
          const page = await listLiteraryIntegrationChapters(tx, c, {
            level: 'book',
            afterId: job.cursor,
          });
          for (const chapter of page.items) {
            const native = (
              await readWorkMetadata(tx, db.doc(c.path + '/chapters/' + chapter.id), ['actId'])
            ).data();
            if (native?.actId && chapter.actId === null)
              workFail(
                'failed-precondition',
                'Corrija o capítulo vinculado a um ato inexistente antes de publicar.',
              );
          }
          const clock = await prepareLiteraryDependencyWrite(tx, c);
          for (const chapter of page.items)
            tx.create(entry(c, 'Candidates', jobId, chapter.id), {
              ...chapter,
              jobId,
              chapterId: chapter.id,
              sortActOrder: chapter.actOrder ?? Number.MAX_SAFE_INTEGER,
              sortActId: chapter.actId ?? '',
            });
          const next = {
            ...job,
            candidates: counter(job.candidates + page.items.length),
            cursor: page.nextAfterId,
            phase: page.nextAfterId ? 'candidates' : 'selecting',
          };
          persist(tx, c, jobRef, job, next);
          clock.commit();
          return summary(next);
        }
        if (job.phase === 'selecting') {
          let query = db
            .collection(c.path + '/literaryPublicationCandidates')
            .where('jobId', '==', jobId)
            .orderBy('sortActOrder')
            .orderBy('sortActId')
            .orderBy('order')
            .orderBy('chapterId')
            .limit(1);
          if (job.orderCursor) query = query.startAfter(...job.orderCursor);
          const row = (await tx.get(query)).docs[0];
          if (!row) {
            if (!job.chapterCount || !job.targetFound)
              workFail('failed-precondition', 'A unidade escolhida não tem capítulos publicáveis.');
            const next = {
              ...job,
              state: 'compiling',
              phase: job.previous ? 'prior' : 'building',
              cursor: null,
            };
            persist(tx, c, jobRef, job, next);
            return summary(next);
          }
          const chapter = row.data(),
            selected = includesChapter(job, chapter),
            next = {
              ...job,
              orderCursor: [
                chapter.sortActOrder,
                chapter.sortActId,
                chapter.order,
                chapter.chapterId,
              ],
              targetFound:
                job.targetFound ||
                (job.policy === 'act' && chapter.actId === job.unitId) ||
                (job.policy === 'chapter' && chapter.id === job.unitId),
            };
          const clock = selected ? await prepareLiteraryDependencyWrite(tx, c) : null;
          if (selected) {
            tx.create(entry(c, 'Chapters', jobId, chapter.id), {
              ...chapter,
              index: job.chapterCount,
              compiled: false,
            });
            next.chapterCount = counter(job.chapterCount + 1);
          }
          persist(tx, c, jobRef, job, next);
          clock?.commit();
          return summary(next);
        }
        if (job.phase === 'prior') {
          let query = db
            .collection(publicRef(c, job.previous.revisionId).path + '/chapters')
            .orderBy('__name__')
            .limit(20)
            .select('title');
          if (job.cursor) query = query.startAfter(job.cursor);
          const page = await tx.get(query),
            removals = [];
          for (const row of page.docs) {
            const included = await readWorkMetadata(tx, entry(c, 'Chapters', jobId, row.id), []);
            if (!included.exists)
              removals.push({
                chapterId: row.id,
                title: typeof row.data().title === 'string' ? row.data().title : null,
              });
          }
          if (!page.docs.length && job.priorRead !== job.previous.chapterCount)
            workFail(
              'failed-precondition',
              'A contagem da edição pública anterior está inconsistente.',
            );
          const clock = removals.length ? await prepareLiteraryDependencyWrite(tx, c) : null;
          removals.forEach((item) =>
            tx.create(entry(c, 'Removals', jobId, item.chapterId), {
              jobId,
              ...item,
              previousRevisionId: job.previous.revisionId,
            }),
          );
          const next = {
            ...job,
            priorRead: counter(job.priorRead + page.docs.length),
            removalCount: counter(job.removalCount + removals.length),
            cursor: page.docs.at(-1)?.id ?? null,
            phase: page.docs.length ? 'prior' : 'building',
            removalHash: removals.reduce(
              (previous, item) =>
                digest({ previous, ...item, previousRevisionId: job.previous.revisionId }),
              job.removalHash,
            ),
          };
          persist(tx, c, jobRef, job, next);
          clock?.commit();
          return summary(next);
        }
        if (job.phase === 'building') {
          if (job.chapterIndex === job.chapterCount) {
            const next = { ...job, state: 'verifying', phase: 'verifyUnits' };
            persist(tx, c, jobRef, job, next);
            return summary(next);
          }
          const chapterRow = await chapterAt(tx, c, jobId, job.chapterIndex),
            chapter = chapterRow.data(),
            actual = await readLiteraryIntegrationChapter(tx, c, chapter.chapterId);
          if (actual.token !== chapter.token)
            workFail('failed-precondition', 'Um capítulo mudou durante a compilação.');
          const page = await listLiteraryIntegrationUnits(tx, c, {
              chapterId: chapter.chapterId,
              chapterToken: chapter.token,
              after: job.unitCursor,
            }),
            unit = page.items[0];
          if (!unit) workFail('failed-precondition', 'Há um capítulo sem prosa no manifesto.');
          const opened = await readLiteraryIntegrationMarkup(tx, c, unit),
            rendered = renderPublicRichText(opened.html),
            covered =
              job.integration.level === 'book' ||
              (job.integration.level === 'act' && chapter.actId === job.integration.actId);
          if (covered)
            await assertLiteraryPublicationUnitCoverage(tx, c, job.integration, unit, opened);
          if (countVisibleWords(rendered) === 0)
            workFail('failed-precondition', 'Há uma unidade sem prosa no manifesto.');
          const bodyRef = entry(c, 'Bodies', jobId, chapter.chapterId),
            body = (await tx.get(bodyRef)).data(),
            html = (body?.html ? body.html + '\n' : '') + rendered,
            complete =
              unit.resource.kind === 'chapter' ||
              (page.items.length === 1 && page.nextAfter === null),
            unitHash = digest({
              index: job.unitCount,
              unit,
              identityToken: opened.identityToken,
              contentHash: opened.contentHash,
              renderedHash: digest(rendered),
            }),
            chain = digest({ previous: body?.unitHash ?? null, unitHash }),
            next = {
              ...job,
              unitCount: counter(job.unitCount + 1),
              unitCursor: complete ? null : { rank: unit.rank, id: unit.resource.id },
            };
          if (Buffer.byteLength(html) > 800000)
            workFail(
              'resource-exhausted',
              'O capítulo excede o limite público. Divida-o sem cortar o texto.',
            );
          let projection = null,
            actProjection = null,
            actPublic = null,
            prior = null;
          if (complete) {
            projection = {
              title: publicationText(chapter.title, 300),
              order: chapter.index + 1,
              ...(chapter.actId ? { actId: chapter.actId } : {}),
              content: renderPublicRichText(html),
            };
            if (Buffer.byteLength(JSON.stringify(projection)) > 900000)
              workFail(
                'resource-exhausted',
                'O capítulo é grande demais para publicar sem cortes.',
              );
            if (job.previous)
              prior = (
                await tx.get(
                  db.doc(
                    publicRef(c, job.previous.revisionId).path + '/chapters/' + chapter.chapterId,
                  ),
                )
              ).data();
            if (!covered && (!prior || digest(prior) !== digest(projection)))
              workFail(
                'failed-precondition',
                'Um capítulo fora da integração mudou ou ainda não foi publicado. Integre seu escopo antes de incluí-lo.',
              );
            if (
              (
                await readWorkMetadata(
                  tx,
                  db.doc(publicRef(c, jobId).path + '/chapters/' + chapter.chapterId),
                  [],
                )
              ).exists
            )
              workFail('already-exists', 'O destino já contém este capítulo.');
            if (chapter.actId) {
              const actRow = await readWorkMetadata(tx, db.doc(c.path + '/acts/' + chapter.actId), [
                'name',
                'order',
                'deleting',
              ]);
              if (!actRow.exists || actRow.data().deleting)
                workFail('failed-precondition', 'Um ato ficou indisponível.');
              actProjection = {
                name: publicationActName(actRow.data()),
                order: actRow.data().order,
              };
              actPublic = await tx.get(db.doc(publicRef(c, jobId).path + '/acts/' + chapter.actId));
              if (actPublic.exists && digest(actPublic.data()) !== digest(actProjection))
                workFail('failed-precondition', 'O ato publicado diverge do manifesto.');
            }
          }
          const clock = await prepareLiteraryDependencyWrite(tx, c);
          tx.create(entry(c, 'Units', jobId, job.unitCount), {
            jobId,
            index: job.unitCount,
            chapterIndex: chapter.index,
            unit,
            identityToken: opened.identityToken,
            contentHash: opened.contentHash,
            renderedHash: digest(rendered),
            unitHash,
            integrationCovered: covered,
          });
          if (complete) {
            const projectionHash = digest(projection),
              words = countVisibleWords(projection.content);
            tx.create(
              db.doc(publicRef(c, jobId).path + '/chapters/' + chapter.chapterId),
              projection,
            );
            if (actPublic && !actPublic.exists) {
              tx.create(actPublic.ref, actProjection);
              next.actCount = counter(job.actCount + 1);
            }
            tx.update(chapterRow.ref, {
              compiled: true,
              projectionHash,
              unitHash: chain,
              wordCount: words,
              actProjectionHash: actProjection ? digest(actProjection) : null,
            });
            tx.delete(bodyRef);
            next.compiledChapters = counter(job.compiledChapters + 1);
            next.chapterIndex = counter(job.chapterIndex + 1);
            next.wordCount = counter(job.wordCount + words);
            next.manifestHash = digest({
              previous: job.manifestHash,
              index: chapter.index,
              chapterId: chapter.chapterId,
              sourceToken: chapter.token,
              projectionHash,
              unitHash: chain,
            });
          } else tx.set(bodyRef, { jobId, chapterId: chapter.chapterId, html, unitHash: chain });
          persist(tx, c, jobRef, job, next);
          clock.commit();
          return summary(next);
        }
        if (job.phase === 'verifyUnits') {
          if (job.verifiedUnits === job.unitCount) {
            const next = { ...job, phase: 'verifyChapters' };
            persist(tx, c, jobRef, job, next);
            return summary(next);
          }
          const captured = (await tx.get(entry(c, 'Units', jobId, job.verifiedUnits))).data();
          if (!captured || captured.index !== job.verifiedUnits || captured.jobId !== jobId)
            workFail('failed-precondition', 'O manifesto tem uma fonte ausente.');
          const opened = await readLiteraryIntegrationMarkup(tx, c, captured.unit);
          if (captured.integrationCovered)
            await assertLiteraryPublicationUnitCoverage(
              tx,
              c,
              job.integration,
              captured.unit,
              opened,
            );
          if (
            opened.identityToken !== captured.identityToken ||
            opened.contentHash !== captured.contentHash ||
            digest(renderPublicRichText(opened.html)) !== captured.renderedHash
          )
            workFail('failed-precondition', 'Uma fonte mudou antes da confirmação.');
          const next = { ...job, verifiedUnits: counter(job.verifiedUnits + 1) };
          persist(tx, c, jobRef, job, next);
          return summary(next);
        }
        if (job.phase === 'verifyChapters') {
          if (job.verifiedChapters === job.chapterCount) {
            if (job.compiledChapters !== job.chapterCount || job.verifiedUnits !== job.unitCount)
              workFail('failed-precondition', 'A compilação ainda tem lacunas.');
            const next = { ...job, phase: 'verifyCandidates' };
            persist(tx, c, jobRef, job, next);
            return summary(next);
          }
          const chapter = (await chapterAt(tx, c, jobId, job.verifiedChapters)).data(),
            actual = (
              await tx.get(db.doc(publicRef(c, jobId).path + '/chapters/' + chapter.chapterId))
            ).data();
          if (!chapter.compiled || !actual || digest(actual) !== chapter.projectionHash)
            workFail('failed-precondition', 'O texto preparado diverge do manifesto.');
          if (chapter.actId) {
            const act = (
              await tx.get(db.doc(publicRef(c, jobId).path + '/acts/' + chapter.actId))
            ).data();
            if (!act || digest(act) !== chapter.actProjectionHash)
              workFail('failed-precondition', 'O sumário preparado diverge do manifesto.');
          }
          const next = { ...job, verifiedChapters: counter(job.verifiedChapters + 1) };
          persist(tx, c, jobRef, job, next);
          return summary(next);
        }
        if (job.phase === 'verifyCandidates') {
          const page = await listLiteraryIntegrationChapters(tx, c, {
            level: 'book',
            afterId: job.candidateVerifyCursor,
          });
          for (const chapter of page.items) {
            const saved = (
              await readWorkMetadata(tx, entry(c, 'Candidates', jobId, chapter.id), [
                'jobId',
                'chapterId',
                'token',
                'identityToken',
              ])
            ).data();
            if (
              !saved ||
              saved.jobId !== jobId ||
              saved.chapterId !== chapter.id ||
              saved.token !== chapter.token ||
              saved.identityToken !== chapter.identityToken
            )
              workFail(
                'failed-precondition',
                'A composição do livro mudou. Confira o manifesto antes de continuar.',
              );
          }
          const count = counter(job.verifiedCandidates + page.items.length),
            done = page.nextAfterId === null;
          if (done && count !== job.candidates)
            workFail('failed-precondition', 'A contagem dos capítulos mudou durante a compilação.');
          const next = {
              ...job,
              verifiedCandidates: count,
              candidateVerifyCursor: page.nextAfterId,
              ...(done
                ? {
                    state: 'prepared',
                    phase: 'prepared',
                    preparedAt: workDate(now, job.createdAt),
                    manifestHash: digest({
                      chapters: job.manifestHash,
                      removalHash: job.removalHash,
                      removalCount: job.removalCount,
                    }),
                  }
                : {}),
            },
            clock = done ? await prepareLiteraryDependencyWrite(tx, c) : null;
          persist(tx, c, jobRef, job, next);
          clock?.commit();
          return summary(next);
        }
        workFail(
          'failed-precondition',
          'O manifesto precisa de uma etapa reconhecida para continuar.',
        );
      });
    },
  };
}
