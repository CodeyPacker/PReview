// Icons for the file tree: a Finder-style folder that opens, and a document with a folded corner.
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

export function FileIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 20 20" aria-hidden>
      <path
        className={styles.page}
        d="M5.5 2.5h5.6c.4 0 .8.2 1.1.5l3.3 3.3c.3.3.5.7.5 1.1v8.1a2 2 0 0 1-2 2h-8.5a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2z"
      />
      <path className={styles.corner} d="M11.5 2.8v3a1.7 1.7 0 0 0 1.7 1.7h3" />
    </svg>
  );
}
