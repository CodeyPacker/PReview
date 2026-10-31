import { useSyncExternalStore } from 'react';

let version = 0;

function subscribe(onChange: () => void): () => void {
  const notify = () => {
    version++;
    onChange();
  };
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const media = matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', notify);
  return () => {
    observer.disconnect();
    media.removeEventListener('change', notify);
  };
}

// A number that changes whenever the theme does, whether the user picked one or the OS did.
export function useThemeVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}
