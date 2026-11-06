import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/features/auth';
import { groupChapters, actName } from '@/features/books';
import { Alert, Badge, Button, Dropdown, EmptyState, ErrorState, LoadingState } from '@/shared/ui';
import { readLiteraryBookMapPage } from '../services/literaryBookMapService';
import {
  emptyBookMap,
  mapSubjects,
  mapSubjectIndex,
  mapCharacters,
  type BookMapData,
  type BookMapPlan,
  type BookMapResource,
} from '../model/bookMap';
import { statusLabels } from '../model/editorial';
import styles from './EditorialContractPanel.module.css';

const resources: BookMapResource[] = ['acts', 'chapters', 'events', 'plans'];
const resourceLabels = { acts: 'atos', chapters: 'capítulos', events: 'eventos', plans: 'fichas' };
interface Checkpoint {
  data: BookMapData;
  step: number;
  afterId: string | null;
  fence: string | null;
  pages: number;
  seen: Set<string>;
}
export function LiteraryBookMapPanel({ bookId }: { bookId: string }) {
  const { user } = useAuth();
  return user ? (
    <BookMapSession key={user.uid + ':' + bookId} bookId={bookId} />
  ) : (
    <ErrorState message="Entre na sua conta para consultar o mapa privado." />
  );
}
function BookMapSession({ bookId }: { bookId: string }) {
  const [data, setData] = useState<BookMapData>(emptyBookMap);
  const [phase, setPhase] = useState<'reading' | 'pausing' | 'paused' | 'complete' | 'error'>(
    'reading',
  );
  const [progress, setProgress] = useState('Iniciando leitura');
  const [error, setError] = useState('');
  const [view, setView] = useState<'reading' | 'chronology' | 'character'>('reading');
  const [character, setCharacter] = useState('');
  const [trajectoryOrder, setTrajectoryOrder] = useState<'reading' | 'chronology'>('reading');
  const lifetime = useRef({ active: false }),
    epoch = useRef(0),
    busy = useRef(false),
    pause = useRef(false);
  const checkpoint = useRef<Checkpoint>({
    data: emptyBookMap(),
    step: 0,
    afterId: null,
    fence: null,
    pages: 0,
    seen: new Set(),
  });
  const run = useCallback(
    async (reset: boolean) => {
      if (busy.current) return;
      const own = ++epoch.current;
      if (reset) {
        checkpoint.current = {
          data: emptyBookMap(),
          step: 0,
          afterId: null,
          fence: null,
          pages: 0,
          seen: new Set(),
        };
        setData(emptyBookMap());
        setCharacter('');
      }
      const c = checkpoint.current;
      const session = lifetime.current;
      const active = () => session.active && epoch.current === own;
      pause.current = false;
      busy.current = true;
      setPhase('reading');
      setError('');
      try {
        let processed = 0;
        while (c.step < resources.length && !pause.current && processed < 32) {
          const resource = resources[c.step]!;
          setProgress(`Lendo ${resourceLabels[resource]} · ${c.pages} páginas conferidas`);
          const page = await readLiteraryBookMapPage(bookId, resource, c.fence, c.afterId);
          if (!active()) return;
          if (
            page.resource !== resource ||
            (c.fence !== null && page.fence !== c.fence) ||
            (page.nextAfterId !== null && page.nextAfterId === c.afterId)
          )
            throw new Error(
              'A leitura do mapa não avançou com a mesma versão. Atualize para conferir.',
            );
          c.fence = page.fence;
          for (const item of page.items) {
            if (item.resource !== resource || c.seen.has(JSON.stringify([resource, item.id])))
              throw new Error(
                'A paginação do mapa repetiu uma identidade. Atualize para conferir.',
              );
            c.seen.add(JSON.stringify([resource, item.id]));
            // The discriminant is checked at the boundary above.
            if (item.resource === 'acts') c.data.acts.push(item);
            else if (item.resource === 'chapters') c.data.chapters.push(item);
            else if (item.resource === 'events') c.data.events.push(item);
            else c.data.plans.push(item);
          }
          c.pages++;
          processed++;
          setData({
            acts: [...c.data.acts],
            chapters: [...c.data.chapters],
            events: [...c.data.events],
            plans: [...c.data.plans],
          });
          c.afterId = page.nextAfterId;
          if (page.nextAfterId === null) c.step++;
        }
        if (pause.current || c.step < resources.length) {
          setProgress(
            pause.current
              ? 'Leitura pausada após a página atual.'
              : 'Este ciclo leu 32 páginas. Retome para continuar com as mesmas fontes.',
          );
          setPhase('paused');
          return;
        }
        // Final authorization/fence read: a completed traversal is still metadata only.
        const checked = await readLiteraryBookMapPage(bookId, 'chapters', c.fence, null);
        if (!active()) return;
        if (checked.fence !== c.fence)
          throw new Error('As fontes do mapa mudaram. Atualize a leitura.');
        setPhase('complete');
      } catch (cause) {
        if (active()) {
          // Revoked or stale sources never leave a derived private map visible.
          setData(emptyBookMap());
          checkpoint.current = {
            data: emptyBookMap(),
            step: 0,
            afterId: null,
            fence: null,
            pages: 0,
            seen: new Set(),
          };
          setError(cause instanceof Error ? cause.message : 'Não foi possível consultar o mapa.');
          setPhase('error');
        }
      } finally {
        if (active()) busy.current = false;
      }
    },
    [bookId],
  );
  useEffect(() => {
    const session = { active: true };
    lifetime.current = session;
    queueMicrotask(() => {
      if (session.active) void run(true);
    });
    return () => {
      session.active = false;
      pause.current = true;
      busy.current = false;
    };
  }, [run]);
  const index = mapSubjectIndex(data.plans);
  const plansFor = (kind: string, id: string) => index.get(JSON.stringify([kind, id])) ?? [];
  const groups = groupChapters(data.chapters, data.acts);
  const chapters = groups.flatMap((group) => group.chapters);
  const readingOrder = new Map(chapters.map((chapter, index) => [chapter.id, index]));
  const events = [...data.events].sort((a, b) =>
    a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.id.localeCompare(b.id),
  );
  const characters = mapCharacters(data.plans);
  const selected = characters.find((item) => item.key === character) ?? characters[0];
  const globalPlans = data.plans.filter((plan) =>
    ['bookOverview', 'seriesBridge'].includes(plan.plan.kind),
  );
  const unplaced = data.plans.filter(
    (plan) =>
      !['bookOverview', 'seriesBridge'].includes(plan.plan.kind) &&
      !['chapter', 'act', 'event'].some((kind) => mapSubjects(plan, kind).length),
  );
  const unsequenced = data.plans.filter(
    (plan) => plan.plan.fields.realTime && !mapSubjects(plan, 'event').length,
  );
  const eventOrder = new Map(events.map((event, index) => [event.id, index]));
  const position = (plan: BookMapPlan) =>
    Math.min(
      ...mapSubjects(plan, trajectoryOrder === 'reading' ? 'chapter' : 'event').map(
        (source) =>
          (trajectoryOrder === 'reading' ? readingOrder : eventOrder).get(source.reference.id) ??
          Infinity,
      ),
    );
  const counts = [
    `${data.acts.length} ${data.acts.length === 1 ? 'ato' : 'atos'}`,
    `${data.chapters.length} ${data.chapters.length === 1 ? 'capítulo' : 'capítulos'}`,
    `${data.events.length} ${data.events.length === 1 ? 'evento' : 'eventos'}`,
    `${data.plans.length} ${data.plans.length === 1 ? 'ficha' : 'fichas'}`,
  ].join(' · ');
  return (
    <section className={`${styles.panel} ${styles.mapContent}`} aria-label="Mapa global do livro">
      <h3>Mapa global do livro</h3>
      <p>
        Estrutura e intenções editoriais vinculadas. A ordem da cronologia é definida nos eventos;
        datas livres e pistas mostradas ao leitor permanecem distintas. Esta leitura não analisa o
        texto do manuscrito.
      </p>
      <div className={styles.actions}>
        <Button
          variant="outline"
          disabled={phase === 'reading' || phase === 'pausing'}
          onClick={() => void run(true)}
        >
          Atualizar mapa
        </Button>
        {phase === 'reading' && (
          <Button
            variant="outline"
            onClick={() => {
              pause.current = true;
              setPhase('pausing');
            }}
          >
            Pausar leitura
          </Button>
        )}
        {phase === 'paused' && <Button onClick={() => void run(false)}>Retomar leitura</Button>}
        <Badge>
          {phase === 'complete'
            ? 'Estrutura e fichas carregadas'
            : phase === 'paused'
              ? 'Leitura parcial pausada'
              : phase === 'error'
                ? 'Leitura indisponível'
                : 'Leitura parcial'}
        </Badge>
      </div>
      {(phase === 'reading' || phase === 'pausing') && (
        <LoadingState
          label={phase === 'pausing' ? 'Concluindo a página atual antes de pausar' : progress}
        />
      )}
      {phase === 'paused' && <p role="status">{progress}</p>}
      {phase === 'error' && <ErrorState message={error} onRetry={() => void run(true)} />}
      {phase !== 'error' && (
        <>
          <p>{counts} lidos.</p>
          <div className={styles.actions} aria-label="Visões do mapa">
            <Button
              variant={view === 'reading' ? 'primary' : 'outline'}
              aria-pressed={view === 'reading'}
              onClick={() => setView('reading')}
            >
              Ordem de leitura
            </Button>
            <Button
              variant={view === 'chronology' ? 'primary' : 'outline'}
              aria-pressed={view === 'chronology'}
              onClick={() => setView('chronology')}
            >
              Cronologia real
            </Button>
            <Button
              variant={view === 'character' ? 'primary' : 'outline'}
              aria-pressed={view === 'character'}
              onClick={() => setView('character')}
            >
              Trajetória de personagem
            </Button>
          </div>
          {view === 'reading' && (
            <div className={styles.panel}>
              {globalPlans.map((plan) => (
                <PlanCard key={plan.id} entry={plan} />
              ))}
              {chapters.length === 0 && (
                <EmptyState
                  title="Nenhum capítulo carregado"
                  description="Os capítulos existentes aparecerão na ordem usada pelo manuscrito."
                />
              )}
              {groups
                .filter((group) => group.act !== null || group.chapters.length > 0)
                .map((group) => (
                  <section
                    className={styles.panel}
                    key={group.act ? JSON.stringify(['act', group.act.id]) : 'without-act'}
                    aria-label={
                      group.act ? `Ato ${actName(group.act)}` : 'Capítulos sem ato disponível'
                    }
                  >
                    <h4>{group.act ? `Ato ${actName(group.act)}` : 'Sem ato disponível'}</h4>
                    {group.act &&
                      plansFor('act', group.act.id).map((plan) => (
                        <PlanCard key={plan.id} entry={plan} />
                      ))}
                    {group.chapters.length === 0 && <p>Este ato ainda não tem capítulos.</p>}
                    {group.chapters.map((chapter) => (
                      <article className={styles.comparison} key={chapter.id}>
                        <h5>
                          <Link
                            to={`/books/${encodeURIComponent(bookId)}/editor/${encodeURIComponent(chapter.id)}`}
                          >
                            {readingOrder.get(chapter.id)! + 1}. {chapter.title}
                          </Link>
                        </h5>
                        {plansFor('chapter', chapter.id).length === 0 && (
                          <p>Sem ficha vinculada a este capítulo como assunto.</p>
                        )}
                        {plansFor('chapter', chapter.id).map((plan) => (
                          <PlanCard key={plan.id} entry={plan} />
                        ))}
                      </article>
                    ))}
                  </section>
                ))}
            </div>
          )}
          {view === 'chronology' && (
            <div className={styles.panel}>
              {events.length === 0 && (
                <EmptyState
                  title="Nenhum evento carregado"
                  description="A cronologia usa a ordem manual dos eventos existentes; datas textuais não são interpretadas automaticamente."
                />
              )}
              {events.map((event) => (
                <article className={styles.comparison} key={event.id}>
                  <h4>{event.title}</h4>
                  <p>Momento real: {event.dateLabel || 'Não definido'}</p>
                  <p className={styles.contextText}>{event.description}</p>
                  {plansFor('event', event.id).length === 0 && (
                    <p>Sem ficha vinculada a este evento como assunto.</p>
                  )}
                  {plansFor('event', event.id).map((plan) => (
                    <PlanCard key={plan.id} entry={plan} />
                  ))}
                </article>
              ))}
              {unsequenced.length > 0 && (
                <details>
                  <summary>Momentos declarados sem evento vinculado ({unsequenced.length})</summary>
                  {unsequenced.map((plan) => (
                    <PlanCard key={plan.id} entry={plan} />
                  ))}
                </details>
              )}
              <p>
                O campo “Momento real” de uma ficha só entra nesta sequência quando ela está
                vinculada explicitamente a um evento. Pistas temporais apresentadas ao leitor não
                alteram essa ordem.
              </p>
            </div>
          )}
          {view === 'character' && (
            <div className={styles.panel} role="region" aria-label="Trajetória editorial">
              <p>
                A trajetória reúne fichas de conhecimento com personagem ou entidade vinculada como
                assunto. Referências usadas apenas como fonte não demonstram participação ou
                conhecimento.
              </p>
              {characters.length === 0 ? (
                <EmptyState
                  title="Nenhuma trajetória vinculada"
                  description="Vincule uma ficha de conhecimento ao personagem e ao capítulo ou evento correspondente."
                />
              ) : (
                <>
                  <Dropdown
                    mode="select"
                    label="Personagem ou entidade acompanhada"
                    value={selected?.key ?? ''}
                    options={characters.map((item) => ({ value: item.key, label: item.label }))}
                    onValueChange={setCharacter}
                  />
                  <Dropdown
                    mode="select"
                    label="Ordenar trajetória por"
                    value={trajectoryOrder}
                    options={[
                      { value: 'reading', label: 'Ordem de leitura' },
                      { value: 'chronology', label: 'Cronologia real' },
                    ]}
                    onValueChange={(value) =>
                      setTrajectoryOrder(value === 'chronology' ? 'chronology' : 'reading')
                    }
                  />
                  <p>
                    Fichas sem vínculo à ordem selecionada aparecem ao final; posições textuais são
                    conservadas sem ordenação automática.
                  </p>
                  {[...(selected?.plans ?? [])]
                    .sort((a, b) => {
                      const left = position(a),
                        right = position(b);
                      return left === right ? a.id.localeCompare(b.id) : left < right ? -1 : 1;
                    })
                    .map((plan) => (
                      <PlanCard key={plan.id} entry={plan} />
                    ))}
                </>
              )}
            </div>
          )}
          {unplaced.length > 0 && (
            <details>
              <summary>Fichas sem unidade vinculada como assunto ({unplaced.length})</summary>
              {unplaced.map((plan) => (
                <PlanCard key={plan.id} entry={plan} />
              ))}
            </details>
          )}
          {phase === 'complete' && (
            <Alert>
              O mapa cobre a estrutura, as fichas e os vínculos explícitos carregados. Intenções e
              hipóteses das fichas não comprovam acontecimentos no manuscrito. Use Atualizar mapa
              após alterar as fontes.
            </Alert>
          )}
        </>
      )}
    </section>
  );
}
function PlanCard({ entry }: { entry: BookMapPlan }) {
  const fields = entry.plan.fields;
  const labels = entry.fieldLabels;
  return (
    <article className={styles.comparison} aria-label={entry.plan.title}>
      <h5>{entry.plan.title}</h5>
      <Badge>{statusLabels[entry.plan.status]}</Badge>
      <p>Ficha · revisão {entry.revision}</p>
      {entry.sources.some((source) => !source.available || source.changed) && (
        <Alert variant="warning">
          Há referências alteradas ou indisponíveis. Compare as fontes antes de reutilizar esta
          ficha.
        </Alert>
      )}
      <dl>
        {Object.entries(labels)
          .filter(([key]) => fields[key])
          .map(([key, label]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{fields[key]}</dd>
            </div>
          ))}
      </dl>
      <details>
        <summary>Vínculos e cobertura da ficha</summary>
        <ul>
          {entry.sources.map((source, index) => (
            <li key={index}>
              {source.reference.purpose === 'subject' ? 'Assunto' : 'Fonte'} ·{' '}
              {source.available ? (source.label ?? source.reference.id) : 'Referência indisponível'}
              {source.changed ? ' · versão alterada' : ''}
            </li>
          ))}
        </ul>
        {entry.sources.length === 0 && <p>Sem vínculos explícitos.</p>}
      </details>
    </article>
  );
}
