import { useState } from 'react';
import { Input, Textarea } from '@/shared/ui';
import type {
  NarrativeItem,
  NarrativeResource,
  NarrativeTarget,
  CreateNarrativeItemInput,
} from '../model/narrative';
import { narrativeSource } from '../model/narrative';
import {
  createNarrativeItem,
  getNarrativeItem,
  updateNarrativeItem,
} from '../services/narrativePlanningService';
import { NarrativeOperationDialog } from './NarrativeOperationDialog';
import styles from './Narrative.module.css';
export function NarrativeItemDialog({
  target,
  resource,
  item,
  onClose,
  onSuccess,
}: {
  target: NarrativeTarget;
  resource: NarrativeResource;
  item?: NarrativeItem;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [title, setTitle] = useState(item?.title ?? '');
  const [initialState, setInitialState] = useState(item?.kind === 'arc' ? item.initialState : '');
  const [objective, setObjective] = useState(item?.kind === 'arc' ? item.objective : '');
  const [plannedOutcome, setPlannedOutcome] = useState(
    item?.kind === 'arc' ? item.plannedOutcome : '',
  );
  const [description, setDescription] = useState(item?.kind === 'event' ? item.description : '');
  const [dateLabel, setDateLabel] = useState(item?.kind === 'event' ? item.dateLabel : '');
  const [notes, setNotes] = useState(item?.kind === 'milestone' ? item.notes : '');
  const [revision, setRevision] = useState(item?.revision ?? 0);
  const [remote, setRemote] = useState<NarrativeItem | null>(null);
  const kindLabel = { arc: 'arco', event: 'evento', milestone: 'marco' }[resource.kind];
  const fields =
    resource.kind === 'arc'
      ? { initialState, objective, plannedOutcome }
      : resource.kind === 'event'
        ? { description, dateLabel }
        : { notes };
  return (
    <NarrativeOperationDialog
      title={(item ? 'Editar ' : 'Novo ') + kindLabel}
      description="Planejamento privado. A prosa e a ordem do manuscrito permanecem independentes."
      valid={Boolean(title.trim())}
      onClose={onClose}
      onSuccess={onSuccess}
      onCompare={
        item
          ? async () => {
              const current = await getNarrativeItem({ target, source: narrativeSource(item) });
              if (!current || current.deleting) throw new Error('Item indisponível.');
              setRemote(current);
              setRevision(current.revision);
            }
          : undefined
      }
      buildOperation={(operationId) => {
        if (item) {
          const input = {
            target,
            source: narrativeSource(item),
            operationId,
            expectedRevision: revision,
            patch: { title, ...fields },
          };
          return () => updateNarrativeItem(input);
        }
        const base = { target, operationId, title };
        const input: CreateNarrativeItemInput =
          resource.kind === 'arc'
            ? { ...base, resource: { kind: 'arc' }, initialState, objective, plannedOutcome }
            : resource.kind === 'event'
              ? { ...base, resource: { kind: 'event' }, description, dateLabel }
              : { ...base, resource, notes };
        return () => createNarrativeItem(input);
      }}
    >
      {(locked) => (
        <div className={styles.form}>
          <Input
            label="Título"
            value={title}
            required
            maxLength={300}
            disabled={locked}
            onChange={(e) => setTitle(e.target.value)}
          />
          {resource.kind === 'arc' && (
            <>
              <Textarea
                label="Estado inicial"
                value={initialState}
                maxLength={4000}
                disabled={locked}
                onChange={(e) => setInitialState(e.target.value)}
              />
              <Textarea
                label="Objetivo"
                value={objective}
                maxLength={4000}
                disabled={locked}
                onChange={(e) => setObjective(e.target.value)}
              />
              <Textarea
                label="Desfecho planejado"
                value={plannedOutcome}
                maxLength={4000}
                disabled={locked}
                onChange={(e) => setPlannedOutcome(e.target.value)}
              />
            </>
          )}
          {resource.kind === 'event' && (
            <>
              <Input
                label="Data livre (opcional)"
                placeholder="Ex.: 3º dia do inverno"
                value={dateLabel}
                maxLength={300}
                disabled={locked}
                onChange={(e) => setDateLabel(e.target.value)}
              />
              <Textarea
                label="Descrição"
                value={description}
                maxLength={4000}
                disabled={locked}
                onChange={(e) => setDescription(e.target.value)}
              />
            </>
          )}
          {resource.kind === 'milestone' && (
            <Textarea
              label="Notas do marco"
              value={notes}
              maxLength={4000}
              disabled={locked}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
          {remote && (
            <section className={styles.remote} aria-label="Dados atuais">
              <h3>Dados atuais · revisão {remote.revision}</h3>
              <p>{remote.title}</p>
              {remote.kind === 'arc' ? (
                <>
                  <p>{remote.initialState}</p>
                  <p>{remote.objective}</p>
                  <p>{remote.plannedOutcome}</p>
                </>
              ) : remote.kind === 'event' ? (
                <>
                  <p>{remote.dateLabel || 'Sem data'}</p>
                  <p>{remote.description}</p>
                </>
              ) : (
                <p>{remote.notes}</p>
              )}
              <p>Seu preenchimento foi preservado nos campos acima.</p>
            </section>
          )}
        </div>
      )}
    </NarrativeOperationDialog>
  );
}
