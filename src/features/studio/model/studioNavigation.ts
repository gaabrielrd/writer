export const studioDestinations = [
  {
    id: 'home',
    path: '/studio',
    label: 'Home',
    title: 'Home',
    description: 'Continue seu trabalho ou comece uma nova história.',
  },
  {
    id: 'projects',
    path: '/studio/projects',
    label: 'Projetos',
    title: 'Meus projetos',
    description: 'Encontre seus livros, aventuras e campanhas.',
  },
  {
    id: 'import',
    path: '/studio/import',
    label: 'Importar e restaurar',
    title: 'Importar e restaurar',
    description: 'Traga documentos e backups para o seu Estúdio.',
  },
  {
    id: 'operations',
    path: '/studio/operations',
    label: 'Em andamento',
    title: 'Em andamento',
    description: 'Revise, retome ou confirme operações dos seus projetos.',
  },
] as const;
export type StudioSection = (typeof studioDestinations)[number]['id'];
export function studioDestination(pathname: string) {
  return studioDestinations.find(({ path }) => path === pathname.replace(/\/$/, ''));
}
