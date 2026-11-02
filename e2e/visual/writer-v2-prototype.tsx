import { useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BookOpen, Feather, Library, ShoppingBag, Globe, Lock } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Textarea,
} from '@/shared/ui';
import { ThemeProvider, ThemeToggle } from '@/shared/theme';
import '@/styles/globals.css';
import styles from './writer-v2-prototype.module.css';

type Screen =
  | 'Estúdio'
  | 'Universos'
  | 'Publicações'
  | 'Catálogo'
  | 'Biblioteca'
  | 'Escrita'
  | 'Revisão'
  | 'Sessão'
  | 'Portal';
type Scenario = 'Sucesso' | 'Carregando' | 'Vazio' | 'Erro';
type Confirmation = 'reveal' | 'publish' | 'restore' | null;
type Purchase = 'none' | 'pending' | 'active' | 'suspended' | 'revoked';
type CampaignOrigin = 'author' | 'purchase';

const chapter =
  'A primeira pessoa a desembarcar carregava uma caixa de ferramentas. A segunda trazia sementes. Lia deixou que ambas entrassem na oficina.';
const secret = 'Um canal subterrâneo leva água à torre e desloca uma peça solta que toca o sino.';
const navigation = [
  { name: 'Universos', Icon: Globe },
  { name: 'Estúdio', Icon: Feather },
  { name: 'Publicações', Icon: BookOpen },
  { name: 'Catálogo', Icon: ShoppingBag },
  { name: 'Biblioteca', Icon: Library },
] as const;

function WorkCard({
  title,
  label,
  children,
}: {
  title: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <Card className={styles.card}>
      <CardContent className="p-6">
        <Badge variant="outline">{label}</Badge>
        <h2>{title}</h2>
        {children}
      </CardContent>
    </Card>
  );
}

