import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button, Card, Input, Alert } from '@/shared/ui';
import { LogIn, UserPlus, Sparkles, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useGoogleOneTap } from '../hooks/useGoogleOneTap';
import styles from './LoginPage.module.css';

export function formatAuthError(err: unknown): string | null {
  if (!(err instanceof Error)) return 'Erro ao processar autenticação.';

  const msg = err.message || '';
  if (
    msg.includes('auth/popup-closed-by-user') ||
    msg.includes('popup-closed') ||
    msg.includes('Popup cancelado')
  ) {
    return 'Autenticação cancelada pelo usuário.';
  }
  if (msg.includes('auth/cancelled-popup-request')) {
    return null;
  }
  if (msg.includes('auth/unauthorized-domain')) {
    return 'Domínio não autorizado no Firebase Console. Adicione o domínio nas configurações de autenticação do Firebase.';
  }
  if (msg.includes('Database is closing') || msg.includes('closing/hidden')) {
    return null;
  }
  if (
    msg.includes('auth/invalid-credential') ||
    msg.includes('auth/wrong-password') ||
    msg.includes('auth/user-not-found')
  ) {
    return 'E-mail ou senha incorretos.';
  }
  if (msg.includes('auth/email-already-in-use')) {
    return 'Este e-mail já está cadastrado. Tente entrar.';
  }
  if (msg.includes('auth/weak-password')) {
    return 'A senha deve conter no mínimo 6 caracteres.';
  }
  return msg;
}

export function LoginPage() {
  const { user, signInWithGoogle, signInWithGoogleIdToken, signInWithEmail, signUpWithEmail } =
    useAuth();
  const navigate = useNavigate();

  const [isSignUp, setIsSignUp] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Inicializa Google One Tap automaticamente para login sem atrito
  useGoogleOneTap({
    onSuccess: async (idToken) => {
      setLocalError(null);
      setIsSubmitting(true);
      try {
        await signInWithGoogleIdToken(idToken);
        void navigate('/');
      } catch (err) {
        const friendly = formatAuthError(err);
        if (friendly) setLocalError(friendly);
      } finally {
        setIsSubmitting(false);
      }
    },
    disabled: !!user,
  });

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
        const friendly = formatAuthError(err);
        if (friendly) setLocalError(friendly);
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
        const friendly = formatAuthError(err);
        if (friendly) setLocalError(friendly);
      } finally {
        setIsSubmitting(false);
      }
    })();
  };

  if (user) {
    return (
      <div className={styles.container}>
        <Card className={styles.card}>
          <div className={styles.header}>
            <h1 className={styles.title}>Você já está autenticado</h1>
            <p className={styles.description}>Conectado como {user.displayName || user.email}</p>
          </div>
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              void navigate('/');
            }}
          >
            Ir para meus livros
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Card className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>
            {isSignUp ? 'Criar sua conta de autor' : 'Entrar no Writer Assistant'}
          </h1>
          <p className={styles.description}>
            {isSignUp
              ? 'Comece agora com 100 créditos gratuitos para assistência por IA.'
              : 'Acesse seus livros, compêndios de lore e manuscritos salvos na nuvem.'}
          </p>
        </div>

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
          size="lg"
          className={styles.googleButton}
          onClick={handleGoogleSignIn}
          disabled={isSubmitting}
        >
          <LogIn className="icon icon-sm" aria-hidden="true" />
          <span>Continuar com Google</span>
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
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={isSubmitting}
              className="w-full"
            >
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
      </Card>
    </div>
  );
}
