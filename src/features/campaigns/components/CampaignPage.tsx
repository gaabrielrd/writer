import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getInvalidationGeneration, subscribeInvalidation } from '@/shared/services';
import { Link, Navigate, useParams, useLocation } from 'react-router';
import { ArrowLeft, Globe, MoreHorizontal, Trash2 } from 'lucide-react';
import {
  ProjectProgressPanel,
  useWorkActivity,
  WorkActivityNotice,
} from '@/features/work-progress';
import { useAuth } from '@/features/auth';
import { CampaignBaseReader } from '@/features/campaign-bases';
import { CampaignNotesPanel } from '@/features/campaign-notes';
import {
  CampaignPreparationPanel,
  type CampaignPreparationOpenRequest,
} from '@/features/campaign-preparation';
import {
  CampaignSessionsPanel,
  type CampaignSessionReferenceSlot,
} from '@/features/campaign-sessions';
import {
  CampaignSessionReferenceControls,
  CampaignSessionReferencesPanel,
} from '@/features/campaign-session-references';
import { CampaignLorePanel } from '@/features/campaign-lore';
import {
  CampaignComparisonPanel,
  type ComparisonReadEnvelope,
} from '@/features/campaign-comparisons';
import {
  CampaignAdoptionDialog,
  CampaignAdoptionPreparations,
} from '@/features/campaign-adoptions';
import {
  Badge,
  Alert,
  Button,
  Card,
  Dropdown,
  DropdownItem,
  EmptyState,
  ErrorState,
  LoadingState,
  ObjectHeader,
  buttonVariants,
} from '@/shared/ui';
import { campaignStatusLabels, type Campaign } from '../model/campaign';
import { getCampaign } from '../services/campaignService';
import { CampaignManagementDialog } from './CampaignManagementDialog';
import { CampaignDeletionControls } from './CampaignDeletionControls';
import styles from './CampaignPage.module.css';

