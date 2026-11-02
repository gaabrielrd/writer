import { Navigate } from 'react-router';
import { useAuth } from '@/features/auth';
import { Card, Dropdown, LoadingState, PageHeader, useWorkspaceLayout } from '@/shared/ui';
import { WorkPreferencesPanel } from './WorkPreferencesPanel';
import styles from './WorkProgress.module.css';

export function WorkPreferencesPage() {
  const { user, loading } = useAuth();
  const { contentWidth, setContentWidth } = useWorkspaceLayout();
  if (loading) return <LoadingState label="Carregando preferências…" />;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className={styles.preferencesPage}>
      <PageHeader
        title="Preferências"
        description="Ajuste como o Writer apresenta as informações da sua conta."
      />
      <Card className={styles.preferencesCard}>
        <h2>Área de trabalho</h2>
        <p className={styles.hint}>
          Limite a largura do conteúdo dos painéis. A escolha é salva neste navegador e se adapta ao
          espaço disponível na tela.
        </p>
        <Dropdown
          mode="select"
          label="Largura do conteúdo"
          value={contentWidth}
          options={[
            { value: 'small', label: 'Pequeno' },
            { value: 'medium', label: 'Médio' },
            { value: 'large', label: 'Grande' },
          ]}
          onValueChange={(value) => {
            if (value === 'small' || value === 'medium' || value === 'large')
              setContentWidth(value);
          }}
        />
      </Card>
      <Card className={styles.preferencesCard}>
        <h2>Data e horário</h2>
        <p className={styles.hint}>O fuso salvo será usado ao apresentar sua atividade recente.</p>
        <WorkPreferencesPanel key={user.uid} />
      </Card>
    </div>
  );
}
