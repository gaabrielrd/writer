import { digest, inconsistent, restoreFail, sum } from './adventureRestoreContracts.mjs';
import { normalizeAdventureLoreEntity } from './adventureLoreContracts.mjs';
import { projectPortablePersonaProfile } from './portablePersonaProfile.mjs';
const rootAddress = { scope: 'job', path: ['preparedRoot', 'current'] };
const write = (address, value, mode = 'create') => ({ address, value, mode });
const native = (...path) => ({ scope: 'adventure', path });
const privateValue = (id) => ({ scope: 'job', path: ['preparedRoot', id] });
const compatibility = () => restoreFail('failed-precondition', 'native-compatibility');
export async function projectAdventureRestoreProfiles({
  uid,
  adventureId,
  adventureToken,
  stage,
  unit,
  mapper,
  reader,
  first,
}) {
  const next = structuredClone(stage),
    mapped = await mapper.mapJSON(unit.record, unit.value),
    value = mapped.value,
    writes = [],
    checks = [],
    absent = [],
    proofs = [unit],
    record = unit.record;
  let profileAddress = null;
  if (stage.phase === 'lore') {
    if (['adventure-lore', 'adventure-lore-body'].includes(record.kind)) {
      const headSource =
        record.kind === 'adventure-lore' ? unit : await reader.findLore('lore', unit.value.id);
      if (headSource !== unit) proofs.push(headSource);
      const head = (await mapper.mapJSON(headSource.record, headSource.value)).value,
        d = head.data;
      let body = null;
      if (!d.deleted) {
        const bodySource =
          record.kind === 'adventure-lore-body'
            ? unit
            : await reader.findLore('lore-body', unit.value.id);
        if (bodySource !== unit) proofs.push(bodySource);
        body = (await mapper.mapJSON(bodySource.record, bodySource.value)).value;
        if (body.id !== head.id) inconsistent();
      } else if (record.kind !== 'adventure-lore') inconsistent();
      const common = {
        schemaVersion: 1,
        ownerId: uid,
        adventureId,
        adventureToken,
        entityId: head.id,
        revision: 1,
      };
      if (d.deleted) {
        absent.push(native('loreBodies', head.id));
        writes.push(write(native('lore', head.id), { ...common, ...d }, 'ensure'));
      } else {
        const e = {
          name: d.name,
          aliases: d.aliases,
          category: d.category,
          summary: d.summary,
          ...body.data,
          isPublic: false,
        };
        let normalized;
        try {
          normalized = normalizeAdventureLoreEntity(e);
        } catch {
          compatibility();
        }
        if (digest(e) !== digest(normalized)) compatibility();
        writes.push(
          write(
            native('lore', head.id),
            {
              ...common,
              name: e.name,
              aliases: e.aliases,
              category: e.category,
              summary: e.summary,
              relationCount: e.relations.length,
              isPublic: false,
              deleted: false,
              createdAt: d.createdAt,
              updatedAt: d.updatedAt,
            },
            'ensure',
          ),
          write(
            native('loreBodies', head.id),
            {
              ...common,
              details: e.details,
              structuredDetails: e.structuredDetails,
              relations: e.relations,
            },
            'ensure',
          ),
        );
      }
      const counter = record.kind === 'adventure-lore' ? 'loreHeads' : 'loreBodies';
      next[counter] = sum(next[counter], 1);
    } else if (record.kind === 'adventure-lore-end') {
      if (value.counts.lore !== stage.loreHeads || value.counts['lore-body'] !== stage.loreBodies)
        inconsistent();
      next.phase = 'personas';
    } else inconsistent();
    if (first || record.kind === 'adventure-lore' || record.kind === 'adventure-lore-end')
      writes.push({
        address: rootAddress,
        mode: 'update',
        update: (old) => {
          if (
            old.ownerId !== uid ||
            old.value.id !== adventureId ||
            (old.value.loreVersion ?? 0) !== stage.loreHeads
          )
            inconsistent();
          return { ...old, value: { ...old.value, loreVersion: next.loreHeads } };
        },
      });
  } else if (stage.phase === 'personas') {
    if (record.kind === 'adventure-persona') {
      const { scope, bindingId, personaId } = value;
      checks.push({
        address: scope === 'adventure' ? rootAddress : native('scenes', bindingId),
        verify: (old) => {
          const owner = scope === 'adventure' ? old.value : old;
          if (
            owner.ownerId !== uid ||
            owner.id !== bindingId ||
            (scope === 'adventure'
              ? (owner.personaId ?? null)
              : (owner.personaComplement?.personaId ?? null)) !== personaId
          )
            inconsistent();
        },
      });
      let profileHash = null;
      if (personaId !== null) {
        let profile;
        try {
          profile = projectPortablePersonaProfile(value.profile);
        } catch {
          compatibility();
        }
        if (profile.id !== personaId || digest(profile) !== digest(value.profile)) inconsistent();
        profileHash = digest(profile);
        profileAddress = privateValue('persona-' + personaId);
        writes.push(
          write(
            profileAddress,
            {
              schemaVersion: 1,
              ownerId: uid,
              kind: 'adventure-restore-persona',
              profileHash,
              profile,
            },
            'ensure',
          ),
        );
      }
      writes.push(
        write(privateValue('binding-' + mapped.record.id), {
          schemaVersion: 1,
          scope,
          bindingId,
          personaId,
          profileHash,
        }),
      );
      const counter = scope === 'adventure' ? 'personaAdventureBindings' : 'personaSceneBindings';
      next[counter] = sum(next[counter], 1);
    } else if (record.kind === 'adventure-personas') {
      if (
        value.counts.adventure !== stage.personaAdventureBindings ||
        value.counts.scene !== stage.personaSceneBindings
      )
        inconsistent();
      next.phase = 'profiles-ready';
    } else inconsistent();
  } else inconsistent();
  next.itemIndex++;
  return {
    next,
    writes,
    checks,
    absent,
    proofs,
    profileAddress,
    sourceToken: digest(proofs.map((p) => p.sourceToken)),
  };
}
