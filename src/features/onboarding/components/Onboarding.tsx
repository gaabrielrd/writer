import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CircleHelp,
  Compass,
  Map,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { Alert, Button, Card, Dialog, Dropdown, buttonVariants } from '@/shared/ui';
import { useOnboarding } from '../context/onboardingContext';
import {
  defaultProfile,
  interests,
  interestLabels,
  profileLabel,
  tourSteps,
  type Guidance,
  type Interest,
  type StartingPoint,
} from '../model/profile';
import styles from './Onboarding.module.css';
import { useGuideDrag } from './useGuideDrag';
const icons = { book: BookOpen, adventure: Compass, campaign: Map };
export function OnboardingExperience() {
  const state = useOnboarding();
  if (!state) return null;
  return (
    <>
      {state.status === 'error' && (
        <div className={styles.notice}>
          <Alert variant="destructive">
            {state.error}
            <Button variant="outline" onClick={() => void state.reload()}>
              Tentar carregar perfil
            </Button>
          </Alert>
        </div>
      )}
      {state.questionnaireOpen && state.status === 'ready' && (
        <Questionnaire key={state.profile?.revision ?? 0} />
      )}
      {!state.questionnaireOpen && state.profile?.tour === 'active' && <GuidedTour />}
    </>
  );
}
function Questionnaire() {
  const state = useOnboarding()!;
  const [selected, setSelected] = useState<Interest[]>(state.profile?.interests ?? []);
  const [start, setStart] = useState<StartingPoint>(state.profile?.startingPoint ?? 'empty');
  const [guidance, setGuidance] = useState<Guidance>(state.profile?.guidance ?? 'guided');
  const submit = async (skip = false) => {
    const saved = await state.save(
      skip
        ? { ...defaultProfile, interests: [...interests] }
        : {
            interests: selected,
            startingPoint: start,
            guidance,
            questionnaire: 'completed',
            tour: guidance === 'independent' ? 'paused' : 'active',
            step: 0,
          },
    );
    if (saved) state.closeQuestionnaire();
  };
  return (
    <Dialog
      open
      onClose={() => {
        if (!state.saving) state.closeQuestionnaire();
      }}
      title={state.profile ? 'Personalizar meu espaço' : 'Vamos organizar seu espaço de criação'}
      description="Três escolhas rápidas. Você pode mudar tudo depois, sem perder seus projetos."
      footer={
        <>
          <Button variant="ghost" disabled={state.saving} onClick={() => void submit(true)}>
            Pular por enquanto
          </Button>
          <Button disabled={!selected.length || state.saving} onClick={() => void submit()}>
            {state.saving ? 'Salvando…' : 'Salvar e continuar'}
          </Button>
        </>
      }
    >
      <div className={styles.form} data-writer-onboarding>
        <fieldset disabled={state.saving} className={styles.fieldset}>
          <legend>1. O que você quer criar?</legend>
          <p>Selecione uma ou mais opções.</p>
          <div className={styles.choices}>
            {interests.map((interest) => {
              const Icon = icons[interest];
              return (
                <Button
                  key={interest}
                  variant={selected.includes(interest) ? 'secondary' : 'outline'}
                  aria-pressed={selected.includes(interest)}
                  onClick={() =>
                    setSelected((old) =>
                      old.includes(interest)
                        ? old.filter((i) => i !== interest)
                        : [...old, interest],
                    )
                  }
                >
                  <Icon className="icon" aria-hidden="true" />
                  {interestLabels[interest]}
                </Button>
              );
            })}
          </div>
          <Button variant="ghost" onClick={() => setSelected([...interests])}>
            Quero fazer de tudo
          </Button>
        </fieldset>
        <Dropdown
          mode="select"
          label="2. Como pretende começar?"
          value={start}
          disabled={state.saving}
          options={[
            { value: 'empty', label: 'Começar do zero' },
            { value: 'import', label: 'Trazer material existente' },
            { value: 'explore', label: 'Ainda estou explorando' },
          ]}
          onValueChange={(value) => setStart(value as StartingPoint)}
        />
        <Dropdown
          mode="select"
          label="3. Quanto acompanhamento deseja?"
          value={guidance}
          disabled={state.saving}
          options={[
            { value: 'guided', label: 'Passo a passo' },
            { value: 'essential', label: 'Apenas o essencial' },
            { value: 'independent', label: 'Explorar por conta própria' },
          ]}
          onValueChange={(value) => setGuidance(value as Guidance)}
        />
        {state.error && (
          <Alert variant="destructive">
            {state.error}
            <Button variant="outline" disabled={state.saving} onClick={() => void state.reload()}>
              Recarregar perfil salvo
            </Button>
          </Alert>
        )}
        <p className={styles.hint}>
          Suas escolhas organizam os atalhos. Todas as ferramentas continuam disponíveis. O guia não
          cria projetos nem envia pedidos de IA.
        </p>
      </div>
    </Dialog>
  );
}
function GuidedTour() {
  const { pathname } = useLocation();
  const panel = useRef<HTMLElement>(null);
  const state = useOnboarding()!;
  const profile = state.profile!;
  const steps = tourSteps(profile);
  const index = Math.min(profile.step, steps.length - 1);
  const step = steps[index]!;
  const heading = useRef<HTMLHeadingElement>(null);
  const [obscured, setObscured] = useState(false);
  const movementHelp = useId();
  const dragProps = useGuideDrag(panel, obscured);
  useEffect(() => {
    const update = () =>
      setObscured(
        Array.from(document.querySelectorAll('[role="dialog"]')).some(
          (dialog) =>
            !dialog.closest('[data-writer-guide], [data-page-assistant]') &&
            dialog.getAttribute('data-state') !== 'closed',
        ),
      );
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state'],
    });
    update();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (obscured) return;
    const selector = `[data-writer-tour="${step.target}"]`;
    const element = Array.from(document.querySelectorAll<HTMLElement>(selector)).find(
      (e) => e.getClientRects().length > 0,
    );
    element?.setAttribute('data-writer-tour-active', 'true');
    return () => element?.removeAttribute('data-writer-tour-active');
  }, [step.target, obscured, pathname]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        panel.current?.contains(event.target as Node)
      ) {
        event.preventDefault();
        event.stopPropagation();
        void state.save({ ...profile, tour: 'paused' }).then((saved) => {
          if (saved) document.getElementById('main-content')?.focus();
        });
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [profile, state]);
  const move = async (next: number) => {
    if (
      await state.save({
        ...profile,
        step: Math.max(0, Math.min(next, steps.length - 1)),
        tour: next >= steps.length ? 'completed' : 'active',
      })
    )
      if (next >= steps.length) document.getElementById('main-content')?.focus();
      else heading.current?.focus();
  };
  if (obscured) return null;
  return (
    <aside
      ref={panel}
      data-writer-guide
      role="dialog"
      aria-modal="false"
      tabIndex={-1}
      className={styles.tour}
      aria-label="Guia do Writer"
      aria-describedby={movementHelp}
      {...dragProps}
    >
      <span id={movementHelp} className="sr-only">
        Arraste pelo texto ou pelos espaços livres para mover o guia. Com o progresso do guia em
        foco, use as setas; Shift amplia o movimento. Escape cancela um arrasto.
      </span>
      <div className={styles.tourTop}>
        <Button
          variant="ghost"
          className={styles.tourGrip}
          data-guide-drag-handle
          aria-label={`Seu primeiro percurso · ${index + 1} de ${steps.length}. Mover guia`}
          aria-describedby={movementHelp}
          title="Arraste ou use as setas para mover o guia"
        >
          <span>
            Seu primeiro percurso · {index + 1} de {steps.length}
          </span>
        </Button>
        <Button
          variant="ghost"
          disabled={state.saving}
          onClick={() => void state.save({ ...profile, tour: 'paused' })}
        >
          Pausar guia
        </Button>
      </div>
      <h2 ref={heading} tabIndex={-1}>
        {step.title}
      </h2>
      <p>{step.text}</p>
      {step.path && <Link to={step.path}>{step.action}</Link>}
      {state.error && (
        <Alert variant="destructive">
          {state.error}
          <Button onClick={() => void state.reload()}>Recarregar perfil</Button>
        </Alert>
      )}
      <div className={styles.actions}>
        <Button
          variant="ghost"
          disabled={index === 0 || state.saving}
          onClick={() => void move(index - 1)}
        >
          <ArrowLeft className="icon icon-sm" aria-hidden="true" />
          Voltar
        </Button>
        <Button disabled={state.saving} onClick={() => void move(index + 1)}>
          {index === steps.length - 1 ? 'Concluir guia' : 'Próxima dica'}
          <ArrowRight className="icon icon-sm" aria-hidden="true" />
        </Button>
      </div>
    </aside>
  );
}
export function OnboardingPreferences() {
  const state = useOnboarding();
  if (!state) return null;
  return (
    <Card className={styles.preferences} data-writer-tour="profile">
      <h2>Seu perfil de criação</h2>
      <p>{state.status === 'loading' ? 'Carregando seu espaço…' : profileLabel(state.profile)}</p>
      <p className={styles.hint}>Escolha o que fica em destaque e reveja o guia quando quiser.</p>
      {state.error && <Alert variant="destructive">{state.error}</Alert>}
      <div className={styles.actions}>
        <Button
          variant="outline"
          disabled={state.status !== 'ready' || state.saving}
          onClick={state.openQuestionnaire}
        >
          Personalizar meu espaço
        </Button>
        <Button
          disabled={state.status !== 'ready' || state.saving}
          onClick={() =>
            void state.save({
              ...(state.profile ?? defaultProfile),
              tour: 'active',
              step: state.profile?.tour === 'paused' ? state.profile.step : 0,
            })
          }
        >
          <CircleHelp className="icon icon-sm" aria-hidden="true" />
          {state.profile?.tour === 'paused' ? 'Retomar guia' : 'Rever guia'}
        </Button>
        <Button variant="ghost" disabled={state.saving} onClick={() => void state.reload()}>
          Atualizar perfil
        </Button>
      </div>
    </Card>
  );
}
export function PersonalizedWelcome() {
  const state = useOnboarding();
  const profile = state?.profile;
  const selected = profile?.interests ?? [...interests];
  const first =
    profile?.startingPoint === 'import'
      ? '/studio/import'
      : selected.length === 1
        ? `/studio/new?kind=${selected[0]}`
        : '/studio/new';
  return (
    <Card className={styles.welcome} data-writer-tour="project-start">
      <span className={styles.hint}>Seu espaço, no seu ritmo</span>
      <h2>
        {selected.length === 1
          ? {
              book: 'Sua próxima página começa aqui.',
              adventure: 'Dê forma à sua próxima aventura.',
              campaign: 'Prepare a próxima sessão da sua mesa.',
            }[selected[0]!]
          : 'Um espaço para todas as suas histórias.'}
      </h2>
      <p className={styles.hint}>{profileLabel(profile ?? null)}</p>
      <div className={styles.actions}>
        <Link to={first} className={buttonVariants({ variant: 'primary', size: 'sm' })}>
          <Sparkles className="icon icon-sm" aria-hidden="true" />
          {profile?.startingPoint === 'import' ? 'Trazer meu material' : 'Começar um projeto'}
        </Link>
        <Link to="/studio/projects" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Todos os projetos
        </Link>
        <Button variant="ghost" size="sm" onClick={() => state?.openQuestionnaire()}>
          <SlidersHorizontal className="icon icon-sm" aria-hidden="true" />
          Personalizar meu espaço
        </Button>
      </div>
      {selected.length > 1 && (
        <nav className={styles.choices} aria-label="Ir direto para">
          {selected.map((i) => (
            <Link key={i} to={`/studio/projects?kind=${i}`}>
              {interestLabels[i]}
              <ArrowRight className="icon icon-sm" aria-hidden="true" />
            </Link>
          ))}
        </nav>
      )}
      {profile?.tour !== 'completed' && (
        <Link className={styles.guideLink} to="/settings/preferences">
          Retomar ou conhecer o guia do Writer
        </Link>
      )}
    </Card>
  );
}
