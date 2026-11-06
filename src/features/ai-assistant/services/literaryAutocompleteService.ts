import { getFunctions, httpsCallable } from '@/shared/api/domainCallable';
import { getFirebaseApp } from '@/shared/lib';
import { chatDocumentHash } from '../model/chapterChat';
import {
  DEFAULT_PLATFORM_MODEL,
  DEFAULT_BYOK_CHAT_MODELS,
  type ChatGeneration,
  type ChatGenerationRequest,
} from '../model/chatGeneration';
import { getBYOKConfig } from './byokStorage';
import { validateBYOKConfig, type BYOKConfig } from '../model/byokConfig';
import { generateAIResponse } from './aiClient';
import type {
  AutocompleteOffer,
  AutocompleteScope,
  AutocompleteApplication,
} from '../model/atomicAutocomplete';
import { normalizeLiteraryWritingSnapshot } from '../../../../functions/src/literaryWritingProtocol.mjs';
interface Response {
  editorial?: unknown;
  requestId: string;
  state:
    | 'unconfirmed'
    | 'prepared'
    | 'generating'
    | 'ready'
    | 'stale'
    | 'revoked'
    | 'expired'
    | 'canceled'
    | 'applied'
    | 'error';
  text?: string;
  beforeHash?: string;
  chapterId?: string;
  expiresAt?: number;
  applyCost?: number;
  generation?: ChatGeneration;
  systemInstruction?: string;
  prompt?: string;
}
async function call<T>(name: string, input: unknown): Promise<T> {
  return (
    await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), name, {
      timeout: 120000,
    })(input)
  ).data;
}
export const cancelLiteraryAutocomplete = (scope: AutocompleteScope, requestId: string) =>
  call<Response>('cancelLiteraryAutocomplete', {
    target: { kind: 'book', id: scope.bookId },
    requestId,
  });
export async function generateLiteraryAutocomplete(
  input: AutocompleteScope & { before: string; textBeforeCursor: string; planIds?: string[] },
  config: BYOKConfig,
  signal: AbortSignal,
): Promise<AutocompleteOffer> {
  const checked = validateBYOKConfig(config);
  if (!checked.isValid) throw new Error(checked.error);
  const requestId = crypto.randomUUID(),
    beforeHash = await chatDocumentHash(input.before);
  signal.throwIfAborted();
  const generation: ChatGenerationRequest = {
    version: 1,
    provider: config.provider === 'firebase_ai' ? 'platform' : config.provider,
    model:
      config.provider === 'firebase_ai'
        ? (config.platformModel ?? DEFAULT_PLATFORM_MODEL)
        : config.customModel || DEFAULT_BYOK_CHAT_MODELS[config.provider],
    reasoning: config.provider === 'firebase_ai' ? (config.platformReasoning ?? 'medium') : 'auto',
  };
  const target = { kind: 'book', id: input.bookId };
  const cancel = () => {
    void cancelLiteraryAutocomplete(input, requestId).catch(() => undefined);
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    let result = await call<Response>('prepareLiteraryAutocomplete', {
      target,
      requestId,
      chapterId: input.chapterId,
      beforeHash,
      textBeforeCursor: input.textBeforeCursor.slice(-6000),
      generation,
      ...(input.planIds === undefined ? {} : { planIds: input.planIds }),
    });
    signal.throwIfAborted();
    if (generation.provider !== 'platform' && result.state === 'prepared') {
      // Reauthorize immediately before sending canonical private context to a local BYOK provider.
      result = await call<Response>('getLiteraryAutocomplete', { target, requestId });
      signal.throwIfAborted();
      if (
        result.state !== 'prepared' ||
        !result.prompt ||
        !result.systemInstruction ||
        !result.generation ||
        result.generation.requested.provider !== generation.provider
      )
        throw new Error('O contexto BYOK mudou. Gere outra sugestão.');
      const local = getBYOKConfig(),
        frozen = {
          ...local,
          provider: generation.provider,
          customModel: result.generation.effective.model,
        };
      const validation = validateBYOKConfig(frozen);
      if (!validation.isValid) throw new Error(validation.error);
      const output = await generateAIResponse({
        prompt: result.prompt,
        systemInstruction: result.systemInstruction,
        byokConfig: frozen,
        frozenGeneration: result.generation,
        maxOutputTokens: 1024,
        json: true,
        signal: AbortSignal.any([signal, AbortSignal.timeout(90000)]),
      });
      signal.throwIfAborted();
      let parsed: unknown;
      try {
        parsed = JSON.parse(output);
      } catch {
        throw new Error('A continuação não foi concluída em formato válido.');
      }
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        Object.keys(parsed).join(',') !== 'text' ||
        typeof (parsed as { text?: unknown }).text !== 'string'
      )
        throw new Error('Continuação inválida.');
      result = await call<Response>('completeLiteraryAutocomplete', {
        target,
        requestId,
        text: (parsed as { text: string }).text,
      });
      signal.throwIfAborted();
    }
    if (
      result.state !== 'ready' ||
      result.requestId !== requestId ||
      result.beforeHash !== beforeHash ||
      result.chapterId !== input.chapterId ||
      typeof result.text !== 'string' ||
      !result.text.trim() ||
      result.text.length > 1200 ||
      typeof result.expiresAt !== 'number' ||
      result.expiresAt <= Date.now()
    )
      throw new Error(
        'A sugestão expirou ou o texto e as fontes mudaram. Continue escrevendo para gerar outra.',
      );
    return {
      requestId,
      bookId: input.bookId,
      chapterId: input.chapterId,
      beforeHash,
      text: result.text,
      expiresAt: result.expiresAt,
      applyCost: result.applyCost ?? (generation.provider === 'platform' ? 1 : 0),
      editorial:
        result.editorial == null ? null : normalizeLiteraryWritingSnapshot(result.editorial),
    };
  } catch (cause) {
    cancel();
    throw cause;
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}
export function applyLiteraryAutocomplete(
  scope: AutocompleteScope,
  requestId: string,
  operationId: string,
  after: string,
) {
  return call<AutocompleteApplication>('applyLiteraryAutocomplete', {
    target: { kind: 'book', id: scope.bookId },
    requestId,
    operationId,
    after,
  });
}
export type AutocompleteOutcome =
  | { state: 'unconfirmed' }
  | { state: 'canceled' }
  | { state: 'confirmed'; receipt: AutocompleteApplication };
export const getLiteraryAutocompleteApplication = (scope: AutocompleteScope, operationId: string) =>
  call<AutocompleteOutcome>('getLiteraryAutocompleteApplication', {
    target: { kind: 'book', id: scope.bookId },
    operationId,
  });
export const abandonLiteraryAutocompleteApplication = (
  scope: AutocompleteScope,
  requestId: string,
  operationId: string,
) =>
  call<AutocompleteOutcome>('abandonLiteraryAutocompleteApplication', {
    target: { kind: 'book', id: scope.bookId },
    requestId,
    operationId,
  });
export function isDefinitiveAutocompleteFailure(cause: unknown) {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    [
      'functions/invalid-argument',
      'functions/failed-precondition',
      'functions/not-found',
      'functions/permission-denied',
      'functions/unauthenticated',
      'functions/resource-exhausted',
    ].includes(String(cause.code))
  );
}
