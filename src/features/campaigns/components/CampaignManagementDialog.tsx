import { useAuth } from '@/features/auth';
import { UniverseSelect } from '@/features/universes';
import { Alert, Button, Dialog, Dropdown, Input, Textarea } from '@/shared/ui';
import { campaignStatusLabels, type Campaign, type CampaignStatus } from '../model/campaign';
import {
  useCampaignManagement,
  type CampaignManagementCallbacks,
} from '../hooks/useCampaignManagement';
import styles from './CampaignPage.module.css';
export interface CampaignManagementDialogProps extends CampaignManagementCallbacks {
  open: boolean;
  onClose: () => void;
  campaign: Campaign;
}
export function CampaignManagementDialog(props: CampaignManagementDialogProps) {
  const { user } = useAuth();
  return user && props.campaign.ownerId === user.uid ? (
    <ManagementSession key={JSON.stringify([user.uid, props.campaign.id])} {...props} />
  ) : null;
}
function ManagementSession({
  open,
  onClose,
  campaign,
  onConfirmed,
  onPendingChange,
}: CampaignManagementDialogProps) {
  const controller = useCampaignManagement(campaign, { onConfirmed, onPendingChange });
  const locked =
    controller.busy ||
    Boolean(controller.pending) ||
    controller.conflict ||
    controller.recoveryBlocked ||
    controller.unavailable;
  const close = () => {
    if (!controller.busy) onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      title="Editar campanha"
      description="Os dados e o universo organizacional pertencem a esta campanha. Alterar o vínculo não apaga a descrição nem o checklist."
      footer={
        <div className={styles.actions}>
          <Button variant="outline" disabled={controller.busy} onClick={close}>
            {controller.pending ? 'Fechar e manter pedido' : 'Cancelar'}
          </Button>
          <Button
            disabled={
              controller.busy ||
              (!controller.pending &&
                (locked || !controller.hasChanges || !controller.fields.title.trim()))
            }
            onClick={() => {
              void (controller.pending ? controller.recover() : controller.submit()).then(
                (value) => {
                  if (value) onClose();
                },
              );
            }}
          >
            {controller.busy
              ? 'Confirmando…'
              : controller.pending
                ? 'Confirmar mesmo pedido'
                : 'Salvar alterações'}
          </Button>
        </div>
      }
    >
      {controller.error && <Alert variant="destructive">{controller.error}</Alert>}
      {controller.pending && (
        <Alert variant="warning">
          A resposta ainda não foi confirmada. O pedido original foi preservado; fechar esta janela
          mantém outra alteração bloqueada até confirmar o mesmo pedido.
        </Alert>
      )}
      {controller.conflict && (
        <Alert variant="warning">
          A campanha mudou em outro dispositivo. Seus campos foram preservados. Para continuar,
          descarte estas alterações e confira a versão atual.
          <Button
            variant="outline"
            disabled={controller.busy || Boolean(controller.pending)}
            onClick={() => void controller.loadCurrent()}
          >
            Descartar alterações e carregar versão atual
          </Button>
        </Alert>
      )}
      <div className={styles.form}>
        <Input
          label="Título da campanha"
          value={controller.fields.title}
          maxLength={300}
          required
          disabled={locked}
          onChange={(event) => controller.change('title', event.target.value)}
        />
        <Textarea
          label="Descrição da campanha"
          value={controller.fields.description}
          maxLength={4000}
          rows={5}
          disabled={locked}
          onChange={(event) => controller.change('description', event.target.value)}
        />
        <Dropdown
          mode="select"
          label="Estado da campanha"
          value={controller.fields.status}
          disabled={locked}
          onValueChange={(value) => controller.change('status', value as CampaignStatus)}
          options={(Object.keys(campaignStatusLabels) as CampaignStatus[]).map((value) => ({
            value,
            label: campaignStatusLabels[value],
          }))}
        />
        {controller.fields.status === 'archived' && (
          <p className={styles.hint}>
            Ao sair do arquivo, escolha explicitamente o estado da campanha. A descrição e o
            checklist são preservados.
          </p>
        )}
        <UniverseSelect
          value={controller.fields.universeId}
          onChange={(value) => controller.change('universeId', value)}
          disabled={locked}
          alwaysShow
          hint="Este vínculo organiza a campanha. Ele não altera lore global nem cria uma base congelada."
        />
      </div>
    </Dialog>
  );
}
