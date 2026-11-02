import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ArrowDown, ArrowUp, Archive, Copy, FilePlus2, Settings2, Trash2 } from 'lucide-react';
import { useAuth } from '@/features/auth';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  Dropdown,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
} from '@/shared/ui';
import {
  adventureBlockPath,
  blockAudienceLabels,
  narrativeTypeLabels,
  narrativeTypes,
  sameBlockResource,
  type AdventureBlockAudience,
  type AdventureBlockResource,
  type AdventureBlockSummary,
  type AdventureBlockTotals,
  type AdventureNarrativeType,
  type PendingAdventureBlockOperation,
} from '../model/adventureBlock';
import { useAdventureBlocks } from '../hooks/useAdventureBlocks';
import {
  useAdventureBlockMutation,
  type AdventureBlockMutationCallbacks,
} from '../hooks/useAdventureBlockMutation';
export interface AdventureBlockNavigatorProps {
  adventureId: string;
  sceneId: string;
  activeResource?: AdventureBlockResource;
  sceneRevision?: number;
  disabled?: boolean;
  onSceneChange?: (totals: AdventureBlockTotals, block?: AdventureBlockSummary) => void;
  onPendingChange?: (pending: boolean) => void;
  runExclusive?: AdventureBlockMutationCallbacks['runExclusive'];
  operationController?: ReturnType<typeof useAdventureBlockMutation>;
}
import styles from './AdventureBlocks.module.css';
export function AdventureBlockNavigator(props: AdventureBlockNavigatorProps) {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <NavigatorSession
      key={JSON.stringify([user.uid, props.adventureId, props.sceneId])}
      {...props}
    />
  );
}
type Action =
  | { kind: 'create' }
  | { kind: 'edit' | 'duplicate' | 'delete' | 'archive'; block: AdventureBlockSummary };
