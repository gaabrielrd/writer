import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Dialog, Input, Dropdown, Textarea, LoadingState } from '@/shared/ui';
import { analyzeLoreWithBYOK, useAIConfig, usesOwnKey } from '@/features/ai-assistant';
import {
  analyzeChapterLore,
  getLoreAnalysisEditorialContext,
  prepareBYOKLore,
  applyLoreAnalysis,
  matchingLoreEntities,
  loreChangeFields,
  type DetectedLoreEntity,
  type LoreAnalysis,
  type LoreAnalysisEditorialContext,
  type LoreEntity,
  type LoreChange,
} from '@/features/lore';
import { renderRichText } from '@/shared/lib';
import styles from './LoreAnalysisDialog.module.css';

interface Proposal {
  detected: DetectedLoreEntity;
  target: string;
  selected: boolean;
  fields: Set<string>;
  aliasesText?: string;
  authorEdited?: boolean;
}
interface Props {
  bookId: string;
  chapterId: string;
  content: string;
  entities: LoreEntity[];
  universeId?: string | null;
  onClose: () => void;
  onApplied: (credits: number) => void;
  onBusyChange: (busy: boolean) => void;
}
const labels = {
  name: 'Nome',
  category: 'Categoria',
  summary: 'Resumo',
  details: 'Ficha detalhada',
  aliases: 'Apelidos',
};
const claimLabels = {
  observed: 'Observação textual',
  interpretation: 'Interpretação',
  proposal: 'Proposta',
} as const;
const categories = [
  { value: 'character', label: 'Personagem' },
  { value: 'location', label: 'Local' },
  { value: 'concept', label: 'Conceito' },
  { value: 'other', label: 'Outro' },
];
function chapterText(content: string) {
  const doc = new DOMParser().parseFromString(renderRichText(content), 'text/html');
  doc.querySelectorAll('p,h1,h2,h3,li,blockquote,br').forEach((element) => element.append('\n'));
  return (doc.body.textContent ?? '').trim();
}
const differentFields = (detected: DetectedLoreEntity, existing?: LoreEntity) =>
  new Set(
    loreChangeFields.filter(
      (field) =>
        JSON.stringify(detected[field]) !==
        JSON.stringify(existing?.[field] ?? (field === 'aliases' ? [] : '')),
    ),
  );

