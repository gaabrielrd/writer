import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button, Card, Input, Alert, PageHeader } from '@/shared/ui';
import { LogIn, UserPlus, Sparkles, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import styles from './LoginPage.module.css';

export function LoginPage() {
  const { user, signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const navigate = useNavigate();

  const [isSignUp, setIsSignUp] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setIsSubmitting(true);

    void (async () => {
      try {
        if (isSignUp) {
          if (password.length < 6) {
            throw new Error('A senha deve conter no mínimo 6 caracteres.');
          }
          await signUpWithEmail(email, password, displayName || undefined);
        } else {
          await signInWithEmail(email, password);
        }
        void navigate('/');
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : 'Erro ao processar autenticação.');
      } finally {
        setIsSubmitting(false);
      }
    })();
  };

  const handleGoogleSignIn = () => {
    setLocalError(null);
    setIsSubmitting(true);
    void (async () => {
      try {
        await signInWithGoogle();
        void navigate('/');
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : 'Erro ao autenticar com Google.');
      } finally {
        setIsSubmitting(false);
      }
    })();
  };

  if (user) {
    return (
      <div className={styles.container}>
        <Card tone="raised">
          <div className={styles.card}>
            <PageHeader
              title="Você já está autenticado"
              description={`Conectado como ${user.displayName || user.email}`}
            />
            <Button
              variant="primary"
              onClick={() => {
                void navigate('/');
              }}
            >
              Ir para meus livros
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Card tone="raised">
        <div className={styles.card}>
          <PageHeader
            title={isSignUp ? 'Criar sua conta de autor' : 'Entrar no Writer Assistant'}
            description={
              isSignUp
                ? 'Comece agora com 100 créditos gratuitos para assistência por IA.'
                : 'Acesse seus livros, compêndios de lore e manuscritos salvos na nuvem.'
            }
          />

          {localError && (
            <Alert variant="danger" title="Atenção">
              {localError}
            </Alert>
          )}

          <div className={styles.benefits}>
            <div className={styles.benefitItem}>
              <Sparkles className="icon icon-sm" aria-hidden="true" />
              <span>100 créditos iniciais de IA para autocomplete e sugestões</span>
            </div>
            <div className={styles.benefitItem}>
              <CheckCircle2 className="icon icon-sm" aria-hidden="true" />
              <span>Sincronização em nuvem e compêndio de lore ilimitado</span>
            </div>
          </div>

          <Button
            type="button"
            variant="secondary"
            onClick={handleGoogleSignIn}
            disabled={isSubmitting}
          >
            <LogIn className="icon icon-sm" aria-hidden="true" />
            Continuar com Google
          </Button>

          <div className={styles.divider}>
            <span>ou com e-mail</span>
          </div>

          <form onSubmit={handleSubmit} className={styles.form}>
            {isSignUp && (
              <Input
                label="Nome de Autor"
                placeholder="Ex: J. K. Silva"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={isSubmitting}
              />
            )}

            <Input
              label="E-mail"
              type="email"
              placeholder="autor@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isSubmitting}
            />

            <Input
              label="Senha"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isSubmitting}
            />

            <div className={styles.actions}>
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSignUp ? (
                  <>
                    <UserPlus className="icon icon-sm" aria-hidden="true" />
                    Criar conta gratuita
                  </>
                ) : (
                  <>
                    <LogIn className="icon icon-sm" aria-hidden="true" />
                    Entrar
                  </>
                )}
              </Button>
            </div>
          </form>

          <div className={styles.toggle}>
            <span>{isSignUp ? 'Já possui uma conta?' : 'Ainda não tem conta?'}</span>
            <button
              type="button"
              className={styles.toggleButton}
              onClick={() => {
                setIsSignUp(!isSignUp);
                setLocalError(null);
              }}
            >
              {isSignUp ? 'Entrar' : 'Cadastre-se gratuitamente'}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
