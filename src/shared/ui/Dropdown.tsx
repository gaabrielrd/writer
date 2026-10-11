import {
  forwardRef,
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button, type ButtonProps } from './Button';
import { Input } from './Input';
import styles from './Dropdown.module.css';

export interface DropdownOption {
  value: string | number;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  searchText?: string;
  variant?: 'default' | 'destructive';
  onSelect?: () => void;
}
interface DropdownBaseProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'value' | 'defaultValue' | 'onChange' | 'children'
> {
  label?: string;
  icon?: ReactNode;
  iconOnly?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  align?: 'start' | 'center' | 'end';
  contentClassName?: string;
  itemClassName?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
}
export interface DropdownSelectProps extends DropdownBaseProps {
  mode: 'select';
  options: DropdownOption[];
  value?: string | number;
  defaultValue?: string | number;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  name?: string;
  hint?: string;
  error?: string;
}
export interface DropdownActionProps extends DropdownBaseProps {
  mode?: 'action';
  trigger?: ReactNode;
  children?: ReactNode;
  options?: DropdownOption[];
  onAction?: (value: string) => void;
  value?: never;
}
export type DropdownProps = DropdownSelectProps | DropdownActionProps;

const DropdownActionContext = createContext<((action: () => void) => void) | null>(null);

function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim();
}

function DropdownSurface({
  trigger,
  children,
  label,
  options = [],
  searchable = false,
  searchPlaceholder = 'Buscar opções...',
  emptyMessage = 'Nenhuma opção encontrada.',
  align = 'start',
  contentClassName,
  itemClassName,
  selecting = false,
  value,
  onSelect,
  disabled,
}: Pick<
  DropdownBaseProps,
  | 'label'
  | 'searchable'
  | 'searchPlaceholder'
  | 'emptyMessage'
  | 'align'
  | 'contentClassName'
  | 'itemClassName'
> & {
  trigger: ReactNode;
  children?: ReactNode;
  options?: DropdownOption[];
  selecting?: boolean;
  value?: string;
  disabled?: boolean;
  onSelect?: (option: DropdownOption) => void;
}) {
  const id = useId();
  const listId = `${id}-options`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pendingAction = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!open || !searchable) return;
    const timer = setTimeout(() => searchRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open, searchable]);
  const filtered = options.filter((option) =>
    normalize(`${option.label} ${option.searchText ?? ''}`).includes(normalize(query)),
  );
  return (
    <DropdownActionContext.Provider
      value={(action) => {
        pendingAction.current = action;
      }}
    >
      <Menu.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          setQuery('');
        }}
      >
        <Menu.Trigger asChild disabled={disabled} ref={triggerRef}>
          {trigger}
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content
            ref={contentRef}
            aria-label={label}
            aria-labelledby={undefined}
            role={searchable ? 'dialog' : selecting ? 'listbox' : 'menu'}
            align={align}
            sideOffset={8}
            collisionPadding={12}
            className={cn(styles.content, selecting && styles.selectContent, contentClassName)}
            onCloseAutoFocus={(event) => {
              const action = pendingAction.current;
              if (!action) return;
              pendingAction.current = null;
              event.preventDefault();
              // A dialog opened by an action must capture the persistent trigger,
              // after Menu's focus trap and its transient items have unmounted.
              triggerRef.current?.focus();
              action();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Tab') {
                event.preventDefault();
                setOpen(false);
              }
            }}
          >
            {searchable && (
              <div className={styles.search}>
                <Input
                  ref={searchRef}
                  aria-label={`Buscar em ${label ?? 'opções'}`}
                  aria-controls={listId}
                  placeholder={searchPlaceholder}
                  leftIcon={<Search className="icon icon-sm" aria-hidden="true" />}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                      event.preventDefault();
                      event.stopPropagation();
                      const items = contentRef.current?.querySelectorAll<HTMLElement>(
                        '[data-dropdown-item]:not([data-disabled])',
                      );
                      (event.key === 'ArrowDown' ? items?.[0] : items?.[items.length - 1])?.focus();
                    } else if (event.key !== 'Escape' && event.key !== 'Tab') {
                      // Menu typeahead must not consume spaces or letters in the filter.
                      event.stopPropagation();
                    }
                  }}
                />
              </div>
            )}
            <div
              id={searchable ? listId : undefined}
              role={searchable ? (selecting ? 'listbox' : 'menu') : undefined}
              aria-label={searchable ? label : undefined}
              className={styles.list}
            >
              {filtered.map((option) => (
                <Menu.Item
                  key={option.value}
                  data-dropdown-item
                  role={selecting ? 'option' : 'menuitem'}
                  aria-selected={selecting ? String(option.value) === value : undefined}
                  textValue={option.label}
                  disabled={option.disabled}
                  className={cn(
                    styles.item,
                    option.variant === 'destructive' && styles.destructive,
                    itemClassName,
                  )}
                  onPointerMove={(event) => {
                    if (document.activeElement === searchRef.current) event.preventDefault();
                  }}
                  onSelect={() => {
                    if (selecting) onSelect?.(option);
                    else pendingAction.current = () => onSelect?.(option);
                  }}
                >
                  {option.icon && <span className={styles.icon}>{option.icon}</span>}
                  <span className={styles.itemText}>{option.label}</span>
                  {selecting && String(option.value) === value && (
                    <Check className="icon icon-sm" aria-hidden="true" />
                  )}
                </Menu.Item>
              ))}
              {children}
              {(selecting || options.length > 0) && filtered.length === 0 && (
                <p className={styles.empty} role="status">
                  {emptyMessage}
                </p>
              )}
            </div>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
    </DropdownActionContext.Provider>
  );
}

