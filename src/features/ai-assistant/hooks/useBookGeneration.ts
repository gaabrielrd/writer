import { useEffect, useRef, useState } from 'react';
import {
  acceptBookAsset,
  discardBookAsset,
  generateBookAsset,
  quoteBookGeneration,
  type BookGenerationContext,
  type BookGenerationQuote,
  type BookAssetKind,
  type BookAssetSuggestion,
  type AcceptedBookAsset,
} from '../services/bookGenerationService';

export function useBookGeneration(
  context: BookGenerationContext,
  credits: number,
  onAccepted: (asset: AcceptedBookAsset) => void,
) {
  const [quote, setQuote] = useState<BookGenerationQuote | null>(null);
  const [suggestion, setSuggestion] = useState<BookAssetSuggestion | null>(null);
  const [operation, setOperation] = useState<'generate' | 'accept' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const version = useRef(0);
  const lock = useRef(false);
  const offered = useRef<BookAssetSuggestion | null>(null);
  useEffect(() => {
    let active = true;
    void quoteBookGeneration()
      .then((value) => {
        if (active) setQuote(value);
      })
      .catch(() => {
        if (active)
          setAvailabilityError('A IA está indisponível. Você pode criar o livro manualmente.');
      });
    return () => {
      active = false;
      version.current += 1;
      if (offered.current) void discardBookAsset(offered.current.id).catch(() => {});
    };
  }, []);

  function invalidate() {
    version.current += 1;
    lock.current = false;
    if (offered.current) void discardBookAsset(offered.current.id).catch(() => {});
    offered.current = null;
    setSuggestion(null);
    setOperation(null);
    setError(null);
  }
  async function generate(kind: BookAssetKind) {
    if (lock.current || !quote) return;
    if (credits < quote[kind]) {
      setError('Saldo de créditos insuficiente.');
      return;
    }
    invalidate();
    lock.current = true;
    const current = version.current;
    setOperation('generate');
    try {
      const result = await generateBookAsset(context, kind, crypto.randomUUID());
      if (current !== version.current) {
        void discardBookAsset(result.id).catch(() => {});
        return;
      }
      if (
        (kind === 'synopsis' && !result.text?.trim()) ||
        (kind === 'cover' && !result.previewUrl?.startsWith('data:image/png;base64,'))
      )
        throw new Error('A IA não retornou um resultado válido. Gere outra sugestão.');
      offered.current = result;
      setSuggestion(result);
    } catch (failure) {
      if (current === version.current)
        setError(failure instanceof Error ? failure.message : 'Falha na geração.');
    } finally {
      if (current === version.current) {
        lock.current = false;
        setOperation(null);
      }
    }
  }
  async function accept() {
    if (lock.current || !suggestion) return;
    lock.current = true;
    const current = version.current;
    setOperation('accept');
    setError(null);
    try {
      const result = await acceptBookAsset(suggestion.id);
      if (current !== version.current) return;
      onAccepted(result);
      offered.current = null;
      setSuggestion(null);
    } catch (failure) {
      if (current === version.current)
        setError(failure instanceof Error ? failure.message : 'Falha no aceite.');
    } finally {
      if (current === version.current) {
        lock.current = false;
        setOperation(null);
      }
    }
  }
  return {
    quote,
    suggestion,
    operation,
    error: error ?? availabilityError,
    generate,
    accept,
    invalidate,
  };
}
