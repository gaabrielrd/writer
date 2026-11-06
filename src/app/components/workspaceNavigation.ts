import { studioDestinations } from '@/features/studio';
import {
  BookOpen,
  Compass,
  Globe,
  Images,
  Library,
  Send,
  Settings2,
  SlidersHorizontal,
  CircleHelp,
} from 'lucide-react';

export const spaces = [
  { path: '/studio', label: 'Estúdio', Icon: BookOpen, section: 'Criar' },
  { path: '/universes', label: 'Universos', Icon: Globe, section: 'Criar' },
  { path: '/library', label: 'Biblioteca de Imagens', Icon: Images, section: 'Criar' },
  { path: '/publications', label: 'Publicações', Icon: Send, section: 'Explorar' },
  { path: '/catalog', label: 'Catálogo', Icon: Compass, section: 'Explorar' },
  { path: '/biblioteca', label: 'Biblioteca', Icon: Library, section: 'Explorar' },
  {
    path: '/settings/preferences',
    label: 'Preferências',
    Icon: SlidersHorizontal,
    section: 'Configurar',
  },
  {
    path: '/settings/ai',
    label: 'Inteligência artificial',
    Icon: Settings2,
    section: 'Configurar',
  },
  { path: '/help', label: 'Ajuda', Icon: CircleHelp, section: 'Configurar' },
] as const;

export const navigationSections = ['Criar', 'Explorar', 'Configurar'] as const;

export function workspaceLabel(pathname: string) {
  return (
    spaces.find(({ path }) => pathname === path || pathname.startsWith(path + '/'))?.label ??
    'Estúdio'
  );
}

export function workspaceSectionLabel(pathname: string) {
  return studioDestinations.find(({ path }) => path === pathname.replace(/\/$/, ''))?.label;
}
