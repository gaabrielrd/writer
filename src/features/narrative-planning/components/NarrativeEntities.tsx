import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { sceneRoute, type SceneReference } from '@/features/scenes';
import { Alert, Badge, Button } from '@/shared/ui';
import type {
  NarrativeContext,
  NarrativeSource,
  NarrativeSummary,
  EntitySceneLink,
} from '../model/narrative';
import { narrativeSource } from '../model/narrative';
import { listEntityNarrativeItems, listEntityScenes } from '../services/narrativePlanningService';
import { useNarrativePage } from '../hooks/useNarrativePage';
import { LoreOptions } from './NarrativeReferences';
import { NarrativePageFeedback } from './NarrativePageFeedback';
import { NarrativeJobDialog } from './NarrativeJobDialog';
import styles from './Narrative.module.css';
export function NarrativeEntities({
  context,
  onChange,
  onOpen,
}: {
  context: NarrativeContext;
  onChange: () => void;
  onOpen: (source: NarrativeSource) => void;
}) {
  const [selected, setSelected] = useState<{ reference: SceneReference; label: string } | null>(
    null,
  );
  const [preparing, setPreparing] = useState(false);
  return (
    <section className={styles.section} aria-label="Entidades relacionadas">
      <h3>Entidades</h3>
      <p className={styles.hint}>
        Consulte vínculos explícitos. Encontrar um nome no texto não confirma participação nem cria
        cânone.
      </p>
      <LoreOptions
        context={context}
        onSelect={(reference, label) => setSelected({ reference, label })}
      />
      {!context.entityIndexReady && (
        <Alert variant="info">
          As referências de cenas existentes precisam ser preparadas antes desta consulta.{' '}
          <Button variant="outline" onClick={() => setPreparing(true)}>
            {context.entityIndexOperationId ? 'Retomar preparação' : 'Preparar cenas vinculadas'}
          </Button>
        </Alert>
      )}
      {selected && (
        <EntityResults
          key={JSON.stringify(selected.reference) + ':' + context.entityIndexReady}
          context={context}
          reference={selected.reference}
          label={selected.label}
          onOpen={onOpen}
        />
      )}
      {preparing && (
        <NarrativeJobDialog
          target={context.target}
          choice={{ kind: 'prepare-entity-scenes' }}
          operationId={context.entityIndexOperationId}
          onClose={() => setPreparing(false)}
          onSuccess={() => {
            setPreparing(false);
            onChange();
          }}
        />
      )}
    </section>
  );
}
function EntityResults({
  context,
  reference,
  label,
  onOpen,
}: {
  context: NarrativeContext;
  reference: SceneReference;
  label: string;
  onOpen: (source: NarrativeSource) => void;
}) {
  const location = useLocation();
  const items = useNarrativePage<NarrativeSummary>(
    'related:' + JSON.stringify(reference) + ':' + context.projectRevision,
    (cursor) => listEntityNarrativeItems({ target: context.target, reference, cursor, limit: 25 }),
    (value) => JSON.stringify(narrativeSource(value)),
  );
  return (
    <>
      <h3>{label}</h3>
      <h4>Itens relacionados</h4>
      <ul className={styles.list}>
        {items.items.map((item) => (
          <li className={styles.row} key={JSON.stringify(narrativeSource(item))}>
            <span>{item.title}</span>
            {!item.deleting && (
              <Button variant="ghost" onClick={() => onOpen(narrativeSource(item))}>
                Abrir item relacionado
              </Button>
            )}
            {item.deleting && <Badge variant="secondary">Em exclusão</Badge>}
          </li>
        ))}
      </ul>
      <NarrativePageFeedback
        page={items}
        emptyLabel="Nenhum item vinculado a esta entidade"
        moreLabel="Carregar mais itens relacionados"
      />
      <h4>Cenas vinculadas</h4>
      {context.entityIndexReady ? (
        <EntityScenes
          context={context}
          reference={reference}
          returnTo={location.pathname + location.search}
        />
      ) : (
        <p role="status">
          Aguardando preparação das referências. A consulta ainda não está completa.
        </p>
      )}
    </>
  );
}
function EntityScenes({
  context,
  reference,
  returnTo,
}: {
  context: NarrativeContext;
  reference: SceneReference;
  returnTo: string;
}) {
  const scenes = useNarrativePage<EntitySceneLink>(
    'entity-scenes:' + JSON.stringify(reference) + ':' + context.sceneRevision,
    (cursor) => listEntityScenes({ target: context.target, reference, cursor, limit: 25 }),
    (value) => value.id,
  );
  return (
    <>
      <ul className={styles.list}>
        {scenes.items.map((scene) => (
          <li className={styles.row} key={scene.id}>
            <span>
              {scene.available ? (scene.title ?? 'Cena') : 'Cena indisponível'}{' '}
              {scene.available && scene.archived && <Badge variant="secondary">Arquivada</Badge>}
            </span>
            {scene.available && (
              <Link to={sceneRoute(context.target, scene.sceneId)} state={{ returnTo }}>
                Abrir cena vinculada
              </Link>
            )}
          </li>
        ))}
      </ul>
      <NarrativePageFeedback
        page={scenes}
        emptyLabel="Nenhuma cena vinculada a esta entidade"
        moreLabel="Carregar mais cenas vinculadas"
      />
    </>
  );
}
