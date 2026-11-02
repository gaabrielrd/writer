import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { renderRichText } from '@/shared/lib';
import { Badge, Button, Card, Dialog, Dropdown, LoadingState } from '@/shared/ui';
import type {
  SessionSceneArchive,
  SessionSceneBlockSummary,
  SessionSceneReadScope,
  SessionSceneReadEnvelope,
  SessionSceneBlocksPage,
} from '../model/sessionSceneReference';
import {
  listCampaignSessionSceneBlocks,
  readCampaignSessionSceneImage,
} from '../services/sessionReferenceCallables';
import {
  readCompleteSessionScene,
  validateSceneBlocks,
  validateSceneImage,
} from '../services/sessionSceneReferenceService';
import { canonical } from '../services/sessionReferenceService';
import styles from './References.module.css';
interface Props {
  uid: string;
  scope: SessionSceneReadScope;
  sceneKey: string;
  active: () => boolean;
  observe: (value: SessionSceneReadEnvelope) => void;
  onError: (cause: unknown) => void;
  onClose: () => void;
}
type Complete = Awaited<ReturnType<typeof readCompleteSessionScene>>;
const audienceLabels = { creator: 'Criador', gm: 'Mestre', players: 'Jogadores' };
const typeLabels = {
  introduction: 'Introdução',
  preparation: 'Preparação',
  scene: 'Cena',
  location: 'Local',
  quest: 'Missão',
  clue: 'Pista',
  ending: 'Encerramento',
};
const planLabels = { objective: 'Objetivo', conflict: 'Conflito', pointOfView: 'Ponto de vista' };
export function SessionSceneReader(props: Props) {
  const [archive, setArchive] = useState<SessionSceneArchive>('active'),
    [plan, setPlan] = useState<Complete>(null),
    [planLoading, setPlanLoading] = useState(true),
    [page, setPage] = useState<SessionSceneBlocksPage | null>(null),
    [blocksLoading, setBlocksLoading] = useState(true),
    [selected, setSelected] = useState<string | null>(null),
    [body, setBody] = useState<Complete>(null),
    [bodyLoading, setBodyLoading] = useState(false),
    [image, setImage] = useState<string | null>(null),
    [imageOpen, setImageOpen] = useState(false),
    [imageLoading, setImageLoading] = useState(false),
    [unavailable, setUnavailable] = useState(false);
  const alive = useRef(true),
    latest = useRef(props),
    listOwner = useRef(0),
    bodyOwner = useRef(0),
    imageOwner = useRef(0),
    planOwner = useRef(0),
    seen = useRef(new Set<string>());
  useLayoutEffect(() => {
    latest.current = props;
  });
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const active = () => alive.current && latest.current.active();
  function clearBlock() {
    bodyOwner.current++;
    imageOwner.current++;
    setSelected(null);
    setBody(null);
    setImage(null);
    setImageOpen(false);
    setImageLoading(false);
    setBodyLoading(false);
  }
  function reject(cause: unknown) {
    if (active()) latest.current.onError(cause);
  }
  async function loadPlan() {
    const own = ++planOwner.current;
    setPlan(null);
    setPlanLoading(true);
    try {
      const value = await readCompleteSessionScene(
        props.scope,
        props.uid,
        props.sceneKey,
        () => active() && planOwner.current === own,
        (v) => latest.current.observe(v),
      );
      if (!active() || planOwner.current !== own) return;
      setPlan(value);
    } catch (cause) {
      if (active() && planOwner.current === own) reject(cause);
    } finally {
      if (active() && planOwner.current === own) setPlanLoading(false);
    }
  }
  async function loadBlocks(next?: string) {
    const own = ++listOwner.current;
    setBlocksLoading(true);
    try {
      const value = await listCampaignSessionSceneBlocks({
        ...props.scope,
        archive,
        ...(next ? { cursor: next } : {}),
        limit: 25,
      });
      if (!active() || listOwner.current !== own) return;
      validateSceneBlocks(value, props.uid, props.scope, props.sceneKey, (v) =>
        latest.current.observe(v),
      );
      if (!active() || listOwner.current !== own) return;
      if (next && page && canonical(value.scene) !== canonical(page.scene))
        throw new Error('A cena mudou durante a paginação. Consulte novamente.');
      if (value.nextCursor && seen.current.has(value.nextCursor))
        throw new Error('A página dos blocos não pôde ser confirmada.');
      if (!next) seen.current.clear();
      if (value.nextCursor) seen.current.add(value.nextCursor);
      setPage((old) => ({
        ...value,
        items:
          next && old
            ? [
                ...old.items,
                ...value.items.filter((i) => !old.items.some((p) => p.sourceKey === i.sourceKey)),
              ]
            : value.items,
      }));
      setUnavailable(value.scene === null);
    } catch (cause) {
      if (active() && listOwner.current === own) reject(cause);
    } finally {
      if (active() && listOwner.current === own) setBlocksLoading(false);
    }
  }
  useEffect(() => {
    let current = true;
    queueMicrotask(() => {
      if (current) {
        void loadPlan();
        void loadBlocks();
      }
    });
    return () => {
      current = false;
    };
  }, [archive]); // eslint-disable-line react-hooks/exhaustive-deps
  async function select(block: SessionSceneBlockSummary) {
    clearBlock();
    setSelected(block.sourceKey);
    setBodyLoading(true);
    const own = bodyOwner.current;
    try {
      const value = await readCompleteSessionScene(
        { ...props.scope, blockKey: block.sourceKey },
        props.uid,
        props.sceneKey,
        () => active() && own === bodyOwner.current,
        (v) => latest.current.observe(v),
      );
      if (!active() || own !== bodyOwner.current) return;
      if (value && value.item.kind === 'block') {
        const { fields: _, image: __, ...summary } = value.item;
        void _;
        void __;
        if (canonical(summary) !== canonical(block))
          throw new Error('O bloco mudou. Consulte novamente.');
      }
      setBody(value);
    } catch (cause) {
      if (active() && own === bodyOwner.current) reject(cause);
    } finally {
      if (active() && own === bodyOwner.current) setBodyLoading(false);
    }
  }
  async function showImage() {
    if (!body || body.item.kind !== 'block' || !body.item.image) return;
    const item = body.item,
      own = ++imageOwner.current;
    setImage(null);
    setImageOpen(true);
    setImageLoading(true);
    try {
      const input = { ...props.scope, blockKey: item.sourceKey };
      const value = await readCampaignSessionSceneImage(input);
      if (!active() || imageOwner.current !== own) return;
      const media = validateSceneImage(value, props.uid, input, item.image!.imageKey, (v) =>
        latest.current.observe(v),
      );
      if (active() && imageOwner.current === own) setImage(media);
    } catch (cause) {
      if (active() && imageOwner.current === own) reject(cause);
    } finally {
      if (active() && imageOwner.current === own) setImageLoading(false);
    }
  }
  function closeImage() {
    imageOwner.current++;
    setImage(null);
    setImageOpen(false);
    setImageLoading(false);
  }
  function close() {
    listOwner.current++;
    planOwner.current++;
    clearBlock();
    props.onClose();
  }
  return (
    <Dialog
      open
      onClose={close}
      title="Cena vinculada à sessão"
      description="Planejamento e blocos da base ativa, consultados sem alterar sua preparação."
      footer={
        <Button variant="outline" onClick={close}>
          Fechar cena vinculada
        </Button>
      }
    >
      <div className={styles.stack}>
        {unavailable ? (
          <p>Cena indisponível nesta consulta.</p>
        ) : (
          <>
            <Card className={styles.panel}>
              <h4>Planejamento da cena</h4>
              {planLoading ? (
                <LoadingState label="Conferindo planejamento da cena..." />
              ) : plan ? (
                <>
                  <h5>{plan.item.title}</h5>
                  {plan.item.archived && <Badge variant="outline">Arquivo da cena</Badge>}
                  {Object.entries(planLabels).map(([key, label]) => (
                    <section key={key}>
                      <h5>{label}</h5>
                      <p className={styles.text}>
                        {Object.hasOwn(plan.fields, key)
                          ? plan.fields[key] || 'Campo capturado sem texto.'
                          : 'Campo não capturado nesta base.'}
                      </p>
                    </section>
                  ))}
                </>
              ) : (
                <p>Planejamento indisponível nesta consulta.</p>
              )}
            </Card>
            <section className={styles.stack} aria-label="Blocos capturados da cena">
              <h4>Blocos da cena</h4>
              <Dropdown
                mode="select"
                label="Blocos disponíveis"
                value={archive}
                options={[
                  { value: 'active', label: 'Ativos' },
                  { value: 'archived', label: 'Arquivo' },
                  { value: 'all', label: 'Todos' },
                ]}
                onValueChange={(v) => {
                  if (v === archive) return;
                  listOwner.current++;
                  planOwner.current++;
                  clearBlock();
                  setPage(null);
                  setPlan(null);
                  seen.current.clear();
                  setArchive(v as SessionSceneArchive);
                }}
              />
              {blocksLoading && <LoadingState label="Consultando blocos da cena..." />}
              <ul className={styles.list}>
                {page?.items.map((block) => (
                  <li key={block.sourceKey}>
                    <p>
                      {block.title} · {block.role === 'main' ? 'Principal' : 'Adicional'}
                    </p>
                    <p>
                      Audiência: {audienceLabels[block.audience]} · Tipo: {typeLabels[block.type]}
                    </p>
                    {block.archived && <Badge variant="outline">Arquivo</Badge>}
                    <Button
                      variant="outline"
                      aria-label={'Ler bloco ' + block.title}
                      onClick={() => void select(block)}
                    >
                      Ler bloco
                    </Button>
                  </li>
                ))}
              </ul>
              {!blocksLoading && !page?.items.length && (
                <p>
                  {page?.nextCursor
                    ? 'Esta janela está vazia; há mais blocos para consultar.'
                    : 'Nenhum bloco disponível neste recorte.'}
                </p>
              )}
              {page?.nextCursor && (
                <Button
                  variant="outline"
                  disabled={blocksLoading}
                  onClick={() => void loadBlocks(page.nextCursor!)}
                >
                  Carregar mais blocos
                </Button>
              )}
            </section>
            {selected && (
              <Card className={styles.panel} aria-label="Bloco selecionado">
                {bodyLoading ? (
                  <LoadingState label="Conferindo texto completo do bloco..." />
                ) : body ? (
                  <>
                    <h4>{body.item.title}</h4>
                    <div
                      className={styles.rich}
                      dangerouslySetInnerHTML={{
                        __html: renderRichText(body.fields.content ?? ''),
                      }}
                    />
                    {body.item.kind === 'block' && body.item.image && (
                      <>
                        <p className={styles.text}>
                          Descrição da ilustração: {body.item.image.alt}
                        </p>
                        <p className={styles.text}>{body.item.image.caption}</p>
                        <Button variant="outline" onClick={() => void showImage()}>
                          Ver ilustração do bloco
                        </Button>
                      </>
                    )}
                  </>
                ) : (
                  <p>Bloco indisponível nesta consulta.</p>
                )}
              </Card>
            )}
          </>
        )}
        <Dialog
          open={imageOpen}
          onClose={closeImage}
          title="Ilustração do bloco"
          description="Imagem capturada e autorizada para a sessão."
          footer={
            <Button variant="outline" onClick={closeImage}>
              Fechar ilustração
            </Button>
          }
        >
          {imageLoading ? (
            <LoadingState label="Conferindo ilustração do bloco..." />
          ) : image && body?.item.kind === 'block' && body.item.image ? (
            <figure>
              <img className={styles.image} src={image} alt={body.item.image.alt} />
              <figcaption className={styles.text}>{body.item.image.caption}</figcaption>
            </figure>
          ) : (
            <p>Ilustração indisponível nesta consulta.</p>
          )}
        </Dialog>
      </div>
    </Dialog>
  );
}