function CampaignDetail({ id, ownerId }: { id: string; ownerId: string }) {
  const { setPendingEditorOperation } = useAuth();
  const [visible, setVisible] = useState(true),
    [sessionsReady, setSessionsReady] = useState(false),
    [contentPending, setContentPending] = useState(false),
    [sessionsPending, setSessionsPending] = useState(false),
    [referencesPending, setReferencesPending] = useState(false),
    [preparationPending, setPreparationPending] = useState(false),
    [preparationRequest, setPreparationRequest] = useState<CampaignPreparationOpenRequest | null>(
      null,
    ),
    [materialBase, setMaterialBase] = useState<string | null>(null),
    [materialProjection, setMaterialProjection] = useState<string | null>(null),
    [materialEpoch, setMaterialEpoch] = useState(0),
    [error, setError] = useState(''),
    [checking, setChecking] = useState(false),
    [attempt, setAttempt] = useState(0),
    [deletionOpen, setDeletionOpen] = useState(false),
    alive = useRef(true),
    generation = useRef(0);
  const scope = { actorId: ownerId, scope: 'campaign:' + id };
  const onAvailability = useCallback((available: boolean) => setSessionsReady(available), []);
  useEffect(() => {
    setPendingEditorOperation(
      contentPending || sessionsPending || referencesPending || preparationPending,
    );
  }, [
    contentPending,
    sessionsPending,
    referencesPending,
    preparationPending,
    setPendingEditorOperation,
  ]);
  useEffect(() => () => setPendingEditorOperation(false), [setPendingEditorOperation]);
  const onMaterialBase = useCallback((baseId: string | null) => setMaterialBase(baseId), []);
  const onMaterialProjection = useCallback((projection: string | null) => {
    setMaterialProjection(projection);
    if (projection === null) setMaterialEpoch((n) => n + 1);
  }, []);
  const onMaterialInvalidated = useCallback(() => setMaterialEpoch((n) => n + 1), []);
  const renderReferences = useCallback(
    (slot: CampaignSessionReferenceSlot) => (
      <>
        <CampaignSessionReferencesPanel
          key={JSON.stringify([
            slot.campaignId,
            slot.campaignToken,
            slot.sessionId,
            slot.sessionRevision,
            materialBase,
            materialProjection,
            materialEpoch,
          ])}
          scope={{
            campaignId: slot.campaignId,
            campaignToken: slot.campaignToken,
            sessionId: slot.sessionId,
            expectedSessionRevision: slot.sessionRevision,
          }}
          isActive={slot.isActive}
          readOnly={slot.readOnly}
        />
        <Button
          variant="outline"
          onClick={() =>
            setPreparationRequest((previous) => ({
              requestId: (previous?.requestId ?? 0) + 1,
              session: {
                campaignId: slot.campaignId,
                campaignToken: slot.campaignToken,
                sessionId: slot.sessionId,
                expectedSessionRevision: slot.sessionRevision,
                isActive: slot.isActive,
                readOnly: slot.readOnly,
              },
              view: 'pending',
            }))
          }
        >
          Pistas e missões desta sessão
        </Button>
      </>
    ),
    [materialBase, materialProjection, materialEpoch],
  );
  useLayoutEffect(() => {
    alive.current = true;
    const off = subscribeInvalidation(scope, () => {
      generation.current++;
      setVisible(false);
      setChecking(false);
      setError('');
    });
    return () => {
      alive.current = false;
      off();
    };
  }, [ownerId, id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function recheck() {
    const own = ++generation.current,
      stamp = getInvalidationGeneration(scope);
    setChecking(true);
    try {
      const campaign = await getCampaign(id);
      if (
        !alive.current ||
        own !== generation.current ||
        stamp !== getInvalidationGeneration(scope)
      )
        return;
      if (campaign?.ownerId === ownerId) setMaterialBase(campaign.activeBaseId ?? null);
      if (!campaign || campaign.ownerId !== ownerId) setVisible(false);
      else if (!visible) {
        setAttempt((n) => n + 1);
        setVisible(true);
      }
      setError('');
    } catch (cause) {
      if (alive.current && own === generation.current)
        setError(cause instanceof Error ? cause.message : 'Não foi possível conferir a campanha.');
    } finally {
      if (alive.current && own === generation.current) setChecking(false);
    }
  }
  const preparation = (
    <CampaignPreparationPanel
      campaignId={id}
      openRequest={preparationRequest}
      onPendingChange={setPreparationPending}
    />
  );
  useEffect(() => {
    const focus = () => {
      void recheck();
    };
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, [ownerId, id, visible]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={styles.page}>
      <CampaignDeletionControls
        campaignId={id}
        open={deletionOpen}
        onOpenChange={setDeletionOpen}
        renderTrigger={() => null}
        onRevoked={() => {
          setVisible(false);
          setError('');
        }}
      />
      <CampaignSessionReferenceControls campaignId={id} onPendingChange={setReferencesPending} />
      {error && <Alert variant="warning">{error}</Alert>}
      {visible ? (
        <>
          <CampaignContent
            key={attempt}
            id={id}
            ownerId={ownerId}
            onAvailability={onAvailability}
            onPendingChange={setContentPending}
            onMaterialBase={onMaterialBase}
            onMaterialProjection={onMaterialProjection}
            onMaterialInvalidated={onMaterialInvalidated}
            onDelete={() => setDeletionOpen(true)}
          />
          {/* Stable host: reloading the content must not reset an open preparation. */}
          {preparation}
          {sessionsReady && (
            <CampaignSessionsPanel
              campaignId={id}
              onPendingChange={setSessionsPending}
              renderReferences={renderReferences}
            />
          )}
        </>
      ) : (
        <>
          {preparation}
          <Card className={styles.content}>
            <h2>Conteúdo da campanha oculto</h2>
            <p>
              Consulte novamente para conferir a disponibilidade. A limpeza pode ser retomada pelo
              controle de exclusão ou pelo Estúdio.
            </p>
            <div className={styles.actions}>
              <Button disabled={checking} variant="outline" onClick={() => void recheck()}>
                Conferir disponibilidade da campanha
              </Button>
              <Button variant="outline" onClick={() => setDeletionOpen(true)}>
                Excluir campanha
              </Button>
            </div>
            <Link to="/studio">Voltar ao Estúdio</Link>
          </Card>
        </>
      )}
    </div>
  );
}
function CampaignContent({
  id,
  ownerId,
  onAvailability,
  onPendingChange: onContentPendingChange,
  onMaterialBase,
  onMaterialProjection,
  onMaterialInvalidated,
  onDelete,
}: {
  id: string;
  ownerId: string;
  onAvailability: (available: boolean) => void;
  onPendingChange: (pending: boolean) => void;
  onMaterialBase: (baseId: string | null) => void;
  onMaterialProjection: (projection: string | null) => void;
  onMaterialInvalidated: () => void;
  onDelete: () => void;
}) {
  const studioReturnState = useLocation().state as { studioReturnTo?: unknown } | null;
  const studioReturnTo =
    typeof studioReturnState?.studioReturnTo === 'string' &&
    /^\/studio\/projects(?:\?|$)/.test(studioReturnState.studioReturnTo)
      ? studioReturnState.studioReturnTo
      : '/studio/projects';

  const [editing, setEditing] = useState(false),
    [pending, setPending] = useState(false),
    [adoption, setAdoption] = useState<ComparisonReadEnvelope | null>(null),
    [adoptionOpen, setAdoptionOpen] = useState(false),
    [adoptionAttempt, setAdoptionAttempt] = useState(0);
  const loreRef = useRef<HTMLElement | null>(null);
  function reviewAdoption(context: ComparisonReadEnvelope) {
    setAdoption({ ...context });
    setAdoptionAttempt((n) => n + 1);
    setAdoptionOpen(true);
  }
  function adaptLore() {
    loreRef.current?.focus();
    loreRef.current?.scrollIntoView?.({ block: 'start' });
  }
  const onPendingChange = useCallback((value: boolean) => setPending(value), []);
  useEffect(() => {
    onContentPendingChange(pending);
    return () => onContentPendingChange(false);
  }, [pending, onContentPendingChange]);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    attempt: number;
    campaign: Campaign | null;
    error?: string;
  }>();
  useEffect(() => {
    let active = true;
    const scope = { actorId: ownerId, scope: 'campaign:' + id },
      stamp = getInvalidationGeneration(scope);
    void getCampaign(id)
      .then((campaign) => {
        if (active && stamp === getInvalidationGeneration(scope)) {
          onAvailability(Boolean(campaign && campaign.ownerId === ownerId));
          onMaterialBase(campaign?.ownerId === ownerId ? (campaign.activeBaseId ?? null) : null);
          setResult({ attempt, campaign: campaign?.ownerId === ownerId ? campaign : null });
        }
      })
      .catch((cause: unknown) => {
        if (active)
          setResult({
            attempt,
            campaign: null,
            error: cause instanceof Error ? cause.message : 'Tente novamente.',
          });
      });
    return () => {
      active = false;
    };
  }, [id, ownerId, attempt, onAvailability, onMaterialBase]);
  const activity = useWorkActivity({
    target: { kind: 'campaign', id },
    resource: { kind: 'project' },
    enabled: Boolean(result?.campaign && result.campaign.ownerId === ownerId),
  });
  const back = (
    <Link to={studioReturnTo} className={buttonVariants({ variant: 'secondary' })}>
      Voltar aos projetos
    </Link>
  );
  const deleteAction = (
    <Button variant="outline" onClick={onDelete}>
      Excluir campanha
    </Button>
  );
  if (result?.attempt !== attempt) return <LoadingState label="Carregando campanha..." />;
  if (result.error)
    return (
      <ErrorState
        title="Não foi possível carregar a campanha"
        description={result.error}
        action={
          <>
            <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
              Tentar novamente
            </Button>
            {deleteAction}
          </>
        }
      />
    );
  if (!result.campaign)
    return (
      <EmptyState
        title="Campanha indisponível"
        description="Esta campanha não está disponível para sua conta."
        action={
          <>
            {back}
            {deleteAction}
          </>
        }
      />
    );
  const campaign = result.campaign;
  const validDate =
    typeof campaign.updatedAt === 'number' &&
    Number.isFinite(campaign.updatedAt) &&
    campaign.updatedAt >= 0 &&
    campaign.updatedAt <= 8_640_000_000_000_000;
  const status = campaignStatusLabels[campaign.status];
  return (
    <div className={styles.page}>
      <WorkActivityNotice activity={activity} />
      <CampaignManagementDialog
        open={editing}
        onClose={() => setEditing(false)}
        campaign={campaign}
        onPendingChange={onPendingChange}
        onConfirmed={(value) => setResult({ attempt, campaign: value })}
      />
      <Link to={studioReturnTo} className={styles.backLink}>
        <ArrowLeft className="icon icon-sm" aria-hidden="true" />
        Voltar aos projetos
      </Link>
      <ObjectHeader
        kind={
          campaign.provenance.kind === 'original'
            ? 'Campanha · de aventura autoral'
            : 'Campanha · independente'
        }
        title={campaign.title}
        meta={
          <>
            <Badge variant="neutral">{status}</Badge>
            <Badge variant="outline">Privada</Badge>
            {campaign.universeId ? (
              <Link
                className={styles.universeLink}
                to={'/universes/' + encodeURIComponent(campaign.universeId) + '/lore'}
              >
                <Globe className="icon icon-sm" aria-hidden="true" /> Abrir universo vinculado
              </Link>
            ) : (
              <span title="Projeto independente, sem universo vinculado.">Sem universo</span>
            )}
            <span>
              Atualizada em{' '}
              <time dateTime={validDate ? new Date(campaign.updatedAt).toISOString() : undefined}>
                {validDate
                  ? new Intl.DateTimeFormat('pt-BR', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(campaign.updatedAt)
                  : 'Data indisponível'}
              </time>
            </span>
          </>
        }
        description={
          <p className={styles.description}>
            {campaign.description || 'Nenhuma descrição cadastrada.'}
          </p>
        }
        secondaryActions={
          <Button variant="outline" onClick={() => setEditing(true)}>
            Editar campanha
          </Button>
        }
        menu={
          <Dropdown
            mode="action"
            label="Opções da campanha"
            align="end"
            variant="outline"
            iconOnly
            icon={<MoreHorizontal className="icon" aria-hidden="true" />}
          >
            <DropdownItem variant="destructive" onSelect={onDelete}>
              <Trash2 className="icon icon-sm" aria-hidden="true" />
              Excluir campanha
            </DropdownItem>
          </Dropdown>
        }
      />
      {pending && !editing && (
        <Alert variant="warning">
          Há uma alteração desta campanha aguardando confirmação. Confirme o mesmo pedido antes de
          editar novamente.
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Confirmar alterações pendentes
          </Button>
        </Alert>
      )}
      <ProjectProgressPanel target={{ kind: 'campaign', id: campaign.id }} />
      <CampaignNotesPanel campaignId={campaign.id} />
      {campaign.provenance.kind === 'original' && campaign.activeBaseId && (
        <>
          <CampaignComparisonPanel
            campaignId={campaign.id}
            currentBaseId={campaign.activeBaseId}
            onReviewAdoption={reviewAdoption}
          />
          <CampaignAdoptionPreparations
            campaignId={campaign.id}
            onAdopted={() => {
              onMaterialInvalidated();
              setAttempt((n) => n + 1);
            }}
            onAdaptLore={adaptLore}
          />
          {adoption && (
            <CampaignAdoptionDialog
              key={adoptionAttempt}
              selection={{ campaignId: campaign.id, context: adoption }}
              open={adoptionOpen}
              onClose={() => setAdoptionOpen(false)}
              onAdopted={() => {
                setAdoptionOpen(false);
                onMaterialInvalidated();
                setAttempt((n) => n + 1);
              }}
              onAdaptLore={adaptLore}
            />
          )}
          <section ref={loreRef} tabIndex={-1} aria-label="Editar lore atual da campanha">
            <CampaignLorePanel
              campaignId={campaign.id}
              baseId={campaign.activeBaseId}
              onProjectionChange={onMaterialProjection}
            />
          </section>
          <CampaignBaseReader campaignId={campaign.id} generationId={campaign.activeBaseId} />
        </>
      )}
    </div>
  );
}
export function CampaignPage() {
  const { user, loading } = useAuth();
  const { campaignId } = useParams<{ campaignId: string }>();
  if (loading) return <LoadingState label="Carregando sessão..." />;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <CampaignDetail key={user.uid + ':' + campaignId} id={campaignId ?? ''} ownerId={user.uid} />
  );
}
