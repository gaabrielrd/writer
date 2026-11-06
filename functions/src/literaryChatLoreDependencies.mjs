import { workFail, digest } from './workProgressContracts.mjs';
import {
  editorChatClosed,
  editorChatHashToken,
  normalizeEditorChatReference,
  normalizeEditorChatStamp,
  EDITOR_CHAT_LIMITS,
} from './editorChatContracts.mjs';

export function literaryChatLoreVersionToken({
  reference,
  originToken,
  identityToken,
  capturedStamp,
}) {
  return digest({
    domain: 'literary-native-chat-lore-version-v1',
    reference,
    originToken,
    identityToken,
    capturedStamp,
  });
}
const key = (ref) => JSON.stringify([ref.kind, ref.scopeId, ref.entityId]);
export function normalizeLiteraryChatLoreDependencies(value, closure) {
  try {
    if (!Array.isArray(value) || value.length > EDITOR_CHAT_LIMITS.leaves)
      workFail('failed-precondition', 'Dependências de lore do chat inválidas.');
    const expected = new Map(
      closure.leaves
        .filter((leaf) => leaf.kind === 'lore')
        .map((leaf) => [key(leaf.reference), leaf]),
    );
    if (expected.size !== closure.leaves.filter((leaf) => leaf.kind === 'lore').length)
      workFail('failed-precondition', 'O fechamento contém origens conflitantes do mesmo lore.');
    const seen = new Set();
    const result = value.map((item) => {
      editorChatClosed(item, [
        'reference',
        'originToken',
        'identityToken',
        'capturedStamp',
        'versionToken',
      ]);
      const reference = normalizeEditorChatReference(item.reference),
        id = key(reference),
        leaf = expected.get(id);
      const originToken = editorChatHashToken(item.originToken),
        identityToken = editorChatHashToken(item.identityToken),
        capturedStamp = normalizeEditorChatStamp(item.capturedStamp);
      if (
        !leaf ||
        seen.has(id) ||
        leaf.scopeToken !== originToken ||
        leaf.entityIdentityToken !== identityToken
      )
        workFail('failed-precondition', 'O lore não corresponde ao fechamento nativo.');
      seen.add(id);
      const entry = { reference, originToken, identityToken, capturedStamp };
      const versionToken = literaryChatLoreVersionToken(entry);
      if (editorChatHashToken(item.versionToken) !== versionToken)
        workFail('failed-precondition', 'A versão capturada do lore está inconsistente.');
      return { ...entry, versionToken };
    });
    if (expected.size !== result.length)
      workFail('failed-precondition', 'As origens de lore do chat estão incompletas.');
    return result.sort((a, b) =>
      key(a.reference) < key(b.reference) ? -1 : key(a.reference) > key(b.reference) ? 1 : 0,
    );
  } catch (cause) {
    if (cause.code === 'invalid-argument')
      workFail('failed-precondition', 'Metadados de lore nativo inválidos.');
    throw cause;
  }
}
export function captureLiteraryChatLoreDependencies(lore, closure) {
  return normalizeLiteraryChatLoreDependencies(
    lore.map(({ leaf, snapshot }) => {
      if (snapshot.identityToken !== leaf.entityIdentityToken)
        workFail('failed-precondition', 'A captura de lore não corresponde à origem nativa.');
      const entry = {
        reference: leaf.reference,
        originToken: leaf.scopeToken,
        identityToken: leaf.entityIdentityToken,
        capturedStamp: normalizeEditorChatStamp(snapshot.capturedStamp),
      };
      return { ...entry, versionToken: literaryChatLoreVersionToken(entry) };
    }),
    closure,
  );
}
