import type { ReviewLeader } from '../../shared/contracts/settings.ts';

export const reviewShortcuts = {
  approve: { key: 'a', label: 'Toggle approval' },
  flag: { key: 'f', label: 'Toggle flag' },
  comment: { key: 'i', label: 'Comment on line' },
  tree: { key: 't', label: 'Toggle file tree' },
  next: { key: 'n', label: 'Next file' },
  previous: { key: 'p', label: 'Previous file' },
  zen: { key: 'z', label: 'Toggle Zen mode' },
  sidebar: { key: 'b', label: 'Toggle main sidebar' },
} as const;
export type ReviewAction = keyof typeof reviewShortcuts;

export function matchesReviewLeader(
  event: Pick<KeyboardEvent, 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey'>,
  leader: ReviewLeader,
): boolean {
  const modifiers = leader.split('+');
  return (
    event.ctrlKey === modifiers.includes('Control') &&
    event.altKey === modifiers.includes('Alt') &&
    event.metaKey === modifiers.includes('Meta') &&
    event.shiftKey === modifiers.includes('Shift')
  );
}

export function reviewShortcutLabel(leader: ReviewLeader, key: string, mac: boolean): string {
  return [
    ...leader
      .split('+')
      .map((part) =>
        part === 'Control' ? 'Ctrl' : part === 'Meta' ? (mac ? 'Cmd' : 'Win') : part,
      ),
    key.toUpperCase(),
  ].join('+');
}
