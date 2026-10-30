import { useState } from 'react';
import { useGitHubAuth } from '../hooks/useGitHubAuth.ts';
import { useSettings, useUpdateSettings } from '../hooks/useSettings.ts';
import { GitHubConnectDialog } from './GitHubConnectDialog.tsx';

// Opens the GitHub connect dialog on launch until the user connects or closes it once.
export function GitHubPrompt() {
  const { data: settings } = useSettings();
  const { data: auth } = useGitHubAuth();
  const updateSettings = useUpdateSettings();
  const [phase, setPhase] = useState<'waiting' | 'open' | 'closed'>('waiting');

  if (
    phase === 'waiting' &&
    settings?.githubPromptDismissed === false &&
    auth?.status === 'disconnected'
  ) {
    setPhase('open');
  }

  return (
    <GitHubConnectDialog
      open={phase === 'open'}
      onOpenChange={(open) => {
        if (open) return;
        setPhase('closed');
        updateSettings.mutate({ githubPromptDismissed: true });
      }}
    />
  );
}
