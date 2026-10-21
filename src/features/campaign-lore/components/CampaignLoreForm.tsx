import { useLayoutEffect, useRef, useState } from 'react';
import { Alert, Button, Dropdown, Input, LoadingState, Textarea } from '@/shared/ui';
import type {
  CampaignLoreEntityInput,
  CampaignLoreEnvelope,
  CampaignLoreScope,
  CampaignLoreSummary,
} from '../model/campaignLore';
import * as api from '../services/campaignLoreService';
import styles from './CampaignLore.module.css';
interface Props {
  entity: CampaignLoreEntityInput;
  names: Record<string, string>;
  sourceKey: string;
  disabled: boolean;
  scope: CampaignLoreScope;
  uid: string;
  projectionToken: string;
  onChange: (entity: CampaignLoreEntityInput) => void;
  onDenied: () => void;
  onObserved: (value: CampaignLoreEnvelope) => void;
}
export function CampaignLoreForm({
  entity,
  names,
  sourceKey,
  disabled,
  scope,
  uid,
  projectionToken,
  onChange,
  onDenied,
  onObserved,
}: Props) {
  const [picking, setPicking] = useState(false),
    [items, setItems] = useState<CampaignLoreSummary[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const generation = useRef(0),
    scopeKey = JSON.stringify([uid, scope, projectionToken]);
  const identity = useRef(scopeKey),
    alive = useRef(true);
  useLayoutEffect(() => {
    identity.current = scopeKey;
  });
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function load(next?: string) {
    const current = ++generation.current,
      key = scopeKey;
    setLoading(true);
    setError('');
    try {
      const page = await api.listCampaignLore({
        ...scope,
        view: 'active',
        ...(next ? { cursor: next } : {}),
      });
      if (!alive.current || current !== generation.current || identity.current !== key) return;
      api.validateEnvelope(page, uid, scope.campaignId, scope.baseId, scope.campaignToken);
      onObserved(page);
      if (page.projectionToken !== projectionToken)
        throw new Error('O lore mudou. Feche a seleção e consulte a ficha atual antes de editar.');
      page.items.forEach(api.validateSummary);
      setItems((old) =>
        next
          ? [...old, ...page.items.filter((i) => !old.some((o) => o.sourceKey === i.sourceKey))]
          : page.items,
      );
      setCursor(page.nextCursor);
    } catch (cause) {
      if (alive.current && current === generation.current && identity.current === key) {
        setItems([]);
        setCursor(null);
        setError(api.loreMessage(cause));
        if (api.gateDenied(cause)) onDenied();
      }
    } finally {
      if (alive.current && current === generation.current && identity.current === key)
        setLoading(false);
    }
  }
  const set = (key: keyof CampaignLoreEntityInput, value: unknown) =>
    onChange({ ...entity, [key]: value });
  return (
    <div className={styles.form}>
      <Input
        label="Nome da ficha"
        value={entity.name}
        disabled={disabled}
        onChange={(e) => set('name', e.target.value)}
      />
      <Dropdown
        mode="select"
        label="Categoria da ficha"
        value={entity.category}
        options={api.loreCategories}
        disabled={disabled}
        onValueChange={(v) => set('category', v)}
      />
      <Textarea
        label="Resumo da ficha"
        value={entity.summary}
        disabled={disabled}
        onChange={(e) => set('summary', e.target.value)}
      />
      <fieldset disabled={disabled} className={styles.group}>
        <legend>Outros nomes</legend>
        {entity.aliases.map((alias, index) => (
          <div className={styles.row} key={index}>
            <Input
              label={'Outro nome ' + (index + 1)}
              value={alias}
              onChange={(e) =>
                set(
                  'aliases',
                  entity.aliases.map((v, i) => (i === index ? e.target.value : v)),
                )
              }
            />
            <Button
              variant="outline"
              onClick={() =>
                set(
                  'aliases',
                  entity.aliases.filter((_, i) => i !== index),
                )
              }
              aria-label={'Remover outro nome ' + (index + 1)}
            >
              Remover
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          disabled={disabled || entity.aliases.length >= 20}
          onClick={() => set('aliases', [...entity.aliases, ''])}
        >
          Adicionar outro nome
        </Button>
      </fieldset>
      <Textarea
        label="Detalhes da ficha"
        value={entity.details}
        disabled={disabled}
        onChange={(e) => set('details', e.target.value)}
      />
      {(
        [
          { key: 'appearance', label: 'Aparência' },
          { key: 'personality', label: 'Personalidade' },
          { key: 'history', label: 'História' },
          { key: 'notes', label: 'Anotações da ficha' },
        ] as const
      ).map(({ key, label }) => (
        <Textarea
          key={key}
          label={label}
          value={entity.structuredDetails[key]}
          disabled={disabled}
          onChange={(e) =>
            set('structuredDetails', { ...entity.structuredDetails, [key]: e.target.value })
          }
        />
      ))}
      <fieldset disabled={disabled} className={styles.group}>
        <legend>Relações nesta campanha</legend>
        <p className={styles.meta}>
          Salvar substitui a ficha inteira e suas relações. Fichas indisponíveis não aparecem na
          seleção.
        </p>
        {entity.relations.map((relation, index) => (
          <div key={index} className={styles.group}>
            <p>{names[relation.targetKey] ?? 'Ficha vinculada'}</p>
            <Input
              label={'Tipo da relação ' + (index + 1)}
              value={relation.relationType}
              onChange={(e) =>
                set(
                  'relations',
                  entity.relations.map((r, i) =>
                    i === index ? { ...r, relationType: e.target.value } : r,
                  ),
                )
              }
            />
            <Textarea
              label={'Descrição da relação ' + (index + 1)}
              value={relation.description}
              onChange={(e) =>
                set(
                  'relations',
                  entity.relations.map((r, i) =>
                    i === index ? { ...r, description: e.target.value } : r,
                  ),
                )
              }
            />
            <Button
              variant="outline"
              onClick={() =>
                set(
                  'relations',
                  entity.relations.filter((_, i) => i !== index),
                )
              }
            >
              Remover relação {index + 1}
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          disabled={disabled || entity.relations.length >= 50}
          onClick={() => {
            setPicking(true);
            void load();
          }}
        >
          Selecionar ficha para relação
        </Button>
        {picking && (
          <div className={styles.group} aria-label="Fichas para relação">
            {loading && <LoadingState label="Carregando fichas para relação..." />}
            {error && (
              <Alert variant="warning">
                {error}
                <Button onClick={() => void load()}>Tentar selecionar novamente</Button>
              </Alert>
            )}
            {!items.length && !loading && !error && (
              <p>
                {cursor
                  ? 'Há outras páginas de fichas.'
                  : 'Nenhuma outra ficha disponível nesta página.'}
              </p>
            )}
            <ul className={styles.list}>
              {items
                .filter((i) => i.sourceKey !== sourceKey)
                .map((item) => (
                  <li key={item.sourceKey}>
                    <Button
                      variant="outline"
                      disabled={disabled}
                      onClick={() => {
                        names[item.sourceKey] = item.name;
                        set('relations', [
                          ...entity.relations,
                          { targetKey: item.sourceKey, relationType: '', description: '' },
                        ]);
                        setPicking(false);
                        generation.current++;
                      }}
                    >
                      {item.name}
                    </Button>
                  </li>
                ))}
            </ul>
            {cursor && (
              <Button disabled={disabled || loading} onClick={() => void load(cursor)}>
                Carregar mais fichas para relação
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                setPicking(false);
                generation.current++;
              }}
            >
              Fechar seleção
            </Button>
          </div>
        )}
      </fieldset>
    </div>
  );
}
