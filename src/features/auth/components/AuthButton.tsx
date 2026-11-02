import { ChevronDown, LogIn, LogOut, User, Settings, SlidersHorizontal } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { Button, Dropdown, DropdownItem, DropdownLabel } from '@/shared/ui';
import { useAuth } from '../hooks/useAuth';
import styles from './AuthButton.module.css';

export function AuthButton({ onOpenAISettings }: { onOpenAISettings?: () => void }) {
  const { user, loading, signOut, pendingEditorOperation } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className={styles.container}>
        <span className={styles.name}>Carregando...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <Link to="/login">
        <Button variant="secondary">
          <LogIn className="icon icon-sm" aria-hidden="true" />
          Entrar
        </Button>
      </Link>
    );
  }

  const displayName = user.displayName || user.email || 'Autor';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <Dropdown
      label="Sua conta"
      align="end"
      trigger={
        <Button variant="ghost" className={styles.profile}>
          {user.photoUrl ? (
            <img src={user.photoUrl} alt={`Foto de ${displayName}`} className={styles.avatar} />
          ) : (
            <span className={styles.avatarFallback}>
              {initial || <User className="icon icon-sm" aria-hidden="true" />}
            </span>
          )}
          <span className={styles.name}>{displayName}</span>
          <ChevronDown className="icon icon-sm" aria-hidden="true" />
        </Button>
      }
    >
      <DropdownLabel>{user.email ?? displayName}</DropdownLabel>
      <DropdownItem
        onSelect={() => void navigate('/settings/preferences')}
        disabled={pendingEditorOperation}
      >
        <SlidersHorizontal className="icon icon-sm" aria-hidden="true" />
        Preferências
      </DropdownItem>
      <DropdownItem
        onSelect={() => {
          if (onOpenAISettings) onOpenAISettings();
          else void navigate('/settings/ai');
        }}
        disabled={pendingEditorOperation}
      >
        <Settings className="icon icon-sm" aria-hidden="true" />
        Inteligência artificial
      </DropdownItem>
      <DropdownItem
        onSelect={() => {
          void Promise.resolve(signOut()).catch(() => {});
        }}
        disabled={pendingEditorOperation}
        title={
          pendingEditorOperation
            ? 'Aguarde a sugestão ser inserida no manuscrito'
            : 'Encerrar sessão'
        }
      >
        <LogOut className="icon icon-sm" aria-hidden="true" />
        Sair
      </DropdownItem>
    </Dropdown>
  );
}
