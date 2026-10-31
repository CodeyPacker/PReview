import { FileDiff } from 'lucide-react';
import type { PullRequestFile } from '../../shared/contracts/pull-request-files.ts';
import { DiffStat } from '../components/DiffStat/DiffStat.tsx';
import { FileTreeItem } from '../components/FileTreeItem/FileTreeItem.tsx';
import { Panel } from '../components/Panel/Panel.tsx';
import styles from './ChangedFiles.module.css';

export interface ChangedFilesProps {
  className?: string;
  files: readonly PullRequestFile[] | undefined;
  loading: boolean;
  error: boolean;
  selectedPath: string | undefined;
  onSelect: (path: string) => void;
}

export function ChangedFiles({
  className,
  files,
  loading,
  error,
  selectedPath,
  onSelect,
}: ChangedFilesProps) {
  const additions = files?.reduce((sum, file) => sum + file.additions, 0) ?? 0;
  const deletions = files?.reduce((sum, file) => sum + file.deletions, 0) ?? 0;

  return (
    <Panel
      className={className}
      title="Changed files"
      icon={<FileDiff aria-hidden />}
      count={files?.length}
      padding="sm"
    >
      {files && files.length > 0 && (
        <div className={styles.total}>
          <span>
            {files.length} {files.length === 1 ? 'file' : 'files'} changed
          </span>
          <DiffStat additions={additions} deletions={deletions} />
        </div>
      )}
      {loading && <p className={styles.message}>Loading files…</p>}
      {error && <p className={styles.message}>Could not load the files. Try again later.</p>}
      {files?.length === 0 && <p className={styles.message}>This pull request changes no files.</p>}
      {files && files.length > 0 && (
        <ul className={styles.list}>
          {files.map((file) => (
            <li key={file.path}>
              <FileTreeItem
                path={file.path}
                status={file.status}
                additions={file.additions}
                deletions={file.deletions}
                selected={file.path === selectedPath}
                onClick={() => onSelect(file.path)}
              />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