export function Prototype() {
  const [screen, setScreen] = useState<Screen>('Estúdio');
  const [scenario, setScenario] = useState<Scenario>('Sucesso');
  const [text, setText] = useState(chapter);
  const [notes, setNotes] = useState({
    author: 'Mesa A: preservar a passagem e anunciar manutenção.',
    purchase: 'Minha mesa adquirida: preparar a feira.',
  });
  const [revelations, setRevelations] = useState({ author: false, purchase: false });
  const [campaignOrigin, setCampaignOrigin] = useState<CampaignOrigin>('author');
  const [acquiredCampaignCreated, setAcquiredCampaignCreated] = useState(false);
  const [published, setPublished] = useState(false);
  const [suggestion, setSuggestion] = useState(false);
  const [purchase, setPurchase] = useState<Purchase>('none');
  const [revocationReason, setRevocationReason] = useState('reembolso integral');
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [notice, setNotice] = useState('');
  const main = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const restricted = campaignOrigin === 'purchase' && purchase !== 'active';
  const campaignTitle =
    campaignOrigin === 'author' ? 'Mesa A · origem autoral' : 'Minha mesa adquirida · edição 1';
  const note = notes[campaignOrigin];
  const revealed = revelations[campaignOrigin];

  function openCampaign(origin: CampaignOrigin, next: Screen = 'Sessão') {
    setCampaignOrigin(origin);
    if (origin === 'purchase') setAcquiredCampaignCreated(true);
    go(next);
  }

  function go(next: Screen) {
    setScreen(next);
    setScenario('Sucesso');
    setNotice('');
    requestAnimationFrame(() => main.current?.focus());
  }
  function confirm(kind: Confirmation, button: HTMLButtonElement) {
    trigger.current = button;
    setConfirmation(kind);
  }
  function applyConfirmation() {
    if (confirmation === 'reveal' && !restricted) {
      setRevelations((current) => ({ ...current, [campaignOrigin]: true }));
      setNotice('Mara e a pista foram liberadas para os jogadores.');
    }
    if (confirmation === 'publish') {
      setPublished(true);
      setNotice('Edição preparada na demonstração; capítulo 1 escolhido como amostra.');
    }
    if (confirmation === 'restore') {
      setText(chapter);
      setNotice('Versão anterior restaurada na demonstração.');
    }
    setConfirmation(null);
  }

  const content = (() => {
    switch (screen) {
      case 'Estúdio':
        return (
          <div className={styles.grid}>
            <WorkCard title="A última luz do cais" label="Livro · privado">
              <p className={styles.meta}>Próxima escrita · Capítulo 2 — A travessia</p>
              <p>Retome a chegada da balsa e a escolha de Lia.</p>
              <div className={styles.actions}>
                <Button onClick={() => go('Escrita')}>Continuar escrita</Button>
                <Button variant="outline" onClick={() => go('Revisão')}>
                  Revisar capítulo
                </Button>
              </div>
            </WorkCard>
            <WorkCard title="O sino da aldeia · Mesa A" label="Campanha autoral · só o mestre">
              <p className={styles.meta}>Próxima sessão · A feira e a torre</p>
              <p>Uma mesa a partir de sua aventura autoral O sino da aldeia.</p>
              <div className={styles.actions}>
                <Button onClick={() => openCampaign('author')}>Preparar sessão</Button>
                <Button variant="outline" onClick={() => openCampaign('author', 'Portal')}>
                  Ver portal dos jogadores
                </Button>
              </div>
            </WorkCard>
            <WorkCard title="O sino da aldeia" label="Aventura · original reutilizável">
              <p>
                Praça, torre, Mara e pistas. Esta origem não muda quando uma mesa registra suas
                consequências.
              </p>
              <Button variant="outline" onClick={() => openCampaign('author')}>
                Abrir campanha de demonstração
              </Button>
            </WorkCard>
            {acquiredCampaignCreated && (
              <WorkCard
                title="O sino da aldeia · Minha mesa adquirida"
                label="Campanha · edição comprada"
              >
                <p>
                  Notas próprias separadas do material adquirido. O acesso ao material depende da
                  compra vigente.
                </p>
                <Button variant="outline" onClick={() => openCampaign('purchase')}>
                  Abrir campanha adquirida
                </Button>
              </WorkCard>
            )}
          </div>
        );
      case 'Universos':
        return (
          <WorkCard title="Costa das lanternas" label="Universo · privado">
            <p>
              Origem do conto e da aventura. Cada campanha conserva suas próprias consequências.
            </p>
            <p>
              <strong>Mesa A:</strong> manutenção e passagem preservada.
            </p>
            <p>
              <strong>Mesa B:</strong> assembleia para proteger a nascente.
            </p>
            <Alert title="Cânone preservado">
              Consequências de uma mesa só mudam o universo após proposta e aceite do dono.
            </Alert>
            <Button className="mt-4" onClick={() => go('Estúdio')}>
              Ver projetos deste universo
            </Button>
          </WorkCard>
        );
      case 'Escrita':
        return (
          <div className={styles.stack}>
            <WorkCard title="Capítulo 2 — A travessia" label="Manuscrito · privado">
              <p className={styles.meta}>
                Objetivo da cena: decidir o que salvar quando a balsa chega.
              </p>
              <Textarea
                label="Texto do capítulo"
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={8}
                className={styles.manuscript}
              />
              <div className={`${styles.actions} mt-4`}>
                <Button onClick={() => setNotice('Rascunho salvo nesta demonstração.')}>
                  Salvar rascunho
                </Button>
                <Button
                  variant="outline"
                  onClick={(event) => confirm('restore', event.currentTarget)}
                >
                  Restaurar versão anterior
                </Button>
                <Button variant="outline" onClick={() => go('Revisão')}>
                  Abrir revisão
                </Button>
              </div>
            </WorkCard>
            <Alert title="Segredo privado de Lia">
              <Lock className="icon icon-sm" aria-hidden="true" /> Ela conhece a causa da pane, mas
              ainda não decidiu contá-la.
            </Alert>
          </div>
        );
      case 'Revisão':
        return (
          <WorkCard title="Rodada de revisão · Capítulo 1" label="Snapshot · revisor convidado">
            <p className={styles.manuscript}>
              Lia acendeu a lanterna no cais. Do outro lado da água, três clarões responderam.
            </p>
            <p className={styles.meta}>
              Nesta rodada, o revisor recebe somente o capítulo 1. Notas, segredo e manuscrito vivo
              ficam privados.
            </p>
            <Alert title="Comentário de demonstração">
              A chegada à oficina poderia reforçar a escolha de Lia.
            </Alert>
            <div className={`${styles.actions} mt-4`}>
              <Button
                onClick={() => {
                  setSuggestion(true);
                  setNotice('Comentário marcado para resolver; o manuscrito permanece intacto.');
                }}
              >
                Marcar para resolver
              </Button>
              <Button variant="outline" onClick={() => go('Escrita')}>
                Voltar ao manuscrito
              </Button>
              <Button variant="outline" onClick={() => go('Publicações')}>
                Preparar publicação
              </Button>
            </div>
            {suggestion && <p>Pendência editorial: reforçar a escolha de Lia na travessia.</p>}
          </WorkCard>
        );
      case 'Sessão':
        return (
          <div className={styles.grid}>
            <WorkCard title="A feira e a torre" label={campaignTitle}>
              {restricted ? (
                <Alert title="Material adquirido indisponível">
                  A compra está suspensa ou revogada. Suas notas próprias continuam acessíveis.
                </Alert>
              ) : (
                <>
                  <p>Investigar a praça, conversar com Mara e seguir a pista até a torre.</p>
                  <p>
                    <strong>Material para revelar:</strong> Mara protege os registros. Há barro
                    fresco nos degraus apesar da estiagem.
                  </p>
                </>
              )}
              <div className={styles.actions}>
                {!restricted && (
                  <Button onClick={(event) => confirm('reveal', event.currentTarget)}>
                    Revelar Mara e a pista
                  </Button>
                )}
                <Button variant="outline" onClick={() => go('Portal')}>
                  Conferir portal dos jogadores
                </Button>
              </div>
            </WorkCard>
            <WorkCard title="Preparação do mestre" label="Privado · não vai ao portal">
              {!restricted && <p>{secret}</p>}
              <Textarea
                label="Notas e consequências próprias"
                value={note}
                rows={5}
                onChange={(event) =>
                  setNotes((current) => ({ ...current, [campaignOrigin]: event.target.value }))
                }
              />
              <Button
                className="mt-4"
                onClick={() =>
                  setNotice(
                    'Notas próprias salvas nesta demonstração; universo original preservado.',
                  )
                }
              >
                Registrar consequência local
              </Button>
            </WorkCard>
          </div>
        );
      case 'Portal':
        return (
          <WorkCard title={`Portal · ${campaignTitle}`} label="Audiência: jogadores da mesa">
            {restricted ? (
              <Alert title="Material adquirido indisponível">
                A revelação depende da compra vigente.
              </Alert>
            ) : revealed ? (
              <>
                <h3>Mara e a pista</h3>
                <p>Mara protege os registros. Há barro fresco nos degraus apesar da estiagem.</p>
              </>
            ) : (
              <EmptyState
                title="Nenhum material revelado"
                description="O mestre ainda não liberou materiais para esta mesa."
              />
            )}
            <Button variant="outline" onClick={() => go('Sessão')}>
              Voltar à visão do mestre
            </Button>
          </WorkCard>
        );
      case 'Publicações':
        return (
          <WorkCard
            title="A última luz do cais · edição 1"
            label={published ? 'Edição preparada · demonstração' : 'Rascunho de edição'}
          >
            <p>Conteúdo da edição: capítulos 1 e 2. Amostra pública: somente capítulo 1.</p>
            <p>Segredo, notas privadas e conversa editorial não fazem parte da edição.</p>
            <div className={styles.actions}>
              <Button onClick={(event) => confirm('publish', event.currentTarget)}>
                Conferir e preparar edição
              </Button>
              <Button variant="outline" onClick={() => go('Catálogo')}>
                Ver catálogo demonstrativo
              </Button>
            </div>
            {published && (
              <Alert className="mt-4" title="Distribuição prevista">
                Publicação Writer e EPUB; nenhum arquivo real foi gerado no protótipo.
              </Alert>
            )}
          </WorkCard>
        );
      case 'Catálogo':
        return (
          <div className={styles.grid}>
            <WorkCard title="A última luz do cais" label="Livro · edição 1">
              <p>Uma reparadora de faróis e a chegada da última balsa.</p>
              <p>Amostra: capítulo 1. Download e leitura da edição adquirida.</p>
              <Button
                variant="outline"
                onClick={() =>
                  setNotice(
                    'Amostra: Lia acendeu a lanterna no cais. Do outro lado da água, três clarões responderam.',
                  )
                }
              >
                Ler amostra do conto
              </Button>
            </WorkCard>
            <WorkCard title="O sino da aldeia" label="Aventura · edição 1">
              <p>Investigue o sino e prepare suas próprias mesas.</p>
              <p>
                Compra avulsa, download e uso em campanhas próprias; sem revenda do conteúdo
                exclusivo.
              </p>
              <p className={styles.meta}>
                Preço fictício do cenário: R$ 30,00. Vendedor: fornecedor de demonstração.
                Identificação comercial completa será exigida na oferta real.
              </p>
              <Button
                onClick={() => {
                  setPurchase('pending');
                  setNotice(
                    'Pedido de demonstração pendente. Aguarde a confirmação do cenário; ainda não há acesso.',
                  );
                }}
              >
                Iniciar compra simulada
              </Button>
              <Button className="mt-3" variant="outline" onClick={() => go('Biblioteca')}>
                Consultar biblioteca
              </Button>
            </WorkCard>
          </div>
        );
      case 'Biblioteca':
        return (
          <div className={styles.stack}>
            <WorkCard
              title="O sino da aldeia · edição 1"
              label={`Compra: ${{ none: 'não adquirida', pending: 'pagamento pendente', active: 'acesso ativo', suspended: 'disputa aberta · suspenso', revoked: `${revocationReason} · revogado` }[purchase]}`}
            >
              {purchase === 'active' ? (
                <>
                  <p>A edição adquirida permanece na biblioteca; atualizações são opcionais.</p>
                  <div className={styles.actions}>
                    <Button onClick={() => openCampaign('purchase')}>
                      Usar na campanha própria
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        setNotice('Download demonstrado. Nenhum arquivo comercial foi gerado.')
                      }
                    >
                      Obter pacote demonstrativo
                    </Button>
                  </div>
                </>
              ) : (
                <Alert title="Conteúdo indisponível">
                  {purchase === 'pending'
                    ? 'O pedido aguarda confirmação. Retornar do checkout não libera a edição.'
                    : 'Novos acessos e downloads exigem direito vigente.'}
                </Alert>
              )}
            </WorkCard>
            <WorkCard title="Notas próprias da mesa adquirida" label="Privado · pertence ao mestre">
              <p>{notes.purchase}</p>
              <p className={styles.meta}>
                Permanecem acessíveis quando o conteúdo comprado está suspenso ou revogado.
              </p>
            </WorkCard>
          </div>
        );
    }
  })();

  return (
    <div className={styles.shell}>
      <a className={styles.skip} href="#prototype-content">
        Pular para o conteúdo
      </a>
      <header className={styles.header}>
        <div className={styles.brand}>
          <Feather className="icon" aria-hidden="true" />
          Writer <Badge variant="secondary">Protótipo local</Badge>
        </div>
        <ThemeToggle showLabel />
      </header>
      <p className={styles.meta}>
        Dados fictícios. Publicação, compra e compartilhamento são demonstrações, sem serviços
        reais. Recarregar reinicia o cenário.
      </p>
      <nav className={styles.navigation} aria-label="Espaços do Writer">
        {navigation.map(({ name, Icon }) => (
          <Button
            key={name}
            variant={screen === name ? 'primary' : 'ghost'}
            aria-current={screen === name ? 'page' : undefined}
            onClick={() => go(name)}
          >
            <Icon className="icon icon-sm" aria-hidden="true" />
            {name}
          </Button>
        ))}
      </nav>
      <main id="prototype-content" tabIndex={-1} ref={main}>
        <PageHeader
          title={screen}
          description={
            screen === 'Estúdio'
              ? 'Seu próximo trecho e sua próxima sessão, em um só lugar.'
              : undefined
          }
          actions={
            !navigation.some(({ name }) => name === screen) ? (
              <Button variant="outline" onClick={() => go('Estúdio')}>
                Voltar ao Estúdio
              </Button>
            ) : undefined
          }
        />
        <div className={styles.notice} role="status">
          {notice}
        </div>
        {scenario === 'Carregando' ? (
          <LoadingState label="Carregando este espaço..." />
        ) : scenario === 'Vazio' ? (
          <EmptyState
            title="Este espaço ainda está vazio"
            description="Volte ao Estúdio para escolher um trabalho."
            action={<Button onClick={() => go('Estúdio')}>Escolher trabalho</Button>}
          />
        ) : scenario === 'Erro' ? (
          <ErrorState
            description="Não foi possível carregar este espaço. Seu trabalho foi preservado."
            onRetry={() => setScenario('Sucesso')}
          />
        ) : (
          content
        )}
      </main>
      <aside className={styles.scenario} aria-label="Controles do cenário de demonstração">
        <span>Ensaio do protótipo · estados e pagamento fictícios</span>
        {(['Sucesso', 'Carregando', 'Vazio', 'Erro'] as const).map((state) => (
          <Button
            key={state}
            size="sm"
            variant="outline"
            aria-pressed={scenario === state}
            onClick={() => setScenario(state)}
          >
            {state}
          </Button>
        ))}
        {purchase === 'pending' && (
          <Button
            size="sm"
            onClick={() => {
              setPurchase('active');
              setNotice('Pagamento aprovado no cenário fictício; edição disponível na Biblioteca.');
            }}
          >
            Simular confirmação do pagamento
          </Button>
        )}
        {purchase === 'active' && (
          <>
            <Button size="sm" variant="outline" onClick={() => setPurchase('suspended')}>
              Simular disputa aberta
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setRevocationReason('reembolso integral');
                setPurchase('revoked');
              }}
            >
              Simular reembolso integral
            </Button>
          </>
        )}
        {purchase === 'suspended' && (
          <>
            <Button size="sm" variant="outline" onClick={() => setPurchase('active')}>
              Simular disputa ganha
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setRevocationReason('disputa perdida');
                setPurchase('revoked');
              }}
            >
              Simular disputa perdida
            </Button>
          </>
        )}
      </aside>
      <Dialog
        open={confirmation !== null}
        onClose={() => setConfirmation(null)}
        title={
          confirmation === 'reveal'
            ? 'Conferir revelação'
            : confirmation === 'publish'
              ? 'Conferir edição e amostra'
              : 'Restaurar versão anterior'
        }
        description="Confirmação no protótipo; nenhum serviço real será alterado."
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (trigger.current?.isConnected) trigger.current.focus();
          else main.current?.focus();
        }}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmation(null)}>
              Cancelar
            </Button>
            <Button onClick={applyConfirmation}>Confirmar demonstração</Button>
          </>
        }
      >
        {confirmation === 'reveal' ? (
          <>
            <p>
              <strong>Audiência:</strong> jogadores da{' '}
              {campaignOrigin === 'author' ? 'Mesa A' : 'mesa adquirida'}.
            </p>
            <p>
              <strong>Conteúdo:</strong> Mara e pista do barro. Preparação secreta e notas próprias
              continuam privadas.
            </p>
          </>
        ) : confirmation === 'publish' ? (
          <>
            <p>
              <strong>Audiência:</strong> leitor da edição; visitantes recebem somente a amostra do
              capítulo 1.
            </p>
            <p>Capítulos 1 e 2 na edição. Segredo e notas não serão incluídos.</p>
          </>
        ) : (
          <p>
            O texto atual do capítulo 2 será substituído pela versão inicial deste cenário. Confira
            antes de continuar.
          </p>
        )}
      </Dialog>
    </div>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Raiz do protótipo ausente.');
createRoot(root).render(
  <ThemeProvider>
    <Prototype />
  </ThemeProvider>,
);
