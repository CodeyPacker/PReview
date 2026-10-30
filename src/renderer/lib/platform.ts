export const isMac = navigator.userAgent.includes('Mac');

// The modifier key shown in shortcut hints.
export const modKey = isMac ? '⌘' : 'Ctrl';
