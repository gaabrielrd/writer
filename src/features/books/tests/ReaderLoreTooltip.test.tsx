import { afterEach, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReaderLoreTooltip } from '../components/ReaderLoreTooltip';
import type { PublicLoreEntity } from '../model/publicBook';
const entity = (id: string, name: string): PublicLoreEntity => ({
  id,
  name,
  aliases: [],
  category: 'character',
  summary: 'Resumo de ' + name,
  isPublic: true,
});
const originalMatchMedia = window.matchMedia.bind(window);
afterEach(() => {
  window.matchMedia = originalMatchMedia;
});
const hoverSupport = (none: boolean) => {
  window.matchMedia = (query) => ({
    ...originalMatchMedia.call(window, query),
    matches: query === '(any-hover: none)' ? none : false,
  });
};
const mount = () =>
  render(
    <>
      <ReaderLoreTooltip entity={entity('one', 'Ana')}>Ana</ReaderLoreTooltip>
      <ReaderLoreTooltip entity={entity('two', 'Beatriz')}>Beatriz</ReaderLoreTooltip>
    </>,
  );
it('touch focus and tap open a summary but synthetic mouse entry cannot open another tooltip after Escape', async () => {
  hoverSupport(true);
  mount();
  const first = screen.getByRole('button', { name: 'Ver resumo de Ana' }),
    second = screen.getByRole('button', { name: 'Ver resumo de Beatriz' });
  await userEvent.click(first);
  expect(screen.getByRole('tooltip')).toHaveTextContent('Resumo de Ana');
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  if (!second.parentElement) throw new Error('Termo não montado.');
  fireEvent.mouseEnter(second.parentElement);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  await userEvent.click(second);
  expect(screen.getByRole('tooltip')).toHaveTextContent('Resumo de Beatriz');
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});
it('desktop hover remains available and Escape dismisses a hover-only summary without keyboard focus', async () => {
  hoverSupport(false);
  mount();
  const first = screen.getByRole('button', { name: 'Ver resumo de Ana' });
  await userEvent.hover(first);
  expect(first).not.toHaveFocus();
  expect(screen.getByRole('tooltip')).toHaveTextContent('Resumo de Ana');
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  await userEvent.unhover(first);
  await userEvent.hover(first);
  expect(screen.getByRole('tooltip')).toHaveTextContent('Resumo de Ana');
});