export function LoreAnalysisDialog({
  bookId,
  chapterId,
  content,
  entities,
  universeId,
  onClose,
  onApplied,
  onBusyChange,
}: Props) {
  const config = useAIConfig();
  const configKey = JSON.stringify(config);
  const currentText = chapterText(content);
  const [analysis, setAnalysis] = useState<LoreAnalysis | null>(null);
  const [editorialContext, setEditorialContext] = useState<LoreAnalysisEditorialContext | null>(
    null,
  );
  const [snapshot, setSnapshot] = useState<{
    text: string;
    configKey: string;
    lore: string;
  } | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [phase, setPhase] = useState<'start' | 'analyzing' | 'review' | 'applying' | 'done'>(
    'start',
  );
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const [pendingApply, setPendingApply] = useState<{ text: string; changes: LoreChange[] } | null>(
    null,
  );
  const applyingRef = useRef(false);
  const loreKey = JSON.stringify(entities);
  const stale =
    snapshot !== null &&
    (snapshot.text !== currentText ||
      snapshot.configKey !== configKey ||
      snapshot.lore !== loreKey);
  useEffect(() => () => controller.current?.abort(), []);
  const close = () => {
    if (phase !== 'applying') {
      controller.current?.abort();
      onClose();
    }
  };

  const analyze = async () => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const captured = { text: currentText, configKey, lore: loreKey };
    setSnapshot(captured);
    setPhase('analyzing');
    setError(null);
    setAnalysis(null);
    setEditorialContext(null);
    setPendingApply(null);
    try {
      if (!currentText) throw new Error('Escreva no capítulo antes de analisar.');
      const editorial = await getLoreAnalysisEditorialContext(bookId, chapterId);
      if (abort.signal.aborted) return;
      if (
        editorial.bookId !== bookId ||
        editorial.chapterId !== chapterId ||
        editorial.scope !== 'editorial-contract-only' ||
        editorial.wholeBook !== false ||
        !/^[a-f0-9]{64}$/.test(editorial.contextToken)
      )
        throw new Error('O contexto editorial retornado não corresponde a este capítulo.');
      setEditorialContext(editorial);
      const request = {
        bookId,
        chapterId,
        editorialContextToken: editorial.contextToken,
        text: currentText,
        content,
        loreVersions: entities.map((entity): [string, number] => [entity.id, entity.updatedAt]),
        requestId: crypto.randomUUID(),
      };
      const result = usesOwnKey(config)
        ? await prepareBYOKLore(
            request,
            await analyzeLoreWithBYOK(currentText, entities, config, abort.signal, editorial),
          )
        : await analyzeChapterLore(request);
      if (abort.signal.aborted) return;
      setAnalysis(result);
      if (result.editorialContext) setEditorialContext(result.editorialContext);
      setProposals(
        result.entities.map((detected) => {
          const matches = matchingLoreEntities(detected, entities);
          const target = matches.length > 1 ? '' : (matches[0]?.id ?? 'new:local');
          const fields = differentFields(detected, matches[0]);
          return { detected, target, fields, selected: false };
        }),
      );
      setPhase('review');
    } catch (cause) {
      if (!abort.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Falha na análise.');
        setPhase('start');
      }
    }
  };
  const changes: LoreChange[] = proposals
    .filter((proposal) => proposal.selected && proposal.target && proposal.fields.size)
    .map<LoreChange>(({ detected, target, fields }) => {
      const existing = entities.find((item) => item.id === target);
      return {
        scope: target === 'new:global' || existing?.universeId ? 'global' : 'local',
        ...(existing ? { entityId: existing.id } : {}),
        input: Object.fromEntries(
          loreChangeFields
            .filter(
              (field) =>
                fields.has(field) && (!existing || differentFields(detected, existing).has(field)),
            )
            .map((field) => [field, detected[field]]),
        ),
      };
    })
    .filter((change) => Object.keys(change.input).length > 0);
  const apply = async () => {
    if (!analysis || !snapshot || (stale && !pendingApply) || applyingRef.current) return;
    const payload = pendingApply ?? { text: snapshot.text, changes };
    setPendingApply(payload);
    applyingRef.current = true;
    setPhase('applying');
    setError(null);
    onBusyChange(true);
    try {
      const result = await applyLoreAnalysis(analysis.id, payload.text, payload.changes);
      setPhase('done');
      onApplied(result.credits);
    } catch (cause) {
      const code = (cause instanceof Error ? cause.cause : null) as { code?: string } | null;
      if (
        [
          'functions/failed-precondition',
          'functions/invalid-argument',
          'functions/resource-exhausted',
          'functions/not-found',
          'functions/permission-denied',
        ].includes(code?.code ?? '')
      )
        setPendingApply(null);
      setError(cause instanceof Error ? cause.message : 'Falha ao aplicar.');
      setPhase('review');
    } finally {
      applyingRef.current = false;
      onBusyChange(false);
    }
  };
  const edit = (index: number, update: Partial<Proposal>) =>
    setProposals((previous) =>
      previous.map((item, i) =>
        i === index
          ? { ...item, ...update, ...(update.detected ? { authorEdited: true } : {}) }
          : item,
      ),
    );
  const locked = phase === 'applying' || Boolean(pendingApply);
  return (
    <Dialog
      open
      title="Atualizar compêndio com base no texto"
      description="Analise o capítulo atual, incluindo alterações ainda não salvas. Revise antes de aplicar."
      onClose={close}
      maxWidthClass="max-w-3xl"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={phase === 'applying'}>
            {phase === 'done' ? 'Concluir' : 'Cancelar'}
          </Button>
          {phase !== 'done' && phase !== 'analyzing' && (
            <Button
              variant="secondary"
              onClick={() => void analyze()}
              disabled={phase === 'applying' || Boolean(pendingApply)}
            >
              {analysis ? 'Analisar novamente' : 'Analisar capítulo'}
            </Button>
          )}
          {analysis && phase !== 'done' && (
            <Button
              onClick={() => void apply()}
              disabled={(stale && !pendingApply) || !changes.length || phase === 'applying'}
            >
              {phase === 'applying'
                ? 'Aplicando...'
                : `Aplicar ${changes.length} ${changes.length === 1 ? 'alteração' : 'alterações'}`}
            </Button>
          )}
        </>
      }
    >
      <p className={styles.cost}>
        {analysis?.provider === 'byok' || (!analysis && usesOwnKey(config))
          ? 'BYOK: sem consumir créditos da plataforma. O provedor pode cobrar pelo uso.'
          : '1 crédito por lote aplicado. Analisar, cancelar ou descartar não consome créditos.'}
      </p>
      {error && (
        <Alert variant="destructive">
          {error}
          {pendingApply &&
            ' Tentar aplicar novamente repetirá o mesmo lote sem cobrança duplicada.'}
        </Alert>
      )}
      {stale && phase !== 'done' && (
        <Alert variant="warning">
          O texto, as configurações de IA ou o compêndio mudou. Analise novamente.
        </Alert>
      )}
      {editorialContext && (
        <details>
          <summary>Guia editorial utilizado · revisão {editorialContext.revision}</summary>
          <p>
            Escopo: contrato e decisões editoriais. Não inclui leitura integral do livro e não é
            evidência de fatos do capítulo.
          </p>
          {editorialContext.present ? (
            <pre className={`${styles.evidence} ${styles.editorialContext}`}>
              {editorialContext.instruction}
            </pre>
          ) : (
            <p>Este livro não tem contrato editorial salvo.</p>
          )}
        </details>
      )}
      {phase === 'analyzing' && <LoadingState label="Buscando entidades em todo o capítulo..." />}
      {phase === 'done' && <p role="status">Lote aplicado. O compêndio foi atualizado.</p>}
      {phase === 'review' || phase === 'applying' ? (
        <div className={styles.list}>
          {proposals.length === 0 && (
            <p>Nenhuma entidade encontrada no capítulo. Nenhum crédito consumido.</p>
          )}
          {proposals.map((proposal, index) => {
            const existing = entities.find((entity) => entity.id === proposal.target);
            const unchanged = existing && differentFields(proposal.detected, existing).size === 0;
            const status = !proposal.target
              ? 'Revisar conflito'
              : unchanged
                ? 'Sem alteração'
                : existing
                  ? 'Atualizar'
                  : 'Criar';
            return (
              <section
                key={index}
                className={styles.proposal}
                aria-label={`Sugestão: ${proposal.detected.name}`}
              >
                <div className={styles.row}>
                  <Input
                    type="checkbox"
                    aria-label={`Selecionar ${proposal.detected.name}`}
                    checked={proposal.selected}
                    disabled={locked || !proposal.target || Boolean(unchanged)}
                    onChange={(event) => edit(index, { selected: event.target.checked })}
                    className={styles.checkbox}
                  />
                  <strong>{proposal.detected.name}</strong>
                  <span>{status}</span>
                </div>
                <blockquote className={styles.evidence}>{proposal.detected.evidence}</blockquote>
                <p>
                  {proposal.detected.claims
                    ? 'Classificação sugerida pela IA: ' +
                      [
                        ...new Set(
                          proposal.detected.claims.items.map((claim) => claimLabels[claim.kind]),
                        ),
                      ].join(' · ')
                    : 'Sem classificação estruturada. Este resultado não é tratado como fato observado.'}
                </p>
                <p>
                  Confira os campos e selecione explicitamente a sugestão. A evidência literal não
                  certifica, por si só, a verdade de uma interpretação.
                </p>
                {proposal.authorEdited && (
                  <Alert>
                    Os campos foram editados pelo autor. A classificação abaixo pertence à sugestão
                    original; confira sua correspondência com o texto atual.
                  </Alert>
                )}
                {proposal.detected.claims && (
                  <details>
                    <summary>Revisar classificação das afirmações</summary>
                    <ul>
                      {proposal.detected.claims.items.map((claim, claimIndex) => (
                        <li key={claimIndex}>
                          <strong>
                            {labels[claim.field]} · {claimLabels[claim.kind]}
                          </strong>
                          <p>{claim.text}</p>
                          <blockquote className={styles.evidence}>{claim.evidence}</blockquote>
                          {claim.rationale && <p>Justificativa: {claim.rationale}</p>}
                        </li>
                      ))}
                    </ul>
                    <p>
                      Classificação parcial de afirmações, não certificação integral da ficha. Fala,
                      crença e intenção preservam seu alcance no texto.
                    </p>
                  </details>
                )}

                <Dropdown
                  mode="select"
                  id={`target-${index}`}
                  searchable
                  label="Destino da sugestão"
                  value={proposal.target}
                  disabled={locked}
                  options={[
                    { value: '', label: 'Escolha a entidade ou crie uma nova' },
                    { value: 'new:local', label: 'Criar no lore local deste livro' },
                    ...(universeId
                      ? [{ value: 'new:global', label: 'Criar no lore global do universo' }]
                      : []),
                    ...entities.map((entity) => ({
                      value: entity.id,
                      label: `Atualizar ${entity.name} — ${entity.universeId ? 'global' : 'local'}`,
                    })),
                  ]}
                  onValueChange={(nextValue) => {
                    const target = nextValue;
                    const fields = differentFields(
                      proposal.detected,
                      entities.find((entity) => entity.id === target),
                    );
                    edit(index, { target, fields, selected: false });
                  }}
                />
                {(existing?.universeId || proposal.target === 'new:global') && (
                  <Alert variant="warning">
                    Esta alteração afeta todos os livros vinculados ao universo.
                  </Alert>
                )}
                {!existing && proposal.target && (
                  <p className={styles.cost}>
                    A nova entidade será privada. Você poderá publicá-la depois de revisar sua
                    ficha.
                  </p>
                )}
                <details>
                  <summary>Revisar campos</summary>
                  <div className={styles.fields}>
                    {loreChangeFields.map((field) => (
                      <div key={field}>
                        <div className={styles.row}>
                          <Input
                            type="checkbox"
                            aria-label={`Aplicar ${labels[field]} de ${proposal.detected.name}`}
                            className={styles.checkbox}
                            checked={proposal.fields.has(field)}
                            disabled={
                              locked ||
                              (!existing && ['name', 'category', 'summary'].includes(field))
                            }
                            onChange={(event) => {
                              const fields = new Set(proposal.fields);
                              if (event.target.checked) fields.add(field);
                              else fields.delete(field);
                              edit(index, { fields });
                            }}
                          />
                          <span>{labels[field]}</span>
                        </div>
                        {existing && (
                          <p className={styles.before}>
                            Atual:{' '}
                            {Array.isArray(existing[field])
                              ? existing[field].join(', ')
                              : existing[field] || 'Vazio'}
                          </p>
                        )}
                        {field === 'category' ? (
                          <Dropdown
                            mode="select"
                            aria-label={`Categoria proposta para ${proposal.detected.name}`}
                            value={proposal.detected.category}
                            options={categories}
                            disabled={locked}
                            onValueChange={(nextValue) =>
                              edit(index, {
                                detected: {
                                  ...proposal.detected,
                                  category: nextValue as DetectedLoreEntity['category'],
                                },
                              })
                            }
                          />
                        ) : (
                          <Textarea
                            aria-label={`${labels[field]} proposto para ${proposal.detected.name}`}
                            value={
                              field === 'aliases'
                                ? (proposal.aliasesText ?? proposal.detected.aliases.join(', '))
                                : proposal.detected[field]
                            }
                            disabled={locked}
                            maxLength={field === 'name' ? 200 : field === 'summary' ? 140 : 8000}
                            onChange={(event) =>
                              edit(index, {
                                ...(field === 'aliases' ? { aliasesText: event.target.value } : {}),
                                detected: {
                                  ...proposal.detected,
                                  [field]:
                                    field === 'aliases'
                                      ? event.target.value
                                          .split(',')
                                          .map((item) => item.trim())
                                          .filter(Boolean)
                                      : event.target.value,
                                },
                              })
                            }
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              </section>
            );
          })}
        </div>
      ) : null}
    </Dialog>
  );
}
