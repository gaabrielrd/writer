import type { ReactNode } from 'react';
import { cn } from '../lib/utils';
import styles from './FilterChips.module.css';

export interface FilterChipOption<T extends string = string> {
  value: T;
  label: string;
  /** Quantidade de itens que o filtro exibe. */
  count?: number;
  /** Ícone Lucide decorativo; recebe `aria-hidden` de quem chama. */
  icon?: ReactNode;
}

export interface FilterChipsProps<T extends string = string> {
  /** Nome acessível do grupo de filtros. */
  label: string;
  options: readonly FilterChipOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Filtro de escolha única para listas curtas de opções. Para muitas opções,
 * use `Dropdown mode="select"`.
 */
export function FilterChips<T extends string = string>({
  label,
  options,
  value,
  onValueChange,
  disabled,
  className,
}: FilterChipsProps<T>) {
  return (
    <div className={cn(styles.group, className)} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={styles.chip}
          aria-pressed={option.value === value}
          disabled={disabled}
          onClick={() => {
            if (option.value !== value) onValueChange(option.value);
          }}
        >
          {option.icon}
          <span>{option.label}</span>
          {option.count !== undefined && (
            <>
              {' '}
              <span className={styles.count}>{option.count}</span>
            </>
          )}
        </button>
      ))}
    </div>
  );
}
