import { screen } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';

/** Open the real shared dropdown and choose the visible option. */
export async function chooseDropdown(
  user: Pick<ReturnType<typeof userEvent.setup>, 'click'>,
  trigger: HTMLElement,
  label: string | RegExp,
) {
  await user.click(trigger);
  await user.click(await screen.findByRole('option', { name: label }));
}
