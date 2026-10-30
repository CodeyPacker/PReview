import { useEffect } from 'react';
import { useSettings } from '../hooks/useSettings.ts';

// Applies the theme setting to <html>. "system" removes the attribute so tokens.css
// follows the OS appearance.
export function ThemeSync() {
  const theme = useSettings().data?.theme;

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
    else delete root.dataset.theme;
  }, [theme]);

  return null;
}
