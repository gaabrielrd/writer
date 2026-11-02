import {
  authorize,
  mutationInput,
  requestHash,
  restoreFail,
  inconsistent,
  digest,
  nativeToken,
  sum,
} from './adventureRestoreContracts.mjs';
import { projectPortablePersonaProfile } from './portablePersonaProfile.mjs';
import { projectPersonaRestoreBatch } from './personaAvailabilityContracts.mjs';
import {
  adventureStageArtifactId,
  readAdventureStageArtifact,
  prepareAdventureStageArtifacts,
} from './adventureRestoreArtifacts.mjs';
import {
  adventureRestorePersonaOrigin,
  adventureRestorePersonaBatchRef,
  adventurePersonaBatchEffect,
  assertAdventurePersonaLibraryEmpty,
  readAdventureRestorePersonaBatch,
} from './adventureRestorePersonaLibraryBatch.mjs';

export function createAdventureRestorePersonaLibraryService(store) {
  const action = 'advanceAdventureRestorePersonaLibrary';
  return {
    async advanceAdventureRestorePersonaLibrary(uid, input) {
      authorize(uid);
      const request = Object.freeze(mutationInput(input)),
        fingerprint = requestHash(action, request);
      return store.db.runTransaction(async (tx) => {
        const loaded = await store.load(tx, uid, request.restoreId, request.jobToken),
          op = await tx.get(store.refs.op(uid, request.operationId));
        if (op.exists) return store.confirm(loaded, store.operation(op, loaded, fingerprint));
        if (
          loaded.job.state !== 'content-verified' ||
          !['universe-ready', 'persona-library'].includes(loaded.job.staging?.phase) ||
          request.expectedCheckpoint !== loaded.job.checkpoint
        )
          restoreFail('failed-precondition', 'state-conflict');
        const first = loaded.job.staging.phase === 'universe-ready',
          staging = first
            ? {
                ...loaded.job.staging,
                phase: 'persona-library',
                personaLibraryInstalled: 0,
                personaLibraryAfter: null,
                personaLibraryRevoked: false,
              }
            : structuredClone(loaded.job.staging);
        let batch;
        if (first) {
          await assertAdventurePersonaLibraryEmpty(store, tx, loaded);
          batch = {
            ...adventureRestorePersonaOrigin(loaded),
            ownerId: uid,
            state: 'preparing',
            profileCount: 0,
            createdByOperationId: request.operationId,
            lastOperationId: request.operationId,
          };
        } else
          batch = (await readAdventureRestorePersonaBatch(store, tx, loaded, 'preparing')).value;
        let query = store.db
          .collection(loaded.ref.path + '/preparedRoot')
          .where('kind', '==', 'adventure-restore-persona')
          .select()
          .orderBy('__name__')
          .limit(1);
        if (staging.personaLibraryAfter !== null)
          query = query.startAfter(staging.personaLibraryAfter);
        const page = await tx.get(query),
          writes = [];
        let sourceToken = digest({
          domain: 'adventure-persona-library-empty-v1',
          jobToken: loaded.view.jobToken,
        });
        if (page.docs.length) {
          if (staging.personaLibraryInstalled >= staging.personaProfiles) inconsistent();
          const id = page.docs[0].id,
            address = { scope: 'job', path: ['preparedRoot', id] },
            definition = await readAdventureStageArtifact(
              store,
              tx,
              loaded,
              await tx.get(
                store.db.doc(
                  loaded.ref.path + '/stagingArtifacts/' + adventureStageArtifactId(address),
                ),
              ),
              { withValue: true },
            );
          let profile;
          try {
            profile = projectPortablePersonaProfile(definition.data.profile);
          } catch {
            restoreFail('failed-precondition', 'native-compatibility');
          }
          if (
            id !== 'persona-' + profile.id ||
            digest(definition.data) !==
              digest({
                schemaVersion: 1,
                ownerId: uid,
                kind: 'adventure-restore-persona',
                profileHash: digest(profile),
                profile,
              })
          )
            inconsistent();
          sourceToken = digest({
            domain: 'adventure-persona-library-definition-v1',
            jobToken: loaded.view.jobToken,
            valueHash: definition.value.valueHash,
            native: nativeToken(definition.metadata),
          });
          writes.push({
            address: { scope: 'persona', path: ['aiPersonas', profile.id] },
            value: { ...profile, restoreOrigin: adventureRestorePersonaOrigin(loaded) },
          });
          staging.personaLibraryInstalled = sum(staging.personaLibraryInstalled, 1);
          staging.personaLibraryAfter = id;
        } else {
          if (staging.personaLibraryInstalled !== staging.personaProfiles) inconsistent();
          staging.phase = 'persona-library-ready';
        }
        const artifacts = await prepareAdventureStageArtifacts(
          store,
          tx,
          loaded,
          request.operationId,
          writes,
          sourceToken,
        );
        if (artifacts.count !== writes.length) inconsistent();
        staging.artifactCount = sum(staging.artifactCount, artifacts.count);
        batch = projectPersonaRestoreBatch({
          ...batch,
          profileCount: staging.personaLibraryInstalled,
          lastOperationId: request.operationId,
        });
        const record = store.next(loaded, request, action, { staging });
        if (first) tx.create(adventureRestorePersonaBatchRef(store, loaded), batch);
        else tx.set(adventureRestorePersonaBatchRef(store, loaded), batch);
        artifacts.commit();
        return store.commit(tx, loaded, request, action, record, [
          ...artifacts.effects,
          adventurePersonaBatchEffect(store, loaded, batch),
        ]);
      });
    },
  };
}
