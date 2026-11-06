// Lets the code that saves a finding or a review tell the sidebar's companion to celebrate.
const listeners = new Set<() => void>();

export function cheerCompanion(): void {
  for (const listener of listeners) listener();
}

export function onCompanionCheer(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
