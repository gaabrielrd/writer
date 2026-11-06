import { useRef, useState } from 'react';
import { Alert, Button, Dropdown, EmptyState } from '@/shared/ui';
import {
  listLiteraryReferences,
  listLiteraryVolumeBooks,
  referenceLabels,
  type LiteraryReference,
  type LiteraryReferenceKind,
  type LiteraryReferencePage,
} from '@/features/literary-production';
import styles from './BookEditorialRestorePanel.module.css';
export interface SelectedEditorialReference {
  reference: LiteraryReference;
  label: string | null;
  available?: boolean;
  changed?: boolean;
  currentReference?: LiteraryReference | null;
}
export const editorialReferenceKey = (ref: LiteraryReference) =>
  JSON.stringify([ref.kind, ref.scopeId, ref.id]);
export function EditorialRestoreReferencePicker({
  bookId,
  value,
  onChange,
  disabled,
  guard,
}: {
  bookId: string;
  value: SelectedEditorialReference[];
  onChange: (value: SelectedEditorialReference[]) => void;
  disabled: boolean;
  guard: () => void;
}) {
  const [kind, setKind] = useState<LiteraryReferenceKind>('chapter');
  const [purpose, setPurpose] = useState<'source' | 'subject'>('source');
  const [volume, setVolume] = useState(''),
    [unit, setUnit] = useState<'act' | 'chapter' | 'scene' | 'arc' | 'event'>('chapter');
  const [books, setBooks] = useState<Awaited<ReturnType<typeof listLiteraryVolumeBooks>> | null>(
    null,
  );
  const [page, setPage] = useState<LiteraryReferencePage | null>(null),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null),
    epoch = useRef(0);
  const invalidate = () => {
    epoch.current++;
    setPage(null);
    setBusy(false);
    setError(null);
  };
  async function load(after: string | null = null, volumes = false) {
    if (disabled || busy) return;
    const ticket = ++epoch.current;
    setBusy(true);
    setError(null);
    try {
      guard();
      if (volumes) {
        const result = await listLiteraryVolumeBooks(bookId, after);
        guard();
        if (epoch.current === ticket)
          setBooks((previous) => ({
            ...result,
            items: after ? [...(previous?.items ?? []), ...result.items] : result.items,
          }));
      } else {
        const result = await listLiteraryReferences(
          bookId,
          kind,
          after,
          purpose,
          kind === 'volumeUnit' ? { bookId: volume, kind: unit } : undefined,
        );
        guard();
        if (epoch.current === ticket)
          setPage((previous) => ({
            ...result,
            items: after ? [...(previous?.items ?? []), ...result.items] : result.items,
          }));
      }
    } catch (cause) {
      if (epoch.current === ticket)
        setError(cause instanceof Error ? cause.message : 'Fontes indisponíveis.');
    } finally {
      if (epoch.current === ticket) setBusy(false);
    }
  }
  return (
    <div className={styles.picker}>
      <h4>Referências escolhidas</h4>
      {value.length === 0 ? (
        <p>Nenhuma referência escolhida.</p>
      ) : (
        <ul>
          {value.map((row, index) => (
            <li key={editorialReferenceKey(row.reference)}>
              <span>
                {row.label ?? 'Referência atual sem nome disponível'} ·{' '}
                {referenceLabels[row.reference.kind]} ·{' '}
                {row.reference.purpose === 'subject' ? 'unidade planejada' : 'fonte'}
              </span>
              {row.changed && row.currentReference && (
                <Button
                  variant="outline"
                  disabled={disabled}
                  onClick={() =>
                    onChange(
                      value.map((item, at) =>
                        at === index
                          ? {
                              reference: row.currentReference!,
                              label: row.label,
                              available: true,
                              changed: false,
                            }
                          : item,
                      ),
                    )
                  }
                >
                  Usar versão atual desta fonte
                </Button>
              )}
              {(row.available === false || row.changed) && (
                <span>Requer nova seleção ou atualização.</span>
              )}
              <Button
                variant="ghost"
                disabled={disabled}
                onClick={() => onChange(value.filter((_, at) => at !== index))}
              >
                Remover referência
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && <Alert variant="destructive">{error}</Alert>}
      <div className={styles.fields}>
        <Dropdown
          mode="select"
          label="Tipo de referência"
          value={kind}
          disabled={disabled || busy}
          options={Object.entries(referenceLabels).map(([value, label]) => ({ value, label }))}
          onValueChange={(next) => {
            invalidate();
            setKind(next as LiteraryReferenceKind);
            if (next === 'volumeUnit') setPurpose('source');
          }}
        />
        <Dropdown
          mode="select"
          label="Função da referência"
          value={purpose}
          disabled={disabled || busy || kind === 'volumeUnit'}
          options={[
            { value: 'source', label: 'Fonte para o planejamento' },
            { value: 'subject', label: 'Unidade que este plano prepara' },
          ]}
          onValueChange={(next) => {
            invalidate();
            setPurpose(next as 'source' | 'subject');
          }}
        />
      </div>
      {kind === 'volumeUnit' && (
        <>
          <Button
            variant="outline"
            disabled={disabled || busy}
            onClick={() => void load(null, true)}
          >
            Consultar meus volumes
          </Button>
          {books && (
            <Dropdown
              mode="select"
              label="Volume de origem"
              value={volume}
              disabled={disabled || busy}
              options={books.items.map((book) => ({ value: book.id, label: book.title }))}
              onValueChange={(next) => {
                invalidate();
                setVolume(next);
              }}
            />
          )}
          {books?.nextAfterId && (
            <Button
              variant="outline"
              disabled={disabled || busy}
              onClick={() => void load(books.nextAfterId, true)}
            >
              Mais volumes
            </Button>
          )}
          <Dropdown
            mode="select"
            label="Unidade de origem"
            value={unit}
            disabled={disabled || busy}
            options={(['act', 'chapter', 'scene', 'arc', 'event'] as const).map((value) => ({
              value,
              label: referenceLabels[value],
            }))}
            onValueChange={(next) => {
              invalidate();
              setUnit(next as typeof unit);
            }}
          />
        </>
      )}
      <Button
        variant="outline"
        disabled={disabled || busy || (kind === 'volumeUnit' && !volume)}
        onClick={() => void load()}
      >
        {busy ? 'Consultando referências…' : 'Consultar referências atuais'}
      </Button>
      {page?.items.length === 0 && (
        <EmptyState
          title="Nenhuma referência disponível"
          description="Escolha outro tipo ou confira as unidades deste livro."
        />
      )}
      {page?.items.map((row) => (
        <Button
          key={editorialReferenceKey(row.reference)}
          variant="outline"
          disabled={
            disabled ||
            busy ||
            value.length >= 12 ||
            value.some(
              (item) =>
                editorialReferenceKey(item.reference) === editorialReferenceKey(row.reference),
            )
          }
          onClick={() => onChange([...value, row])}
        >
          Vincular {row.label}
        </Button>
      ))}
      {page?.nextAfterId && (
        <Button
          variant="outline"
          disabled={disabled || busy}
          onClick={() => void load(page.nextAfterId)}
        >
          Mais referências
        </Button>
      )}
    </div>
  );
}
