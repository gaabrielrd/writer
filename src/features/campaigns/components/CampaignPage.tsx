import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getInvalidationGeneration, subscribeInvalidation } from '@/shared/services';
import { Link, Navigate, useParams } from 'react-router';
import { Globe, Map } from 'lucide-react';
import {
  ProjectProgressPanel,
  useWorkActivity,
  WorkActivityNotice,
} from '@/features/work-progress';
import { useAuth } from '@/features/auth';
import { CampaignBaseReader } from '@/features/campaign-bases';
import { CampaignNotesPanel } from '@/features/campaign-notes';
import { CampaignSessionsPanel } from '@/features/campaign-sessions';
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
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
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
    [error, setError] = useState(''),
    [checking, setChecking] = useState(false),
    [attempt, setAttempt] = useState(0),
    alive = useRef(true),
    generation = useRef(0);
  const scope = { actorId: ownerId, scope: 'campaign:' + id };
  const onAvailability = useCallback((available: boolean) => setSessionsReady(available), []);
  useEffect(() => {
    setPendingEditorOperation(contentPending || sessionsPending);
  }, [contentPending, sessionsPending, setPendingEditorOperation]);
  useEffect(() => () => setPendingEditorOperation(false), [setPendingEditorOperation]);
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
        onRevoked={() => {
          setVisible(false);
          setError('');
        }}
      />
      {error && <Alert variant="warning">{error}</Alert>}
      {visible ? (
        <>
          <CampaignContent
            key={attempt}
            id={id}
            ownerId={ownerId}
            onAvailability={onAvailability}
            onPendingChange={setContentPending}
          />
          {sessionsReady && (
            <CampaignSessionsPanel campaignId={id} onPendingChange={setSessionsPending} />
          )}
        </>
      ) : (
        <Card className={styles.content}>
          <h2>Conteúdo da campanha oculto</h2>
          <p>
            Consulte novamente para conferir a disponibilidade. A limpeza pode ser retomada pelo
            controle de exclusão ou pelo Estúdio.
          </p>
          <Button disabled={checking} variant="outline" onClick={() => void recheck()}>
            Conferir disponibilidade da campanha
          </Button>
          <Link to="/studio">Voltar ao Estúdio</Link>
        </Card>
      )}
    </div>
  );
}
function CampaignContent({
  id,
  ownerId,
  onAvailability,
  onPendingChange: onContentPendingChange,
}: {
  id: string;
  ownerId: string;
  onAvailability: (available: boolean) => void;
  onPendingChange: (pending: boolean) => void;
}) {
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
  }, [id, ownerId, attempt, onAvailability]);
  const activity = useWorkActivity({
    target: { kind: 'campaign', id },
    resource: { kind: 'project' },
    enabled: Boolean(result?.campaign && result.campaign.ownerId === ownerId),
  });
  const back = (
    <Link to="/studio" className={buttonVariants({ variant: 'secondary' })}>
      Voltar ao Estúdio
    </Link>
  );
  if (result?.attempt !== attempt) return <LoadingState label="Carregando campanha..." />;
  if (result.error)
    return (
      <ErrorState
        title="Não foi possível carregar a campanha"
        description={result.error}
        action={
          <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
            Tentar novamente
          </Button>
        }
      />
    );
  if (!result.campaign)
    return (
      <EmptyState
        title="Campanha indisponível"
        description="Esta campanha não está disponível para sua conta."
        action={back}
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
      <PageHeader
        title={campaign.title}
        description={
          campaign.provenance.kind === 'original'
            ? 'Campanha de aventura autoral'
            : 'Campanha independente'
        }
        breadcrumbs={<Link to="/studio">Estúdio</Link>}
        actions={
          <div className={styles.actions}>
            <Button variant="outline" onClick={() => setEditing(true)}>
              Editar campanha
            </Button>
            {back}
          </div>
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
      <div className={styles.meta}>
        <Badge variant="secondary">Campanha</Badge>
        <Badge variant="neutral">{status}</Badge>
        <Badge variant="outline">Privada</Badge>
      </div>
      <Card className={styles.content}>
        <h2>
          <Map className="icon" aria-hidden="true" /> Descrição
        </h2>
        <p>{campaign.description || 'Nenhuma descrição cadastrada.'}</p>
        <p className={styles.date}>
          Atualizada em{' '}
          <time dateTime={validDate ? new Date(campaign.updatedAt).toISOString() : undefined}>
            {validDate
              ? new Intl.DateTimeFormat('pt-BR', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(campaign.updatedAt)
              : 'Data indisponível'}
          </time>
        </p>
      </Card>
      {campaign.universeId ? (
        <Link to={'/universes/' + encodeURIComponent(campaign.universeId) + '/lore'}>
          <Globe className="icon icon-sm" aria-hidden="true" /> Abrir universo vinculado
        </Link>
      ) : (
        <p>Projeto independente, sem universo vinculado.</p>
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
            onAdopted={() => setAttempt((n) => n + 1)}
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
                setAttempt((n) => n + 1);
              }}
              onAdaptLore={adaptLore}
            />
          )}
          <section ref={loreRef} tabIndex={-1} aria-label="Editar lore atual da campanha">
            <CampaignLorePanel campaignId={campaign.id} baseId={campaign.activeBaseId} />
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
