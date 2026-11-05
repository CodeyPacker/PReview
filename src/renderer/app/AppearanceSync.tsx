import { useEffect } from 'react';
import { useSettings } from '../hooks/useSettings.ts';

function setAttribute(name: 'accent' | 'density' | 'fontSize', value: string | undefined) {
  const root = document.documentElement;
  if (value === undefined) delete root.dataset[name];
  else root.dataset[name] = value;
}

// Applies the Appearance settings to <html>. "system" removes the theme attribute so tokens.css
// follows the OS appearance, and the default choices remove theirs so tokens.css applies.
export function AppearanceSync() {
  const settings = useSettings().data;
  const theme = settings?.theme;
  const accent = settings?.accent;
  const density = settings?.density;
  const fontSize = settings?.fontSize;

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
    else delete root.dataset.theme;
  }, [theme]);
  useEffect(() => setAttribute('accent', accent === 'purple' ? undefined : accent), [accent]);
  useEffect(() => setAttribute('density', density === 'default' ? undefined : density), [density]);
  useEffect(
    () => setAttribute('fontSize', fontSize === 'default' ? undefined : fontSize),
    [fontSize],
  );

  return null;
}
