import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/shared/lib';
import { getWorkVersionSource } from '@/features/manuscript-history';
import {
  editorChatText,
  editorChatTextHash,
  editorChatRevision,
  editorChatHashToken,
  normalizeEditorChatTarget,
  normalizeEditorChatResource,
  normalizeEditorChatBase,
  normalizeEditorChatCapture,
} from '../../../../functions/src/editorChatContracts.mjs';
import type { EditorChatBase, EditorChatCapture } from '../model/editorChat';
import type { EditorChatCaptureSource } from '../model/editorChatEditorBridge';
import type { EditorChatHost } from '../model/editorChatHost';

function changed(): never {
  throw new Error(
    'O texto ou o editor mudou. Confirme o salvamento e prepare o contexto novamente.',
  );
}

type HostCapture = { base: EditorChatBase; capture: EditorChatCapture };
type CaptureOptions = { check?: () => void; signal?: AbortSignal };
/** Keeps capture and its initial mutation under the same reservation; never holds generation. */
export function captureEditorChatHost<T>(
  uid: string,
  host: EditorChatHost,
  source: EditorChatCaptureSource,
  options: CaptureOptions & {
    withCapture: (value: HostCapture, checkCurrent: () => void) => Promise<T>;
  },
): Promise<T>;
export function captureEditorChatHost(
  uid: string,
  host: EditorChatHost,
  source: EditorChatCaptureSource,
  options?: CaptureOptions,
): Promise<HostCapture>;
export async function captureEditorChatHost<T>(
  uid: string,
  host: EditorChatHost,
  source: EditorChatCaptureSource,
  options: CaptureOptions & {
    withCapture?: (value: HostCapture, checkCurrent: () => void) => Promise<T>;
  } = {},
): Promise<HostCapture | T> {
  const target = normalizeEditorChatTarget(host.target);
  const resource = normalizeEditorChatResource(host.resource, target);
  const user = auth.currentUser;
  let identityChanged = false;
  const checkActor = () => {
    options.signal?.throwIfAborted();
    options.check?.();
    if (identityChanged || !user || user.uid !== uid || auth.currentUser !== user) changed();
    host.checkCurrent();
  };
  checkActor();
  const unsubscribe = onAuthStateChanged(
    auth,
    (next) => {
      if (next !== user) identityChanged = true;
    },
    () => {
      identityChanged = true;
    },
  );
  try {
    const result = await host.runExclusive(async () => {
      checkActor();
      const current = host.getConfirmedSnapshot();
      if (!current) changed();
      const confirmed = {
        content: editorChatText(current.content),
        revision: editorChatRevision(current.revision),
        bodyHash: editorChatHashToken(current.bodyHash),
      };
      const checkSaved = () => {
        checkActor();
        const next = host.getConfirmedSnapshot();
        if (
          !next ||
          next.content !== confirmed.content ||
          next.revision !== confirmed.revision ||
          next.bodyHash !== confirmed.bodyHash ||
          host.target.kind !== target.kind ||
          host.target.id !== target.id ||
          host.resource.kind !== resource.kind ||
          host.resource.id !== resource.id
        )
          changed();
      };
      const bridge = host.getBridge();
      if (!bridge) changed();
      // Capture the PM fence before the first source read, including unsaved DOM changes.
      const own = await bridge.capture(source);
      const check = () => {
        checkSaved();
        own.checkCurrent();
        if (host.getBridge() !== bridge) changed();
      };
      check();
      const capture = normalizeEditorChatCapture(own.capture);
      const editorHash = await editorChatTextHash(editorChatText(own.html));
      check();
      if (editorHash !== capture.editorHash) changed();
      const saved = await getWorkVersionSource({ target, resource });
      check();
      if (
        !saved ||
        saved.target.kind !== target.kind ||
        saved.target.id !== target.id ||
        saved.resource.kind !== resource.kind ||
        saved.resource.id !== resource.id ||
        saved.content !== confirmed.content ||
        saved.revision !== confirmed.revision ||
        saved.contentHash !== confirmed.bodyHash
      )
        changed();
      const base = normalizeEditorChatBase({
        sourceToken: saved.sourceToken,
        revision: saved.revision,
        bodyHash: saved.contentHash,
      });
      const bodyHash = await editorChatTextHash(confirmed.content);
      check();
      if (bodyHash !== base.bodyHash) changed();
      const captured = { base, capture };
      const value = options.withCapture ? await options.withCapture(captured, check) : captured;
      check();
      return { value, checkCurrent: check };
    });
    result.checkCurrent();
    return result.value;
  } finally {
    unsubscribe();
  }
}