function NavigatorSession(props: AdventureBlockNavigatorProps) {
  const [archived, setArchived] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [notice, setNotice] = useState('');
  const [localError, setLocalError] = useState('');
  const page = useAdventureBlocks(props.adventureId, props.sceneId, archived, props.sceneRevision);
  const pageRef = useRef(page);
  useLayoutEffect(() => {
    pageRef.current = page;
  });
  const own = useAdventureBlockMutation(
    props.adventureId,
    props.sceneId,
    props.operationController
      ? {}
      : {
          runExclusive: props.runExclusive,
          onPendingChange: props.onPendingChange,
          onResult: (result) => {
            props.onSceneChange?.(result, 'block' in result ? result.block : undefined);
            pageRef.current.refresh();
          },
        },
  );
  const mutation = props.operationController ?? own;
  const locked = Boolean(props.disabled || mutation.busy || mutation.pending || mutation.conflict);
  const run = async (operation: PendingAdventureBlockOperation) => {
    setLocalError('');
    try {
      const result =
        props.operationController && props.runExclusive
          ? await props.runExclusive(() => mutation.execute(operation), { recovery: false })
          : await mutation.execute(operation);
      if (result) {
        setAction(null);
        setNotice('Operação confirmada. Audiência e texto preservados.');
        if (props.operationController) pageRef.current.refresh();
      }
    } catch (cause) {
      setLocalError(
        cause instanceof Error ? cause.message : 'Confirme o texto antes de alterar os blocos.',
      );
    }
  };
  const recover = async () => {
    try {
      return await (props.operationController && props.runExclusive
        ? props.runExclusive(() => mutation.recover(), { recovery: true })
        : mutation.recover());
    } catch (cause) {
      setLocalError(
        cause instanceof Error ? cause.message : 'Resolva a recuperação antes de continuar.',
      );
      return null;
    }
  };
  const refresh = () => {
    mutation.clearConflict();
    page.refresh();
    setNotice('');
  };
  return (
    <section className={styles.navigator} aria-label="Blocos da cena">
      <div className={styles.heading}>
        <h2>Blocos da cena</h2>
        <div className={styles.actions}>
          <Button variant="outline" disabled={locked} onClick={() => setAction({ kind: 'create' })}>
            <FilePlus2 className="icon icon-sm" aria-hidden="true" />
            Novo bloco
          </Button>
          <Button variant="ghost" disabled={locked} onClick={refresh}>
            Atualizar blocos
          </Button>
        </div>
      </div>
      <p className={styles.hint}>
        Cada bloco tem seu próprio texto e audiência. Classificar não publica nem compartilha o
        material.
      </p>
      <Dropdown
        mode="select"
        label="Condição dos blocos"
        value={archived ? 'archived' : 'active'}
        disabled={locked}
        onValueChange={(value) => setArchived(value === 'archived')}
        options={[
          { value: 'active', label: 'Ativos' },
          { value: 'archived', label: 'Arquivados' },
        ]}
      />
      {mutation.pending && (
        <Alert variant="warning">
          Uma operação desta cena ainda não foi confirmada. O pedido original será repetido, sem
          criar outra cópia.
          <Button
            variant="secondary"
            disabled={mutation.busy || props.disabled}
            onClick={() => void recover()}
          >
            Confirmar operação dos blocos
          </Button>
        </Alert>
      )}
      {mutation.error && <Alert variant="destructive">{mutation.error}</Alert>}
      {localError && <Alert variant="destructive">{localError}</Alert>}
      {mutation.conflict && (
        <Alert variant="warning">
          A cena ou a ordem dos blocos mudou. Atualize e confira os dados antes de tentar outra
          operação.
          <Button
            variant="outline"
            disabled={mutation.busy || Boolean(mutation.pending)}
            onClick={refresh}
          >
            Conferir blocos atuais
          </Button>
        </Alert>
      )}
      {notice && <p role="status">{notice}</p>}
      {page.loading ? (
        <LoadingState label="Carregando blocos…" />
      ) : page.error ? (
        <ErrorState
          title="Não foi possível carregar os blocos"
          description={page.error}
          onRetry={refresh}
        />
      ) : !page.page?.items.length ? (
        <EmptyState title={archived ? 'Nenhum bloco arquivado' : 'Nenhum bloco disponível'} />
      ) : (
        <>
          <p className={styles.hint}>
            {mutation.verifying || (mutation.verificationProcessed !== null && mutation.error)
              ? `Último total conhecido: ${page.page.sceneWordCount.toLocaleString('pt-BR')} palavras. A verificação ainda não foi concluída.`
              : `${page.page.sceneWordCount.toLocaleString('pt-BR')} palavras confirmadas na cena.`}
          </p>
          {mutation.verifying && (
            <p role="status">
              Verificando contagem: {mutation.verificationProcessed ?? 0} blocos conferidos.
            </p>
          )}
          <ol className={styles.list}>
            {page.page.items.map((block) => (
              <li className={styles.block} key={JSON.stringify(block.resource)}>
                <div>
                  <Link
                    to={adventureBlockPath(props.adventureId, props.sceneId, block.resource)}
                    aria-current={
                      props.activeResource &&
                      sameBlockResource(props.activeResource, block.resource)
                        ? 'page'
                        : undefined
                    }
                    aria-disabled={locked || undefined}
                    onClick={(event) => {
                      if (locked) event.preventDefault();
                    }}
                  >
                    {block.title}
                  </Link>
                  <div className={styles.actions}>
                    <Badge variant="secondary">{narrativeTypeLabels[block.narrativeType]}</Badge>
                    <Badge>
                      {blockAudienceLabels[block.audience] ?? blockAudienceLabels.creator}
                    </Badge>
                    {block.resource.kind === 'scene' && (
                      <Badge variant="outline">Texto principal</Badge>
                    )}
                    {block.archived && <Badge variant="outline">Arquivado</Badge>}
                  </div>
                  <p className={styles.hint}>
                    {block.wordCount.toLocaleString('pt-BR')} palavras neste bloco.
                  </p>
                </div>
                <div className={styles.actions}>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={'Subir ' + block.title}
                    disabled={locked || archived || block.order === 0}
                    onClick={() =>
                      void run({
                        method: 'moveAdventureBlock',
                        input: {
                          adventureId: props.adventureId,
                          resource: block.resource,
                          expectedRevision: block.revision,
                          expectedStructureRevision: page.page!.structureRevision,
                          operationId: crypto.randomUUID(),
                          direction: 'up',
                        },
                      })
                    }
                  >
                    <ArrowUp className="icon icon-sm" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={'Descer ' + block.title}
                    disabled={locked || archived}
                    onClick={() =>
                      void run({
                        method: 'moveAdventureBlock',
                        input: {
                          adventureId: props.adventureId,
                          resource: block.resource,
                          expectedRevision: block.revision,
                          expectedStructureRevision: page.page!.structureRevision,
                          operationId: crypto.randomUUID(),
                          direction: 'down',
                        },
                      })
                    }
                  >
                    <ArrowDown className="icon icon-sm" aria-hidden="true" />
                  </Button>
                  <Dropdown
                    mode="action"
                    label={'Opções de ' + block.title}
                    disabled={locked}
                    options={[
                      {
                        value: 'edit',
                        label: 'Editar detalhes',
                        icon: <Settings2 className="icon icon-sm" />,
                        onSelect: () => setAction({ kind: 'edit', block }),
                      },
                      {
                        value: 'duplicate',
                        label: 'Duplicar bloco',
                        icon: <Copy className="icon icon-sm" />,
                        onSelect: () => setAction({ kind: 'duplicate', block }),
                      },
                      ...(block.resource.kind === 'block'
                        ? [
                            {
                              value: 'archive',
                              label: block.archived ? 'Restaurar do arquivo' : 'Arquivar bloco',
                              icon: <Archive className="icon icon-sm" />,
                              onSelect: () => setAction({ kind: 'archive', block }),
                            },
                            {
                              value: 'delete',
                              label: 'Excluir bloco',
                              icon: <Trash2 className="icon icon-sm" />,
                              onSelect: () => setAction({ kind: 'delete', block }),
                            },
                          ]
                        : []),
                    ]}
                  />
                </div>
              </li>
            ))}
          </ol>
          {page.moreError && <Alert variant="destructive">{page.moreError}</Alert>}
          {page.page.nextCursor && (
            <Button
              variant="outline"
              disabled={locked || page.loadingMore}
              onClick={() => void page.loadMore()}
            >
              {page.loadingMore ? 'Carregando…' : 'Carregar mais blocos'}
            </Button>
          )}
          <Button
            variant="outline"
            disabled={locked}
            onClick={() =>
              void run({
                method: 'verifyAdventureBlockCount',
                input: {
                  adventureId: props.adventureId,
                  sceneId: props.sceneId,
                  operationId: crypto.randomUUID(),
                  expectedSceneRevision: page.page!.sceneRevision,
                  limit: 25,
                },
              })
            }
          >
            Verificar contagem da cena
          </Button>
        </>
      )}
      {action && (
        <BlockAction
          key={action.kind + ('block' in action ? JSON.stringify(action.block.resource) : '')}
          action={action}
          busy={mutation.busy || Boolean(mutation.pending)}
          conflict={mutation.conflict}
          error={mutation.error}
          onClose={() => {
            if (!mutation.busy) setAction(null);
          }}
          onSubmit={(fields) => {
            const base = { adventureId: props.adventureId, operationId: crypto.randomUUID() };
            if (action.kind === 'create')
              return run({
                method: 'createAdventureBlock',
                input: { ...base, sceneId: props.sceneId, ...fields },
              });
            const resource = action.block.resource,
              expectedRevision = action.block.revision;
            if (action.kind === 'edit')
              return run({
                method: 'updateAdventureBlock',
                input: { ...base, resource, expectedRevision, patch: fields },
              });
            if (action.kind === 'duplicate')
              return run({
                method: 'duplicateAdventureBlock',
                input: { ...base, resource, expectedRevision },
              });
            if (action.kind === 'archive')
              return run({
                method: 'archiveAdventureBlock',
                input: {
                  ...base,
                  blockId: resource.id,
                  expectedRevision,
                  archived: !action.block.archived,
                },
              });
            return run({
              method: 'deleteAdventureBlock',
              input: { ...base, blockId: resource.id, expectedRevision },
            });
          }}
        />
      )}
    </section>
  );
}
type Fields = {
  title: string;
  narrativeType: AdventureNarrativeType;
  audience: AdventureBlockAudience;
};
function BlockAction({
  action,
  busy,
  conflict,
  error,
  onClose,
  onSubmit,
}: {
  action: Action;
  busy: boolean;
  conflict: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (fields: Fields) => Promise<void>;
}) {
  const block = 'block' in action ? action.block : null;
  const [title, setTitle] = useState(block?.title ?? '');
  const [type, setType] = useState<AdventureNarrativeType>(block?.narrativeType ?? 'scene');
  const [audience, setAudience] = useState<AdventureBlockAudience>(block?.audience ?? 'creator');
  const editing = action.kind === 'create' || action.kind === 'edit';
  const titles = {
    create: 'Novo bloco da cena',
    edit: 'Detalhes do bloco',
    duplicate: 'Duplicar bloco',
    archive: block?.archived ? 'Restaurar bloco do arquivo' : 'Arquivar bloco',
    delete: 'Excluir bloco',
  };
  const descriptions = {
    create: 'O bloco começa privado do criador. A classificação não compartilha conteúdo.',
    edit: 'Título, tipo e audiência são independentes do texto e do estágio editorial.',
    duplicate: 'A cópia preserva texto, tipo e audiência, e será acrescentada ao fim desta cena.',
    archive: block?.archived
      ? 'O texto volta à composição uma vez.'
      : 'O texto e seu histórico serão preservados fora da composição.',
    delete:
      'O bloco deixará de estar disponível. Seu histórico permanece no projeto; a origem não será recriada automaticamente.',
  };
  return (
    <Dialog
      open
      title={titles[action.kind]}
      description={descriptions[action.kind]}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant={action.kind === 'delete' ? 'destructive' : 'primary'}
            disabled={busy || conflict || (editing && !title.trim())}
            onClick={() => void onSubmit({ title: title.trim(), narrativeType: type, audience })}
          >
            {busy ? 'Confirmando…' : 'Confirmar bloco'}
          </Button>
        </>
      }
    >
      {editing ? (
        <div className={styles.form}>
          <Input
            label="Título do bloco"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={busy}
            maxLength={300}
          />
          <Dropdown
            mode="select"
            label="Tipo narrativo"
            value={type}
            onValueChange={(value) => setType(value as AdventureNarrativeType)}
            options={narrativeTypes.map((value) => ({ value, label: narrativeTypeLabels[value] }))}
            disabled={busy}
          />
          <Dropdown
            mode="select"
            label="Audiência do bloco"
            value={audience}
            onValueChange={(value) => setAudience(value as AdventureBlockAudience)}
            options={(Object.keys(blockAudienceLabels) as AdventureBlockAudience[]).map(
              (value) => ({ value, label: blockAudienceLabels[value] }),
            )}
            disabled={busy}
          />
        </div>
      ) : (
        <p>
          {block?.title} · {blockAudienceLabels[block?.audience ?? 'creator']}
        </p>
      )}
      {error && <Alert variant="destructive">{error}</Alert>}
    </Dialog>
  );
}
