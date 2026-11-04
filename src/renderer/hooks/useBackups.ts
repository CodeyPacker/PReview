import { useMutation } from '@tanstack/react-query';

// Saves a copy of the database through the system's save dialog.
export function useExportBackup() {
  return useMutation({ mutationFn: () => window.preview.backups.export() });
}

// Asks for a backup and restarts to restore it. Settles only on cancel or a bad file.
export function useRestoreBackup() {
  return useMutation({ mutationFn: () => window.preview.backups.restore() });
}
