// FileTreeItem: One row of the changed-file tree.
import { FileMinus, FilePen, FilePlus, FileSymlink, type LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { cx } from '../../lib/cx.ts';
import { DiffStat } from '../DiffStat/DiffStat.tsx';
import styles from './FileTreeItem.module.css';

export type FileStatus = 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed';

const statusIcons: Record<FileStatus, { icon: LucideIcon; label: string; className: string }> = {
  added: { icon: FilePlus, label: 'Added', className: styles.added ?? '' },
  removed: { icon: FileMinus, label: 'Removed', className: styles.removed ?? '' },
  modified: { icon: FilePen, label: 'Modified', className: styles.modified ?? '' },
  changed: { icon: FilePen, label: 'Modified', className: styles.modified ?? '' },
  renamed: { icon: FileSymlink, label: 'Renamed', className: styles.renamed ?? '' },
  copied: { icon: FileSymlink, label: 'Copied', className: styles.renamed ?? '' },
};

export interface FileTreeItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  // The file's full path. The folder part is dimmed and the file name stands out.
  path: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  selected?: boolean;
}

export function FileTreeItem({
  path,
  status,
  additions,
  deletions,
  selected,
  className,
  ...rest
}: FileTreeItemProps) {
  const slash = path.lastIndexOf('/');
  const folder = slash === -1 ? '' : path.slice(0, slash + 1);
  const name = path.slice(slash + 1);
  const { icon: Icon, label, className: statusClass } = statusIcons[status];
  return (
    <button
      {...rest}
      type="button"
      title={path}
      aria-current={selected || undefined}
      className={cx(styles.item, className)}
    >
      <Icon className={cx(styles.icon, statusClass)} aria-label={label} role="img" />
      <span className={styles.path}>
        {folder && <span className={styles.folder}>{folder}</span>}
        <span className={styles.name}>{name}</span>
      </span>
      <DiffStat additions={additions} deletions={deletions} />
    </button>
  );
}
