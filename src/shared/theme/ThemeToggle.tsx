import { Sun, Moon, BookOpen, Monitor } from 'lucide-react';
import { Dropdown } from '../ui/Dropdown';
import { useTheme } from './useTheme';
import { type Theme } from './themeConfig';

export function ThemeToggle({
  className = '',
  showLabel = false,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const { resolvedTheme, toggleTheme } = useTheme();

  const getIcon = () => {
    switch (resolvedTheme) {
      case 'dark':
        return <Moon className="icon icon-sm" aria-hidden="true" />;
      case 'sepia':
        return <BookOpen className="icon icon-sm" aria-hidden="true" />;
      case 'light':
      default:
        return <Sun className="icon icon-sm" aria-hidden="true" />;
    }
  };

  const getLabel = () => {
    switch (resolvedTheme) {
      case 'dark':
        return 'Tema Escuro';
      case 'sepia':
        return 'Tema Sépia';
      case 'light':
      default:
        return 'Tema Claro';
    }
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer border border-transparent hover:border-black/10 dark:hover:border-white/10 ${className}`}
      title={`Alternar tema (Atual: ${getLabel()})`}
      aria-label={`Alternar tema. Atual: ${getLabel()}`}
    >
      {getIcon()}
      {showLabel && <span>{getLabel()}</span>}
    </button>
  );
}

export function ThemeSelect({ className = '' }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div className="shrink-0">
      <Dropdown
        mode="select"
        value={theme}
        onValueChange={(value) => setTheme(value as Theme)}
        className={className}
        aria-label="Selecionar tema visual"
        options={[
          {
            value: 'light',
            label: 'Claro',
            icon: <Sun className="icon icon-sm" aria-hidden="true" />,
          },
          {
            value: 'dark',
            label: 'Escuro',
            icon: <Moon className="icon icon-sm" aria-hidden="true" />,
          },
          {
            value: 'sepia',
            label: 'Sépia (Pergaminho)',
            icon: <BookOpen className="icon icon-sm" aria-hidden="true" />,
          },
          {
            value: 'system',
            label: 'Sistema',
            icon: <Monitor className="icon icon-sm" aria-hidden="true" />,
          },
        ]}
      />
    </div>
  );
}
