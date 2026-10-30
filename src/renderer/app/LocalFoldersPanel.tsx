import { FolderOpen, FolderPlus, Trash2 } from 'lucide-react';
import { MAX_SCAN_DEPTH } from '../../shared/contracts/repositories.ts';
import { Button } from '../components/Button/Button.tsx';
import { IconButton } from '../components/IconButton/IconButton.tsx';
import { Panel } from '../components/Panel/Panel.tsx';
import { Select } from '../components/Select/Select.tsx';
import {
  useAddFolder,
  useRemoveFolder,
  useSetScanDepth,
  useWatchedFolders,
} from '../hooks/useRepositories.ts';
import styles from './LocalFoldersPanel.module.css';

const depthOptions = Array.from({ length: MAX_SCAN_DEPTH + 1 }, (_, depth) => ({
  value: String(depth),
  label: depth === 0 ? 'Folder only' : depth === 1 ? '1 level deep' : `${depth} levels deep`,
}));

export function LocalFoldersPanel() {
  const { data: folders = [] } = useWatchedFolders();
  const add = useAddFolder();
  const remove = useRemoveFolder();
  const setScanDepth = useSetScanDepth();

  return (
    <Panel
      title="Local Folders"
      icon={<FolderOpen aria-hidden />}
      className={styles.panel}
      action={
        <Button
          variant="primary"
          size="sm"
          iconStart={<FolderPlus aria-hidden />}
          loading={add.isPending}
          onClick={() => add.mutate(undefined)}
        >
          Add Folder…
        </Button>
      }
    >
      <p className={styles.description}>
        PReview looks for Git repositories in these folders and the folders inside them.
      </p>
      {folders.length === 0 ? (
        <p className={styles.empty}>No folders yet. Add the folder where you keep your code.</p>
      ) : (
        <ul className={styles.list}>
          {folders.map((folder) => (
            <li key={folder.id} className={styles.item}>
              <span className={styles.path}>{folder.path}</span>
              <Select
                size="sm"
                aria-label={`Scan depth for ${folder.path}`}
                options={depthOptions}
                value={String(folder.scanDepth)}
                onValueChange={(depth) =>
                  setScanDepth.mutate({ id: folder.id, scanDepth: Number(depth) })
                }
              />
              <IconButton
                variant="plain"
                tone="danger"
                size="sm"
                label={`Remove ${folder.path}`}
                icon={<Trash2 aria-hidden />}
                onClick={() => remove.mutate(folder.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
