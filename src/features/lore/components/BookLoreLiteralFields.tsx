import { editLoreText } from '../model/loreTextEdit';
import { useState } from 'react';
import { Button, Dropdown, Textarea } from '@/shared/ui';
import { LORE_CATEGORIES, type LoreMentionEntity } from '../model/loreEntity';
import type { BookLoreEditSource, BookLoreEditChange } from '../services/bookLoreWritePlan';
import styles from './BookLoreManualEditor.module.css';
import { loreFieldLabels } from '../model/loreManualFields';
const labels = loreFieldLabels;
type Field = keyof typeof labels;
const keys = {
  appearance: 'Aparência',
  personality: 'Personalidade',
  history: 'Histórico',
  notes: 'Notas privadas',
};
type Relation = { targetEntityId: string; relationType: string; description?: string };
export function BookLoreLiteralFields({
  source,
  changes,
  onChange,
  disabled = false,
  entities = [],
}: {
  source: BookLoreEditSource;
  changes: readonly BookLoreEditChange[];
  onChange: (value: BookLoreEditChange[]) => void;
  disabled?: boolean;
  entities?: readonly LoreMentionEntity[];
}) {
  const [field, setField] = useState<Field>('name'),
    [index, setIndex] = useState(0),
    [detail, setDetail] = useState<keyof typeof keys>('appearance');
  const change = changes.find((c) => c.field === field),
    present = change ? !('remove' in change) : Object.hasOwn(source.data, field),
    value = change && 'value' in change ? change.value : source.data[field];
  function write(value: unknown) {
    onChange([...changes.filter((c) => c.field !== field), { field, value }]);
  }
  function remove() {
    onChange([...changes.filter((c) => c.field !== field), { field, remove: true }]);
  }
  const list: readonly unknown[] = present && Array.isArray(value) ? value : [],
    at = Math.min(index, Math.max(0, list.length - 1));
  function updateItem(next: unknown) {
    write(list.map((item, n) => (n === at ? next : item)));
  }
  const defaults: Record<Field, unknown> = {
    name: '',
    category: 'character',
    summary: '',
    details: '',
    aliases: [],
    structuredDetails: {},
    relations: [],
    isPublic: false,
  };
  return (
    <div className={styles.fields}>
      <Dropdown
        mode="select"
        label="Campo em edição"
        value={field}
        onValueChange={(v) => {
          setField(v as Field);
          setIndex(0);
        }}
        options={Object.entries(labels).map(([value, label]) => ({ value, label }))}
      />
      {!present ? (
        <div>
          <p>Este campo não está presente na ficha.</p>
          <Button disabled={disabled} onClick={() => write(defaults[field])}>
            Adicionar {labels[field].toLowerCase()}
          </Button>
        </div>
      ) : (
        <>
          {(['name', 'summary', 'details'] as Field[]).includes(field) && (
            <Textarea
              label={labels[field]}
              rows={field === 'name' ? 2 : 5}
              value={value as string}
              readOnly={disabled}
              onChange={(e) => write(editLoreText(value as string, e.target.value))}
            />
          )}
          {field === 'category' && (
            <Dropdown
              mode="select"
              label="Categoria"
              value={value as string}
              options={LORE_CATEGORIES}
              disabled={disabled}
              onValueChange={write}
            />
          )}
          {field === 'isPublic' && (
            <Dropdown
              mode="select"
              label="Visibilidade"
              value={String(value)}
              disabled={disabled}
              options={[
                { value: 'false', label: 'Privado' },
                { value: 'true', label: 'Visível no leitor público' },
              ]}
              onValueChange={(v) => write(v === 'true')}
            />
          )}
          {(field === 'aliases' || field === 'relations') && (
            <div className={styles.fields}>
              <p>
                {list.length} {field === 'aliases' ? 'apelidos' : 'relações'}
              </p>
              {list.length > 0 && (
                <>
                  <div className={styles.actions} role="group" aria-label="Navegar pelos itens">
                    <Button
                      variant="secondary"
                      disabled={at === 0}
                      onClick={() => setIndex(at - 1)}
                    >
                      Anterior
                    </Button>
                    <span>
                      {at + 1} de {list.length}
                    </span>
                    <Button
                      variant="secondary"
                      disabled={at + 1 === list.length}
                      onClick={() => setIndex(at + 1)}
                    >
                      Próximo
                    </Button>
                  </div>
                  {field === 'aliases' ? (
                    <Textarea
                      label="Apelido"
                      value={list[at] as string}
                      readOnly={disabled}
                      onChange={(e) => updateItem(editLoreText(list[at] as string, e.target.value))}
                    />
                  ) : (
                    (() => {
                      const r = list[at] as Relation,
                        options = entities.map((e) => ({ value: e.id, label: e.name }));
                      if (!options.some((o) => o.value === r.targetEntityId))
                        options.push({ value: r.targetEntityId, label: 'Entidade indisponível' });
                      return (
                        <>
                          <Dropdown
                            mode="select"
                            label="Destino da relação"
                            value={r.targetEntityId}
                            options={options}
                            disabled={disabled}
                            onValueChange={(v) => updateItem({ ...r, targetEntityId: v })}
                          />
                          <Textarea
                            label="Tipo de relação"
                            value={r.relationType}
                            readOnly={disabled}
                            onChange={(e) =>
                              updateItem({
                                ...r,
                                relationType: editLoreText(r.relationType, e.target.value),
                              })
                            }
                          />
                          {Object.hasOwn(r, 'description') ? (
                            <>
                              <Textarea
                                label="Descrição da relação"
                                value={r.description ?? ''}
                                readOnly={disabled}
                                onChange={(e) =>
                                  updateItem({
                                    ...r,
                                    description: editLoreText(r.description ?? '', e.target.value),
                                  })
                                }
                              />
                              <Button
                                variant="ghost"
                                disabled={disabled}
                                onClick={() => {
                                  const { description: _d, ...rest } = r;
                                  void _d;
                                  updateItem(rest);
                                }}
                              >
                                Retirar descrição
                              </Button>
                            </>
                          ) : (
                            <Button
                              disabled={disabled}
                              onClick={() => updateItem({ ...r, description: '' })}
                            >
                              Adicionar descrição
                            </Button>
                          )}
                        </>
                      );
                    })()
                  )}
                  <Button
                    variant="secondary"
                    disabled={disabled}
                    onClick={() => {
                      write(list.filter((_v, n) => n !== at));
                      setIndex(Math.max(0, at - 1));
                    }}
                  >
                    Remover item
                  </Button>
                </>
              )}
              <Button
                variant="secondary"
                disabled={disabled || (field === 'relations' && entities.length === 0)}
                onClick={() => {
                  write([
                    ...list,
                    field === 'aliases'
                      ? ''
                      : { targetEntityId: entities[0]!.id, relationType: '' },
                  ]);
                  setIndex(list.length);
                }}
              >
                Adicionar {field === 'aliases' ? 'apelido' : 'relação'}
              </Button>
            </div>
          )}
          {field === 'structuredDetails' &&
            (() => {
              const data = value as Record<string, string>;
              return (
                <>
                  <Dropdown
                    mode="select"
                    label="Seção de características"
                    value={detail}
                    options={Object.entries(keys).map(([value, label]) => ({ value, label }))}
                    onValueChange={(v) => setDetail(v as keyof typeof keys)}
                  />
                  {Object.hasOwn(data, detail) ? (
                    <>
                      <Textarea
                        label={keys[detail]}
                        value={data[detail]}
                        rows={5}
                        readOnly={disabled}
                        onChange={(e) =>
                          write({
                            ...data,
                            [detail]: editLoreText(data[detail] ?? '', e.target.value),
                          })
                        }
                      />
                      <Button
                        variant="secondary"
                        disabled={disabled}
                        onClick={() => {
                          const next = { ...data };
                          delete next[detail];
                          write(next);
                        }}
                      >
                        Retirar {keys[detail].toLowerCase()}
                      </Button>
                    </>
                  ) : (
                    <Button disabled={disabled} onClick={() => write({ ...data, [detail]: '' })}>
                      Adicionar {keys[detail].toLowerCase()}
                    </Button>
                  )}
                </>
              );
            })()}
          {!['name', 'category'].includes(field) && (
            <Button variant="ghost" disabled={disabled} onClick={remove}>
              Retirar campo da ficha
            </Button>
          )}
        </>
      )}
      {change && (
        <Button
          variant="secondary"
          disabled={disabled}
          onClick={() => onChange(changes.filter((c) => c.field !== field))}
        >
          Desfazer alteração deste campo
        </Button>
      )}
    </div>
  );
}
