import {
  RESERVED_REVIEW_KEYS,
  type ReviewAction,
  type ReviewKeys,
  type ReviewLeader,
} from '../../shared/contracts/settings.ts';

export const reviewActionLabels: Record<ReviewAction, string> = {
  approve: 'Toggle approval',
  flag: 'Toggle flag',
  comment: 'Comment on line',
  tree: 'Toggle file tree',
  next: 'Next file',
  previous: 'Previous file',
  zen: 'Toggle Zen mode',
  sidebar: 'Toggle main sidebar',
};

// The keys after giving an action the letter of a key code like 'KeyB', or why it can't have it.
export function changeReviewKey(
  keys: ReviewKeys,
  action: ReviewAction,
  code: string,
): { keys: ReviewKeys; error?: undefined } | { keys?: undefined; error: string } {
  if (!/^Key[A-Z]$/.test(code)) return { error: 'Use a letter from A to Z.' };
  const letter = code.slice(3).toLowerCase();
  const name = letter.toUpperCase();
  if (RESERVED_REVIEW_KEYS.includes(letter)) {
    return { error: `${name} is kept for system shortcuts like copy and quit.` };
  }
  if (keys[action] === letter) return { keys };
  const owner = (Object.keys(keys) as ReviewAction[]).find((other) => keys[other] === letter);
  if (owner) return { error: `${name} is already used for ${reviewActionLabels[owner]}.` };
  return { keys: { ...keys, [action]: letter } };
}

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
