import { useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import { ImageLibraryPicker } from '@/features/image-library';
import { Alert, Button, Dialog, ErrorState, Input, LoadingState, Textarea } from '@/shared/ui';
import {
  blockErrorMessage,
  type AdventureBlockResource,
  type AdventureBlockSummary,
  type AdventureBlockTotals,
} from '../model/adventureBlock';
import type { AdventureBlockImage } from '../model/adventurePreview';
import { getAdventureBlockImage } from '../services/adventurePreviewService';
import {
  useAdventureBlockMutation,
  type AdventureBlockMutationCallbacks,
} from '../hooks/useAdventureBlockMutation';
import styles from './AdventureBlocks.module.css';
export interface AdventureBlockImageEditorProps {
  adventureId: string;
  sceneId: string;
  resource: AdventureBlockResource;
  revision: number;
  disabled?: boolean;
  runExclusive?: AdventureBlockMutationCallbacks['runExclusive'];
  operationController?: ReturnType<typeof useAdventureBlockMutation>;
  onSceneChange?: (totals: AdventureBlockTotals, block?: AdventureBlockSummary) => void;
  onPendingChange?: (pending: boolean) => void;
  onReservationChange?: (reserved: boolean) => void;
}
export function AdventureBlockImageEditor(props: AdventureBlockImageEditorProps) {
  const { user } = useAuth();
  return user ? (
    <ImageSession
      key={JSON.stringify([
        user.uid,
        props.adventureId,
        props.sceneId,
        props.resource.kind,
        props.resource.id,
      ])}
      {...props}
    />
  ) : null;
}
function ImageSession(props: AdventureBlockImageEditorProps) {
  const active = useRef(true);
  const own = useAdventureBlockMutation(
    props.adventureId,
    props.sceneId,
    props.operationController
      ? {}
      : {
          onPendingChange: (pending) => {
            if (active.current) props.onPendingChange?.(pending);
          },
          onResult: (result) => {
            if (active.current)
              props.onSceneChange?.(result, 'block' in result ? result.block : undefined);
          },
        },
  );
  const mutation = props.operationController ?? own;
  const reserved = useRef(false),
    finish = useRef<(() => void) | null>(null),
    expected = useRef(props.revision);
  const callbacks = useRef(props);
  const readGeneration = useRef(0);
  useLayoutEffect(() => {
    callbacks.current = props;
  });
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      finish.current?.();
      finish.current = null;
    };
  }, []);
  const [open, setOpen] = useState(false),
    [loading, setLoading] = useState(false),
    [picker, setPicker] = useState(false),
    [error, setError] = useState('');
  const [image, setImage] = useState<AdventureBlockImage | null>(null),
    [loaded, setLoaded] = useState(false),
    [outerBusy, setOuterBusy] = useState(false);
  const read = async () => {
    const generation = ++readGeneration.current;
    setLoading(true);
    setLoaded(false);
    setError('');
    try {
      const value = await getAdventureBlockImage({
        adventureId: props.adventureId,
        resource: props.resource,
      });
      if (!active.current || !reserved.current || readGeneration.current !== generation) return;
      if (!value || value.revision !== expected.current)
        throw new Error(
          'O bloco mudou desde o texto aberto. Feche esta janela e confira a revisão do bloco antes de alterar a ilustração.',
        );
      if (
        value.image &&
        (!value.image.imageId ||
          typeof value.image.name !== 'string' ||
          typeof value.image.alt !== 'string' ||
          typeof value.image.caption !== 'string')
      )
        throw new Error('A ilustração do bloco não pôde ser confirmada.');
      setImage(
        value.image
          ? {
              imageId: value.image.imageId,
              name: value.image.name,
              alt: value.image.alt,
              caption: value.image.caption,
            }
          : null,
      );
      setLoaded(true);
    } catch (cause) {
      if (active.current && readGeneration.current === generation)
        setError(blockErrorMessage(cause));
    } finally {
      if (active.current && readGeneration.current === generation) setLoading(false);
    }
  };
  const close = () => {
    if (mutation.isReserved()) return;
    readGeneration.current++;
    setOpen(false);
    setPicker(false);
    finish.current?.();
    finish.current = null;
  };
  const start = async () => {
    if (reserved.current || props.disabled || mutation.isReserved()) return;
    reserved.current = true;
    expected.current = props.revision;
    setOuterBusy(true);
    setError('');
    callbacks.current.onReservationChange?.(true);
    try {
      const work = async () => {
        if (!active.current) return;
        setOpen(true);
        const closed = new Promise<void>((resolve) => {
          finish.current = resolve;
        });
        void read();
        await closed;
      };
      if (props.runExclusive) await props.runExclusive(work, { recovery: false });
      else await work();
    } catch (cause) {
      if (active.current) setError(blockErrorMessage(cause));
    } finally {
      reserved.current = false;
      if (active.current) {
        setOuterBusy(false);
        callbacks.current.onReservationChange?.(false);
      }
    }
  };
  const confirm = async () => {
    if (!loaded || !reserved.current || mutation.isReserved() || mutation.conflict) return;
    const value = await mutation.execute({
      method: 'setAdventureBlockImage',
      input: {
        adventureId: props.adventureId,
        resource: props.resource,
        operationId: crypto.randomUUID(),
        expectedRevision: expected.current,
        image: image ? { imageId: image.imageId, alt: image.alt, caption: image.caption } : null,
      },
    });
    if (value && active.current) close();
  };
  const recover = async () => {
    if (mutation.busy) return;
    try {
      const work = () => mutation.recover();
      const result =
        reserved.current || !props.runExclusive
          ? await work()
          : await props.runExclusive(work, { recovery: true });
      if (result && active.current) {
        if (open) close();
      }
    } catch (cause) {
      if (active.current) setError(blockErrorMessage(cause));
    }
  };
  return (
    <>
      <Button
        variant="outline"
        disabled={props.disabled || outerBusy || mutation.busy || Boolean(mutation.pending)}
        onClick={() => void start()}
      >
        Ilustração do bloco
      </Button>
      {!open && error && <Alert variant="destructive">{error}</Alert>}
      {!open && mutation.pending?.method === 'setAdventureBlockImage' && (
        <Alert variant="warning">
          A ilustração ainda não foi confirmada. O pedido original foi preservado.
          <Button disabled={mutation.busy || props.disabled} onClick={() => void recover()}>
            Confirmar ilustração pendente
          </Button>
        </Alert>
      )}
      <Dialog
        open={open}
        onClose={close}
        title="Ilustração do bloco"
        description="Escolha uma imagem da sua biblioteca. A ilustração segue a audiência atual do bloco."
        footer={
          <div className={styles.actions}>
            <Button
              variant="outline"
              disabled={mutation.busy || Boolean(mutation.pending)}
              onClick={close}
            >
              Cancelar
            </Button>
            {mutation.pending ? (
              <Button disabled={mutation.busy} onClick={() => void recover()}>
                Confirmar mesmo pedido de ilustração
              </Button>
            ) : (
              <Button
                disabled={!loaded || loading || mutation.busy || mutation.conflict}
                onClick={() => void confirm()}
              >
                Salvar ilustração
              </Button>
            )}
          </div>
        }
      >
        {loading ? (
          <LoadingState label="Carregando ilustração do bloco…" />
        ) : !loaded ? (
          <ErrorState
            title="Ilustração indisponível"
            description={error}
            onRetry={() => void read()}
          />
        ) : (
          <div className={styles.form}>
            <p>{image ? `Imagem selecionada: ${image.name}` : 'Este bloco não tem ilustração.'}</p>
            <div className={styles.actions}>
              <Button
                disabled={mutation.busy || Boolean(mutation.pending) || mutation.conflict}
                onClick={() => setPicker(true)}
              >
                Escolher imagem da biblioteca
              </Button>
              {image && (
                <Button
                  variant="outline"
                  disabled={mutation.busy || Boolean(mutation.pending) || mutation.conflict}
                  onClick={() => setImage(null)}
                >
                  Remover ilustração
                </Button>
              )}
            </div>
            {image && (
              <>
                <Input
                  label="Texto alternativo da ilustração"
                  value={image.alt}
                  maxLength={1000}
                  disabled={mutation.busy || Boolean(mutation.pending) || mutation.conflict}
                  onChange={(event) => setImage({ ...image, alt: event.target.value })}
                />
                <Textarea
                  label="Legenda da ilustração"
                  value={image.caption}
                  maxLength={4000}
                  disabled={mutation.busy || Boolean(mutation.pending) || mutation.conflict}
                  onChange={(event) => setImage({ ...image, caption: event.target.value })}
                />
              </>
            )}
          </div>
        )}
        {loaded && error && <Alert variant="destructive">{error}</Alert>}
        {mutation.error && <Alert variant="destructive">{mutation.error}</Alert>}
        {mutation.conflict && (
          <Alert variant="warning">
            A revisão mudou. A seleção foi preservada, mas é necessário fechar e conferir o texto
            atual antes de um novo pedido.
          </Alert>
        )}
        {mutation.pending && (
          <Alert variant="warning">
            A confirmação ainda está pendente. A escrita continua reservada; repita o mesmo pedido
            para concluir.
          </Alert>
        )}
        <ImageLibraryPicker
          open={picker}
          onClose={() => setPicker(false)}
          onSelect={(selected) => {
            if (!active.current || !reserved.current || mutation.isReserved()) return;
            setImage({
              imageId: selected.id,
              name: selected.name,
              alt: image?.alt ?? '',
              caption: image?.caption ?? '',
            });
            setPicker(false);
          }}
        />
      </Dialog>
    </>
  );
}
