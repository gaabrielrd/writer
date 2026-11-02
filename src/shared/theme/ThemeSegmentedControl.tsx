import { BookOpen, Moon, Sun } from 'lucide-react';
import { Button } from '../ui/Button';
import { useTheme } from './useTheme';
import styles from './ThemeSegmentedControl.module.css';

const themes = [
  { value: 'light', label: 'Claro', Icon: Sun },
  { value: 'dark', label: 'Escuro', Icon: Moon },
  { value: 'sepia', label: 'Sépia', Icon: BookOpen },
] as const;

export function ThemeSegmentedControl({ className = '' }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <div className={styles.group + ' ' + className} role="group" aria-label="Tema visual">
      {themes.map(({ value, label, Icon }) => (
        <Button
          key={value}
          variant="ghost"
          size="icon"
          className={styles.option}
          aria-label={'Tema ' + label}
          aria-pressed={resolvedTheme === value}
          title={label}
          onClick={() => setTheme(value)}
        >
          <Icon className="icon icon-sm" aria-hidden="true" />
        </Button>
      ))}
    </div>
  );
}
