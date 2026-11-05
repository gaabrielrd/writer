import { Link, useSearchParams, useLocation } from 'react-router';
import { ArrowLeft, Users, Settings2 } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { Card, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui';
import { PersonaManager } from './PersonaManager';
import { BYOKSettingsDialog } from './BYOKSettingsDialog';
import styles from './Personas.module.css';

const tabs = [
  { id: 'personas', label: 'Personas', icon: Users },
  { id: 'provider', label: 'Provedor', icon: Settings2 },
] as const;
type SettingsTab = (typeof tabs)[number]['id'];

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
  const active: SettingsTab = params.get('tab') === 'provider' ? 'provider' : 'personas';
  const select = (tab: string) => {
    setParams({ tab }, { state });
  };
  return (
    <section className={styles.settingsPage} aria-label="Inteligência artificial">
      <PageHeader
        title="Inteligência artificial"
        description="Escolha as vozes de escrita e como o Writer acessa o modelo."
        breadcrumbs={
          state?.returnTo && (
            <Link to={returnTo} className={styles.backLink}>
              <ArrowLeft className="icon icon-sm" aria-hidden="true" />
              {returnTo.includes('/editor/')
                ? 'Voltar ao editor'
                : returnTo.startsWith('/books/')
                  ? 'Voltar ao livro'
                  : 'Voltar'}
            </Link>
          )
        }
      />
      <Tabs value={active} onValueChange={select}>
        <TabsList aria-label="Configurações de inteligência artificial">
          {tabs.map(({ id, label, icon: Icon }) => (
            <TabsTrigger
              key={id}
              value={id}
              icon={<Icon className="icon icon-sm" aria-hidden="true" />}
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="personas">
          <PersonaManager key={user?.uid} ownerId={user?.uid} />
        </TabsContent>
        <TabsContent value="provider">
          <Card className={styles.providerCard}>
            <h2>Conexão e modelo</h2>
            <BYOKSettingsDialog embedded open onClose={() => select('personas')} />
          </Card>
        </TabsContent>
      </Tabs>
    </section>
  );
}
