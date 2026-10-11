import { forwardRef } from 'react';
import { Dropdown, type DropdownSelectProps, type DropdownOption } from './Dropdown';

/** Compatibility name for the shared Dropdown selection mode. */
export type SelectOption = DropdownOption;
export type SelectProps = Omit<DropdownSelectProps, 'mode'>;
export const Select = forwardRef<HTMLButtonElement, SelectProps>((props, ref) => (
  <Dropdown {...props} mode="select" ref={ref} />
));
Select.displayName = 'Select';