const SelectionDropdown = forwardRef<HTMLButtonElement, DropdownSelectProps>(
  (
    {
      mode: _mode,
      options,
      value,
      defaultValue,
      onValueChange,
      placeholder = 'Selecione...',
      name,
      hint,
      error,
      label,
      icon,
      iconOnly,
      searchable,
      searchPlaceholder,
      emptyMessage,
      align,
      contentClassName,
      itemClassName,
      className,
      variant,
      size,
      id: providedId,
      ...buttonProps
    },
    ref,
  ) => {
    const generatedId = useId();
    const id = providedId ?? generatedId;
    const [localValue, setLocalValue] = useState(() =>
      String(defaultValue ?? options.find((option) => !option.disabled)?.value ?? ''),
    );
    const current = String(value ?? localValue);
    const selected = options.find((option) => String(option.value) === current);
    const feedback = error || hint;
    return (
      <div className={styles.field}>
        {label && (
          <label htmlFor={id} className={styles.fieldLabel}>
            {label}
          </label>
        )}
        <DropdownSurface
          selecting={_mode === 'select'}
          value={current}
          label={label ?? buttonProps['aria-label']}
          options={options}
          searchable={searchable}
          searchPlaceholder={searchPlaceholder}
          emptyMessage={emptyMessage}
          align={align}
          contentClassName={contentClassName}
          itemClassName={itemClassName}
          disabled={buttonProps.disabled}
          onSelect={(option) => {
            setLocalValue(String(option.value));
            onValueChange?.(String(option.value));
          }}
          trigger={
            <Button
              {...buttonProps}
              ref={ref}
              id={id}
              type="button"
              role="combobox"
              aria-haspopup={searchable ? 'dialog' : 'listbox'}
              aria-label={buttonProps['aria-label'] ?? (iconOnly ? label : undefined)}
              aria-invalid={error ? true : undefined}
              aria-describedby={
                cn(buttonProps['aria-describedby'], feedback && `${id}-feedback`) || undefined
              }
              variant={variant ?? 'outline'}
              size={iconOnly ? 'icon' : (size ?? 'md')}
              className={cn(
                styles.selectTrigger,
                !variant && styles.selectDefault,
                !size && !iconOnly && styles.selectHeight,
                className,
              )}
            >
              {(selected?.icon ?? icon) && (
                <span className={styles.icon}>{selected?.icon ?? icon}</span>
              )}
              {!iconOnly && (
                <span className={styles.triggerText}>{selected?.label ?? placeholder}</span>
              )}
              {!iconOnly && <ChevronDown className="icon icon-sm" aria-hidden="true" />}
            </Button>
          }
        />
        {name && (
          <input type="hidden" name={name} value={current} disabled={buttonProps.disabled} />
        )}
        {feedback && (
          <p id={`${id}-feedback`} className={cn(styles.feedback, error && styles.error)}>
            {feedback}
          </p>
        )}
      </div>
    );
  },
);
SelectionDropdown.displayName = 'SelectionDropdown';

const ActionDropdown = forwardRef<HTMLButtonElement, DropdownActionProps>(
  (
    {
      mode: _mode,
      value: _value,
      label,
      icon,
      iconOnly,
      trigger,
      children,
      options,
      onAction,
      searchable,
      searchPlaceholder,
      emptyMessage,
      align,
      contentClassName,
      itemClassName,
      variant = 'secondary',
      size,
      ...buttonProps
    },
    ref,
  ) => {
    void _mode;
    void _value;
    return (
      <DropdownSurface
        label={label ?? buttonProps['aria-label']}
        options={options}
        searchable={searchable}
        searchPlaceholder={searchPlaceholder}
        emptyMessage={emptyMessage}
        align={align}
        contentClassName={contentClassName}
        itemClassName={itemClassName}
        disabled={buttonProps.disabled}
        onSelect={(option) => {
          option.onSelect?.();
          onAction?.(String(option.value));
        }}
        trigger={
          trigger ?? (
            <Button
              {...buttonProps}
              ref={ref}
              type="button"
              variant={variant}
              size={size ?? (iconOnly ? 'icon' : 'md')}
              aria-haspopup={searchable ? 'dialog' : 'menu'}
              aria-label={buttonProps['aria-label'] ?? (iconOnly ? label : undefined)}
            >
              {icon && <span className={styles.icon}>{icon}</span>}
              {!iconOnly && <span>{label}</span>}
              {!iconOnly && <ChevronDown className="icon icon-sm" aria-hidden="true" />}
            </Button>
          )
        }
      >
        {children}
      </DropdownSurface>
    );
  },
);
ActionDropdown.displayName = 'ActionDropdown';

/** Action mode never stores or displays a selected value. */
export const Dropdown = forwardRef<HTMLButtonElement, DropdownProps>((props, ref) =>
  props.mode === 'select' ? (
    <SelectionDropdown {...props} ref={ref} />
  ) : (
    <ActionDropdown {...props} ref={ref} />
  ),
);
Dropdown.displayName = 'Dropdown';

export function DropdownItem({
  children,
  icon,
  className,
  variant,
  onSelect,
  ...props
}: Omit<Menu.DropdownMenuItemProps, 'onSelect'> & {
  icon?: ReactNode;
  variant?: 'default' | 'destructive';
  onSelect?: () => void;
}) {
  const schedule = useContext(DropdownActionContext);
  return (
    <Menu.Item
      {...props}
      data-dropdown-item
      onSelect={() => {
        if (!onSelect) return;
        if (schedule) schedule(onSelect);
        else onSelect();
      }}
      className={cn(styles.item, variant === 'destructive' && styles.destructive, className)}
    >
      {props.asChild ? (
        children
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </Menu.Item>
  );
}
export function DropdownLabel({ children }: { children: ReactNode }) {
  return <Menu.Label className={styles.label}>{children}</Menu.Label>;
}
