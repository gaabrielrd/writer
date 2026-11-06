import { workClosed, workId, workRevision, workFail, digest } from './workProgressContracts.mjs';
import {
  normalizeEditorChatPersonaId,
  normalizeEditorChatPersonaComplement,
  normalizeEditorChatStamp,
} from './editorChatContracts.mjs';
const closed = (value, keys) => {
  workClosed(value, keys);
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key)))
    workFail('failed-precondition', 'Metadados de persona incompletos.');
};
const hash = (value) => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    workFail('failed-precondition', 'Prova nativa de persona inválida.');
  return value;
};
function leaves(value) {
  const result = value.bindings.map((binding) => ({
    kind: 'binding',
    target: value.target,
    scopeKind: binding.scopeKind,
    scopeId: binding.scopeId,
    identityToken: binding.identityToken,
  }));
  for (const profile of value.profiles)
    if (profile)
      result.push(
        profile.kind === 'preset'
          ? { kind: 'preset', presetId: profile.id, definitionHash: profile.identityToken }
          : {
              kind: 'persona',
              ownerId: value.ownerId,
              personaId: profile.id,
              identityToken: profile.identityToken,
            },
      );
  return result;
}
export function normalizeLiteraryPersonaDependencies(value) {
  closed(value, [
    'version',
    'ownerId',
    'target',
    'resource',
    'identityToken',
    'versionToken',
    'bindings',
    'profiles',
  ]);
  if (value.version !== 1)
    workFail('failed-precondition', 'Versão das dependências de persona inválida.');
  closed(value.target, ['kind', 'id']);
  closed(value.resource, ['kind', 'id']);
  if (value.target.kind !== 'book' || !['chapter', 'scene'].includes(value.resource.kind))
    workFail('failed-precondition', 'Escopo das dependências de persona inválido.');
  if (
    !Array.isArray(value.bindings) ||
    value.bindings.length < 1 ||
    value.bindings.length > 2 ||
    !Array.isArray(value.profiles) ||
    value.profiles.length !== 2
  )
    workFail('failed-precondition', 'Origens de persona incompletas.');
  const target = { kind: 'book', id: workId(value.target.id) };
  const result = {
    version: 1,
    ownerId: workId(value.ownerId),
    target,
    resource: { kind: value.resource.kind, id: workId(value.resource.id) },
    identityToken: hash(value.identityToken),
    versionToken: hash(value.versionToken),
    bindings: value.bindings.map((binding, index) => {
      closed(binding, ['scopeKind', 'scopeId', 'identityToken', 'value', 'personaRevision']);
      if (
        binding.scopeKind !== (index === 0 ? 'book' : 'chapter') ||
        (index === 0 && binding.scopeId !== target.id)
      )
        workFail('failed-precondition', 'Vínculo de persona fora do escopo.');
      return {
        scopeKind: binding.scopeKind,
        scopeId: workId(binding.scopeId),
        identityToken: hash(binding.identityToken),
        value:
          binding.value === null
            ? null
            : index === 0
              ? normalizeEditorChatPersonaId(binding.value)
              : normalizeEditorChatPersonaComplement(binding.value),
        personaRevision: workRevision(binding.personaRevision),
      };
    }),
    profiles: value.profiles.map((profile) => {
      if (profile === null) return null;
      closed(profile, ['kind', 'id', 'identityToken', 'revision', 'capturedStamp']);
      if (
        !['preset', 'custom'].includes(profile.kind) ||
        (profile.kind === 'preset' && profile.capturedStamp !== null) ||
        (profile.kind === 'custom' && profile.capturedStamp === null) ||
        workRevision(profile.revision) < 1
      )
        workFail('failed-precondition', 'Perfil nativo de persona inválido.');
      return {
        kind: profile.kind,
        id: normalizeEditorChatPersonaId(profile.id),
        identityToken: hash(profile.identityToken),
        revision: profile.revision,
        capturedStamp:
          profile.capturedStamp === null ? null : normalizeEditorChatStamp(profile.capturedStamp),
      };
    }),
  };
  if (
    result.resource.kind === 'chapter' &&
    (result.bindings.length !== 2 || result.bindings[1].scopeId !== result.resource.id)
  )
    workFail('failed-precondition', 'O vínculo não pertence ao capítulo da operação.');
  const expected = [result.bindings[0].value, result.bindings[1]?.value?.personaId ?? null];
  if (
    result.profiles.some((profile, index) => (profile?.id ?? null) !== expected[index]) ||
    digest(leaves(result)) !== result.identityToken ||
    digest({ bindings: result.bindings, profiles: result.profiles }) !== result.versionToken
  )
    workFail('failed-precondition', 'As provas de persona não correspondem às suas origens.');
  return result;
}
export function captureLiteraryPersonaDependencies(c, resource, native) {
  const bindings = native.proof.bindings.map(
    ({ scopeKind, scopeId, identityToken, value, personaRevision }) => ({
      scopeKind,
      scopeId,
      identityToken,
      value,
      personaRevision,
    }),
  );
  const profiles = native.proof.profiles.map((profile) =>
    profile === null
      ? null
      : {
          kind: profile.kind,
          id: profile.id,
          identityToken: profile.identityToken,
          revision: profile.revision,
          capturedStamp: profile.capturedStamp,
        },
  );
  return normalizeLiteraryPersonaDependencies({
    version: 1,
    ownerId: c.uid,
    target: c.target,
    resource,
    identityToken: digest(native.leaves),
    versionToken: digest(native.proof),
    bindings,
    profiles,
  });
}
