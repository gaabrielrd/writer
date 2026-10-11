import { Link, useSearchParams, useLocation } from 'react-router';
import { ArrowLeft, Users, Settings2 } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { Card, PageHeader } from '@/shared/ui';
import { PersonaManager } from './PersonaManager';
import { BYOKSettingsDialog } from './BYOKSettingsDialog';
import styles from './Personas.module.css';

const tabs = [
  { id: 'personas', label: 'Personas', icon: Users },
  { id: 'provider', label: 'Provedor', icon: Settings2 },
];
export function AISettingsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const state = location.state as { returnTo?: string } | null;
  const returnTo =
    typeof state?.returnTo === 'string' &&
    state.returnTo.startsWith('/') &&
    !state.returnTo.startsWith('//')
      ? state.returnTo
      : '/';
  const active = params.get('tab') === 'provider' ? 'provider' : 'personas';
  const select = (tab: string) => {
    setParams({ tab }, { state });
  };
  return (
    <div className={styles.settingsPage}>
      <Link to={returnTo} className={styles.backLink}>
        <ArrowLeft className="icon icon-sm" aria-hidden="true" />
        {returnTo.includes('/editor/')
          ? 'Voltar ao editor'
          : returnTo.startsWith('/books/')
            ? 'Voltar ao livro'
            : 'Voltar à biblioteca'}
      </Link>
      <PageHeader
        title="Inteligência artificial"
        description="Configure a conexão e as vozes que acompanham sua escrita."
      />
      <div
        className={styles.tabBar}
        role="tablist"
        aria-label="Configurações de inteligência artificial"
      >
        {tabs.map(({ id, label, icon: Icon }, index) => (
          <button
            type="button"
            key={id}
            id={`ai-tab-${id}`}
            role="tab"
            aria-selected={active === id}
            aria-controls={`ai-panel-${id}`}
            tabIndex={active === id ? 0 : -1}
            className={`${styles.tab} ${active === id ? styles.tabActive : ''}`}
            onClick={() => select(id)}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? tabs.length - 1
                    : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
              select(tabs[next]!.id);
              (
                event.currentTarget.parentElement?.children[next] as HTMLElement | undefined
              )?.focus();
            }}
          >
            <Icon className="icon icon-sm" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      <section role="tabpanel" id={`ai-panel-${active}`} aria-labelledby={`ai-tab-${active}`}>
        {active === 'personas' ? (
          <PersonaManager key={user?.uid} ownerId={user?.uid} />
        ) : (
          <Card className={styles.providerCard}>
            <h2>Conexão e modelo</h2>
            <BYOKSettingsDialog embedded open onClose={() => select('personas')} />
          </Card>
        )}
      </section>
    </div>
  );
}
