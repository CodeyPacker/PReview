// FileTree: Folders and files of a list of paths, opened and closed like an editor's explorer.
import { ChevronRight } from 'lucide-react';
import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { cx } from '../../lib/cx.ts';
import {
  allFolderPaths,
  buildFileTree,
  foldersAbove,
  visibleRows,
  type TreeRow,
} from '../../lib/fileTree.ts';
import { FileIcon, FolderIcon } from './icons.tsx';
import styles from './FileTree.module.css';

// Rows past this many wait for the reviewer to close folders or search.
const MAX_ROWS = 1000;

export interface FileTreeProps {
  className?: string;
  'aria-label': string;
  // Full paths of the files.
  paths: readonly string[];
  selectedPath?: string;
  onSelect: (path: string) => void;
  // Opens every folder, for a list that was narrowed by a search.
  expandAll?: boolean;
}

export function FileTree({
  className,
  paths,
  selectedPath,
  onSelect,
  expandAll = false,
  ...rest
}: FileTreeProps) {
  const tree = useMemo(() => buildFileTree(paths), [paths]);
  const everyFolder = useMemo(() => allFolderPaths(tree), [tree]);
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const [shownPath, setShownPath] = useState<string>();
  const [focusedPath, setFocusedPath] = useState<string>();
  const refs = useRef(new Map<string, HTMLElement>());

  // Showing another file opens the folders above it.
  if (selectedPath !== shownPath) {
    setShownPath(selectedPath);
    if (selectedPath) {
      setOpened((current) => new Set([...current, ...foldersAbove(tree, selectedPath)]));
    }
  }

  const open = expandAll ? everyFolder : opened;
  const allRows = useMemo(() => visibleRows(tree, open), [tree, open]);
  const rows = allRows.slice(0, MAX_ROWS);
  // The one row in the tab order: the focused one, else the selected one, else the first.
  const tabPath = rows.some((row) => row.node.path === focusedPath)
    ? focusedPath
    : rows.some((row) => row.node.path === selectedPath)
      ? selectedPath
      : rows[0]?.node.path;

  function toggle(path: string, next: boolean) {
    setOpened((current) => {
      const copy = new Set(current);
      if (next) copy.add(path);
      else copy.delete(path);
      return copy;
    });
  }

  function focusRow(path: string | undefined) {
    if (path === undefined) return;
    setFocusedPath(path);
    refs.current.get(path)?.focus();
  }

  function parentPath(row: TreeRow): string | undefined {
    const index = rows.indexOf(row);
    for (let i = index - 1; i >= 0; i--) {
      const candidate = rows[i];
      if (candidate && candidate.depth < row.depth) return candidate.node.path;
    }
    return undefined;
  }

  function onKeyDown(event: KeyboardEvent, row: TreeRow) {
    const index = rows.indexOf(row);
    const { node } = row;
    switch (event.key) {
      case 'ArrowDown':
        focusRow(rows[index + 1]?.node.path);
        break;
      case 'ArrowUp':
        focusRow(rows[index - 1]?.node.path);
        break;
      case 'Home':
        focusRow(rows[0]?.node.path);
        break;
      case 'End':
        focusRow(rows.at(-1)?.node.path);
        break;
      case 'ArrowRight':
        if (node.kind !== 'folder') return;
        if (!open.has(node.path)) toggle(node.path, true);
        else focusRow(rows[index + 1]?.node.path);
        break;
      case 'ArrowLeft':
        if (node.kind === 'folder' && open.has(node.path) && !expandAll) toggle(node.path, false);
        else focusRow(parentPath(row));
        break;
      case 'Enter':
      case ' ':
        if (node.kind === 'folder') toggle(node.path, !open.has(node.path));
        else onSelect(node.path);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  return (
    <div role="tree" className={cx(styles.tree, className)} {...rest}>
      {rows.map((row) => {
        const { node, depth } = row;
        const folder = node.kind === 'folder';
        const isOpen = folder && open.has(node.path);
        return (
          <div
            key={node.path}
            ref={(element) => {
              if (element) refs.current.set(node.path, element);
              else refs.current.delete(node.path);
            }}
            role="treeitem"
            title={node.path}
            aria-level={depth + 1}
            aria-expanded={folder ? isOpen : undefined}
            aria-selected={!folder ? node.path === selectedPath : undefined}
            tabIndex={node.path === tabPath ? 0 : -1}
            className={styles.row}
            style={{ '--depth': depth } as CSSProperties}
            onClick={() => {
              setFocusedPath(node.path);
              if (folder) toggle(node.path, !isOpen);
              else onSelect(node.path);
            }}
            onFocus={() => setFocusedPath(node.path)}
            onKeyDown={(event) => onKeyDown(event, row)}
          >
            {folder ? (
              <ChevronRight
                className={cx(styles.chevron, isOpen && styles.chevronOpen)}
                aria-hidden
              />
            ) : (
              <span className={styles.chevron} aria-hidden />
            )}
            {folder ? <FolderIcon open={isOpen} /> : <FileIcon />}
            <span className={styles.name}>{node.name}</span>
          </div>
        );
      })}
      {allRows.length > MAX_ROWS && (
        <p className={styles.note}>
          Showing {MAX_ROWS} of {allRows.length} rows. Close folders or search to narrow them.
        </p>
      )}
    </div>
  );
}
