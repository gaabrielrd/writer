import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { Globe, Map } from 'lucide-react';
import {
  ProjectProgressPanel,
  useWorkActivity,
  WorkActivityNotice,
} from '@/features/work-progress';
import { useAuth } from '@/features/auth';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  buttonVariants,
} from '@/shared/ui';
import type { Campaign } from '../model/campaign';
import { getCampaign } from '../services/campaignService';
import styles from './CampaignPage.module.css';

function CampaignDetail({ id, ownerId }: { id: string; ownerId: string }) {
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
  const status = {
    planning: 'Em preparação',
    active: 'Em andamento',
    completed: 'Concluída',
    archived: 'Arquivada',
  }[campaign.status];
  return (
    <div className={styles.page}>
      <WorkActivityNotice activity={activity} />
      <PageHeader
        title={campaign.title}
        description="Campanha independente"
        breadcrumbs={<Link to="/studio">Estúdio</Link>}
        actions={back}
      />
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
