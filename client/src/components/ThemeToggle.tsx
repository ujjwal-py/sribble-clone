import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { applyTheme, getInitialTheme, type Theme } from '../theme';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const nextTheme: Theme = theme === 'dark' ? 'light' : 'dark';

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <button
      type="button"
      className="btn btn-ghost theme-toggle"
      onClick={() => setTheme(nextTheme)}
      aria-label={`Switch to ${nextTheme} mode`}
      title={`Switch to ${nextTheme} mode`}
    >
      {theme === 'dark' ? (
        <Sun className="icon" aria-hidden="true" />
      ) : (
        <Moon className="icon" aria-hidden="true" />
      )}
      <span className="theme-label">{nextTheme === 'dark' ? 'Dark' : 'Light'}</span>
    </button>
  );
}
