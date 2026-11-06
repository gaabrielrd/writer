import type { LiteraryWritingSnapshot } from '../services/literaryWritingService';
import styles from './EditorialContractPanel.module.css';
export function WritingContextPreview({ snapshot }: { snapshot: LiteraryWritingSnapshot }) {
  return (
    <details className={styles.panel}>
      <summary>
        Guia e planejamento utilizados ·{' '}
        {snapshot.manifest.contractRevision
          ? 'contrato revisão ' + snapshot.manifest.contractRevision
          : 'sem contrato salvo'}
      </summary>
      <p>Este contexto cobre as fontes editoriais selecionadas.</p>
      {!snapshot.coverage.completeForSelection && (
        <p>
          Recorte compacto: {snapshot.coverage.omittedFields.length} campos ou fontes de apoio
          omitidos. As restrições essenciais foram preservadas.
        </p>
      )}
      <details>
        <summary>Orientações efetivas</summary>
        <p className={styles.contextText}>{snapshot.instruction}</p>
      </details>
      {snapshot.documents.map((document) => (
        <details key={document.id}>
          <summary>{document.label}</summary>
          <p className={styles.contextText}>{document.text}</p>
        </details>
      ))}
    </details>
  );
}
