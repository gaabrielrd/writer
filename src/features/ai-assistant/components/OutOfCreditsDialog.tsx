import { AlertCircle, KeyRound, Sparkles } from 'lucide-react';
import { Button, Dialog } from '@vitru/styleguide';
import styles from './OutOfCreditsDialog.module.css';

export interface OutOfCreditsDialogProps {
  open: boolean;
  onClose: () => void;
  onOpenBYOKSettings: () => void;
}

export function OutOfCreditsDialog({ open, onClose, onOpenBYOKSettings }: OutOfCreditsDialogProps) {
  return (
    <Dialog open={open} title="Seus créditos de IA acabaram" onClose={onClose}>
      <div className={styles.content}>
        <div className={styles.iconWrapper}>
          <AlertCircle className={`icon ${styles.alertIcon}`} aria-hidden="true" />
        </div>

        <p className={styles.description}>
          Você consumiu todos os seus créditos gratuitos disponíveis no plano atual.
        </p>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <KeyRound className="icon icon-sm" aria-hidden="true" />
            <strong>Usar Chave Própria (BYOK)</strong>
          </div>
          <p className={styles.cardText}>
            Adicione sua chave pessoal da OpenAI ou Google Gemini para continuar usando o assistente
            de forma ilimitada sem consumir créditos da plataforma.
          </p>
          <Button
            variant="primary"
            onClick={() => {
              onClose();
              onOpenBYOKSettings();
            }}
          >
            <Sparkles className="icon icon-sm" aria-hidden="true" />
            Configurar Chave de API
          </Button>
        </div>

        <div className={styles.footerActions}>
          <Button variant="secondary" onClick={onClose}>
            Continuar escrevendo sem IA
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
