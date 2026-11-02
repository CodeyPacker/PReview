// Icons for the file tree: a Finder-style folder that opens, and a file icon for each file type.
import { getIconForFile } from '@react-symbols/icons/utils';
import styles from './icons.module.css';

export function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg className={styles.icon} viewBox="0 0 20 20" aria-hidden>
      <path
        className={styles.folderBack}
        d="M2 5.5a2 2 0 0 1 2-2h3.1c.5 0 1 .2 1.4.6l.9.9H16a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"
      />
      <rect
        className={styles.folderFront}
        data-open={open || undefined}
        x="2"
        y="7.5"
        width="16"
        height="9"
        rx="2"
      />
    </svg>
  );
}

// The icon for a file's type, picked from its name. Unknown types get a plain document.
export function FileTypeIcon({ fileName }: { fileName: string }) {
  return getIconForFile({
    fileName,
    autoAssign: true,
    className: styles.icon,
    'aria-hidden': true,
  });
}
