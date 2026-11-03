export const interests = ['book', 'adventure', 'campaign'] as const;
export type Interest = (typeof interests)[number];
export type StartingPoint = 'empty' | 'import' | 'explore';
export type Guidance = 'guided' | 'essential' | 'independent';
export interface WriterProfile {
  schemaVersion: 1;
  revision: number;
  interests: Interest[];
  startingPoint: StartingPoint;
  guidance: Guidance;
  questionnaire: 'completed' | 'skipped';
  tour: 'active' | 'paused' | 'completed';
  step: number;
}
export type ProfileInput = Omit<WriterProfile, 'schemaVersion' | 'revision'>;
export const interestLabels: Record<Interest, string> = {
  book: 'Livros',
  adventure: 'Aventuras',
  campaign: 'Campanhas',
};
export const defaultProfile: ProfileInput = {
  interests: [...interests],
  startingPoint: 'explore',
  guidance: 'essential',
  questionnaire: 'skipped',
  tour: 'paused',
  step: 0,
};
export function parseProfile(value: unknown): WriterProfile {
  if (!value || typeof value !== 'object') throw new Error('Perfil de criação inválido.');
  const p = value as Record<string, unknown>;
  const keys = [
    'schemaVersion',
    'revision',
    'interests',
    'startingPoint',
    'guidance',
    'questionnaire',
    'tour',
    'step',
  ];
  if (
    Object.keys(p).length !== keys.length ||
    Object.keys(p).some((k) => !keys.includes(k)) ||
    p.schemaVersion !== 1 ||
    !Number.isSafeInteger(p.revision) ||
    Number(p.revision) < 1 ||
    !Array.isArray(p.interests) ||
    p.interests.length < 1 ||
    p.interests.length > 3 ||
    new Set(p.interests).size !== p.interests.length ||
    p.interests.some((v) => !interests.includes(v as Interest)) ||
    !['empty', 'import', 'explore'].includes(String(p.startingPoint)) ||
    !['guided', 'essential', 'independent'].includes(String(p.guidance)) ||
    !['completed', 'skipped'].includes(String(p.questionnaire)) ||
    !['active', 'paused', 'completed'].includes(String(p.tour)) ||
    !Number.isSafeInteger(p.step) ||
    Number(p.step) < 0 ||
    Number(p.step) > 5
  )
    throw new Error('Perfil de criação inválido.');
  return { ...p, interests: (p.interests as Interest[]).slice() } as WriterProfile;
}
export function profileLabel(profile: WriterProfile | null) {
  return profile
    ? profile.interests.map((i) => interestLabels[i]).join(' e ')
    : 'Todas as formas de criar';
}
export interface TourStep {
  title: string;
  text: string;
  target: string;
  path?: string;
  action?: string;
}
export function tourSteps(profile: WriterProfile | null): TourStep[] {
  const only = profile?.interests.length === 1 ? profile.interests[0] : null;
  const text =
    only === 'book'
      ? 'No livro, organize capítulos e cenas. Escreva no editor e confira o status de salvamento antes de sair.'
      : only === 'campaign'
        ? 'Na campanha, comece pelas notas e prepare uma sessão. Referências ajudam a consultar material sem copiá-lo para suas notas.'
        : only === 'adventure'
          ? 'Na aventura, organize cenas e blocos. Confira a audiência de cada bloco antes de usar uma prévia.'
          : 'Livros organizam manuscritos; aventuras reúnem cenas; campanhas organizam preparação e sessões. Cada projeto mantém seu conteúdo próprio.';
  const steps: TourStep[] = [
    {
      title: 'Seu espaço de criação',
      text: 'O Estúdio reúne seus projetos e o trabalho recente. Você pode mudar seu perfil em Preferências a qualquer momento.',
      target: 'workspace',
      path: '/studio',
      action: 'Abrir meu Estúdio',
    },
    {
      title: profile?.startingPoint === 'import' ? 'Traga seu material' : 'Comece pelo seu projeto',
      text:
        profile?.startingPoint === 'import'
          ? 'Importe um documento ou revise um backup. Nada será importado apenas por visitar esta tela.'
          : 'Escolha um tipo de projeto e a criação manual ou assistida. Só sua confirmação cria o projeto.',
      target: 'project-start',
      path: profile?.startingPoint === 'import' ? '/studio/import' : '/studio/new',
      action: profile?.startingPoint === 'import' ? 'Conhecer importação' : 'Conhecer a criação',
    },
    { title: 'Escreva e organize', text, target: 'workspace' },
    {
      title: 'Seu assistente, sempre à mão',
      text: 'A barra inferior acompanha suas telas. Expanda para conversar, minimize para escrever e use a alça ou as setas para mover. Confira o contexto e revise qualquer ação antes de executar.',
      target: 'assistant',
    },
    {
      title: 'Continue de onde parou',
      text: 'Encontre todos os seus projetos, independentemente do perfil escolhido. Operações de importação e restauração podem ser acompanhadas em Em andamento.',
      target: 'navigation',
      path: '/studio/projects',
      action: 'Ver meus projetos',
    },
    {
      title: 'O espaço é seu',
      text: 'Você pode rever este guia, mudar seus interesses e ajustar a largura e o tema. Agora escolha um projeto e escreva no seu ritmo.',
      target: 'profile',
      path: '/settings/preferences',
      action: 'Abrir preferências',
    },
  ];
  return profile?.guidance === 'essential'
    ? steps.filter((_, i) => [0, 1, 3, 5].includes(i))
    : steps;
}
