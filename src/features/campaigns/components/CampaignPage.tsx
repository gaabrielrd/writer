import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { Globe, Map } from 'lucide-react';
import {
  ProjectProgressPanel,
  useWorkActivity,
  WorkActivityNotice,
} from '@/features/work-progress';
import { useAuth } from '@/features/auth';
import { CampaignBaseReader } from '@/features/campaign-bases';
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
import styles from './CampaignPage.module.css';

function CampaignDetail({ id, ownerId }: { id: string; ownerId: string }) {
  const { setPendingEditorOperation } = useAuth();
  const [editing, setEditing] = useState(false),
    [pending, setPending] = useState(false);
  const onPendingChange = useCallback((value: boolean) => setPending(value), []);
  useEffect(() => {
    setPendingEditorOperation(pending);
    return () => setPendingEditorOperation(false);
  }, [pending, setPendingEditorOperation]);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    attempt: number;
    campaign: Campaign | null;
    error?: string;
  }>();
  useEffect(() => {
    let active = true;
    void getCampaign(id)
      .then((campaign) => {
        if (active)
          setResult({ attempt, campaign: campaign?.ownerId === ownerId ? campaign : null });
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
  }, [id, ownerId, attempt]);
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
      {campaign.provenance.kind === 'original' && campaign.activeBaseId && (
        <CampaignBaseReader campaignId={campaign.id} generationId={campaign.activeBaseId} />
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
