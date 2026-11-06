import { LiteraryImpactPanel } from './LiteraryImpactPanel';
import { LiterarySequencePanel } from './LiterarySequencePanel';
import { LiteraryBookMapPanel } from './LiteraryBookMapPanel';
import type { EditorialState } from '../model/editorial';
import { useState } from 'react';
import { Button } from '@/shared/ui';
import { EditorialContractPanel } from './EditorialContractPanel';
import { LiteraryRecoveryPanel } from './LiteraryRecoveryPanel';
import { LiteraryPlanningPanel } from './LiteraryPlanningPanel';
import { LiteraryDraftGuard } from './LiteraryDraftGuard';
import { LiteraryPreparationPanel } from './LiteraryPreparationPanel';
import { LiteraryIntegrationPanel } from './LiteraryIntegrationPanel';
import { LiteraryProgressPanel } from './LiteraryProgressPanel';
import { LiteraryPublicationPanel } from './LiteraryPublicationPanel';
import styles from './EditorialContractPanel.module.css';

export function LiteraryProductionPanel({
  bookId,
  captureGeneration,
  onPublicationChange,
  initialView,
}: {
  bookId: string;
  captureGeneration?: () => unknown;
  onPublicationChange?: () => void;
  initialView?: 'publication';
}) {
  const [view, setView] = useState<
    | 'contract'
    | 'planning'
    | 'map'
    | 'impact'
    | 'preparation'
    | 'integration'
    | 'progress'
    | 'publication'
    | 'sequence'
  >(initialView ?? 'contract');
  const [visited, setVisited] = useState({
    contract: true,
    planning: false,
    map: false,
    impact: false,
    preparation: false,
    sequence: false,
    integration: false,
    progress: false,
    publication: initialView === 'publication',
  });
  const [editorialState, setEditorialState] = useState<EditorialState | null>(null);
  const [contractWork, setContractWork] = useState({ dirty: false, pending: false });
  const [planningWork, setPlanningWork] = useState({ dirty: false, pending: false });
  const [preparationWork, setPreparationWork] = useState({ dirty: false, pending: false });
  const [integrationWork, setIntegrationWork] = useState({ dirty: false, pending: false });
  const [progressWork, setProgressWork] = useState({ dirty: false, pending: false });
  const [sequenceWork, setSequenceWork] = useState({ dirty: false, pending: false });
  const [impactWork, setImpactWork] = useState({ dirty: false, pending: false });
  const [publicationWork, setPublicationWork] = useState({ dirty: false, pending: false });
  return (
    <div className={`${styles.panel} ${styles.production}`}>
      <LiteraryDraftGuard
        dirty={
          impactWork.dirty ||
          sequenceWork.dirty ||
          contractWork.dirty ||
          planningWork.dirty ||
          preparationWork.dirty ||
          integrationWork.dirty ||
          progressWork.dirty ||
          publicationWork.dirty
        }
        pending={
          impactWork.pending ||
          sequenceWork.pending ||
          contractWork.pending ||
          planningWork.pending ||
          preparationWork.pending ||
          integrationWork.pending ||
          progressWork.pending ||
          publicationWork.pending
        }
      />
      <LiteraryRecoveryPanel bookId={bookId} />
      <div className={styles.actions} aria-label="Áreas de produção literária">
        <Button
          variant={view === 'impact' ? 'primary' : 'outline'}
          aria-pressed={view === 'impact'}
          onClick={() => {
            setVisited({ ...visited, impact: true });
            setView('impact');
          }}
        >
          Impacto editorial
        </Button>
        <Button
          variant={view === 'contract' ? 'primary' : 'outline'}
          aria-pressed={view === 'contract'}
          onClick={() => setView('contract')}
        >
          Contrato e decisões
        </Button>
        <Button
          variant={view === 'planning' ? 'primary' : 'outline'}
          aria-pressed={view === 'planning'}
          onClick={() => {
            setVisited({ ...visited, planning: true });
            setView('planning');
          }}
        >
          Planejamento
        </Button>
        <Button
          variant={view === 'map' ? 'primary' : 'outline'}
          aria-pressed={view === 'map'}
          onClick={() => {
            setVisited({ ...visited, map: true });
            setView('map');
          }}
        >
          Mapa global do livro
        </Button>
        <Button
          variant={view === 'preparation' ? 'primary' : 'outline'}
          aria-pressed={view === 'preparation'}
          onClick={() => {
            setVisited({ ...visited, preparation: true });
            setView('preparation');
          }}
        >
          Preparação do capítulo
        </Button>
        <Button
          variant={view === 'sequence' ? 'primary' : 'outline'}
          aria-pressed={view === 'sequence'}
          onClick={() => {
            setVisited({ ...visited, sequence: true });
            setView('sequence');
          }}
        >
          Sequência de capítulos
        </Button>
        <Button
          variant={view === 'integration' ? 'primary' : 'outline'}
          aria-pressed={view === 'integration'}
          onClick={() => {
            setVisited({ ...visited, integration: true });
            setView('integration');
          }}
        >
          Integração de atos e livro
        </Button>
        <Button
          variant={view === 'progress' ? 'primary' : 'outline'}
          aria-pressed={view === 'progress'}
          onClick={() => {
            setVisited({ ...visited, progress: true });
            setView('progress');
          }}
        >
          Progresso por artefato
        </Button>
        <Button
          variant={view === 'publication' ? 'primary' : 'outline'}
          aria-pressed={view === 'publication'}
          onClick={() => {
            setVisited({ ...visited, publication: true });
            setView('publication');
          }}
        >
          Publicação
        </Button>
      </div>
      {visited.publication && (
        <div hidden={view !== 'publication'}>
          <LiteraryPublicationPanel
            bookId={bookId}
            editorialState={editorialState}
            onWorkChange={setPublicationWork}
            onPublicationChange={onPublicationChange}
          />
        </div>
      )}
      {visited.impact && (
        <div hidden={view !== 'impact'}>
          <LiteraryImpactPanel bookId={bookId} onWorkChange={setImpactWork} />
        </div>
      )}
      {visited.map && (
        <div hidden={view !== 'map'}>
          <LiteraryBookMapPanel bookId={bookId} />
        </div>
      )}
      {visited.progress && (
        <div hidden={view !== 'progress'}>
          <LiteraryProgressPanel bookId={bookId} onWorkChange={setProgressWork} />
        </div>
      )}
      <div hidden={view !== 'contract'}>
        <EditorialContractPanel
          bookId={bookId}
          onWorkChange={setContractWork}
          onStateChange={setEditorialState}
          captureGeneration={captureGeneration}
        />
      </div>
      {visited.planning && (
        <div hidden={view !== 'planning'}>
          <LiteraryPlanningPanel
            bookId={bookId}
            onWorkChange={setPlanningWork}
            captureGeneration={captureGeneration}
          />
        </div>
      )}
      {visited.preparation && (
        <div hidden={view !== 'preparation'}>
          <LiteraryPreparationPanel
            editorialState={editorialState}
            bookId={bookId}
            collaborationMode={editorialState?.contract.collaborationPolicy?.mode ?? 'supervised'}
            onWorkChange={setPreparationWork}
            captureGeneration={captureGeneration}
          />
        </div>
      )}
      {visited.sequence && (
        <div hidden={view !== 'sequence'}>
          <LiterarySequencePanel
            editorialState={editorialState}
            bookId={bookId}
            collaborationMode={editorialState?.contract.collaborationPolicy?.mode ?? 'supervised'}
            captureGeneration={captureGeneration}
            onWorkChange={setSequenceWork}
          />
        </div>
      )}
      {visited.integration && (
        <div hidden={view !== 'integration'}>
          <LiteraryIntegrationPanel
            bookId={bookId}
            onWorkChange={setIntegrationWork}
            captureGeneration={captureGeneration}
          />
        </div>
      )}
    </div>
  );
}
