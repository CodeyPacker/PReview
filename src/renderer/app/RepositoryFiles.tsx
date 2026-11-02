import { File, FolderTree } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { Panel } from '../components/Panel/Panel.tsx';
import { SearchField } from '../components/SearchField/SearchField.tsx';
import { ToggleGroup } from '../components/ToggleGroup/ToggleGroup.tsx';
import styles from './RepositoryFiles.module.css';

// Rows past this many wait for a narrower search, so a large repository stays quick.
const MAX_ROWS = 300;

export interface RepositoryFilesProps {
  id?: string;
  className?: string;
  // Undefined while the paths load.
  paths: readonly string[] | undefined;
  // The provider cut its listing short.
  truncated: boolean;
  error: boolean;
  selectedPath: string | undefined;
  onSelect: (path: string) => void;
  onBrowseChange: (browsing: boolean) => void;
}

// Every file of the repository at the pull request's head, to read the ones it doesn't change.
export function RepositoryFiles({
  id,
  className,
  paths,
  truncated,
  error,
  selectedPath,
  onSelect,
  onBrowseChange,
}: RepositoryFilesProps) {
  const [query, setQuery] = useState('');
  const term = useDeferredValue(query.trim().toLowerCase());
  const matches = paths?.filter((path) => path.toLowerCase().includes(term));
  const shown = matches?.slice(0, MAX_ROWS);

  return (
    <Panel
      id={id}
      className={className}
      title="Repository files"
      icon={<FolderTree aria-hidden />}
      count={paths?.length}
      padding="sm"
    >
      <ToggleGroup
        aria-label="File list"
        size="sm"
        block
        value="repository"
        onValueChange={(value) => onBrowseChange(value === 'repository')}
        options={[
          { value: 'changed', label: 'Changed' },
          { value: 'repository', label: 'Repository' },
        ]}
      />
      <SearchField
        aria-label="Search repository files"
        placeholder="Search files…"
        value={query}
        onValueChange={setQuery}
      />
      {!paths && !error && <p className={styles.message}>Loading files…</p>}
      {error && <p className={styles.message}>Could not load the files. Try again later.</p>}
      {truncated && (
        <p className={styles.message}>This repository is large, so some files are missing.</p>
      )}
      {matches?.length === 0 && <p className={styles.message}>No files match this search.</p>}
      {shown && shown.length > 0 && (
        <ul className={styles.list}>
          {shown.map((path) => {
            const slash = path.lastIndexOf('/');
            return (
              <li key={path}>
                <button
                  type="button"
                  title={path}
                  aria-current={path === selectedPath || undefined}
                  className={styles.item}
                  onClick={() => onSelect(path)}
                >
                  <File className={styles.icon} aria-hidden />
                  <span className={styles.path}>
                    {slash !== -1 && (
                      <span className={styles.folder}>{path.slice(0, slash + 1)}</span>
                    )}
                    <span>{path.slice(slash + 1)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {matches && matches.length > MAX_ROWS && (
        <p className={styles.message}>
          Showing {MAX_ROWS} of {matches.length} files. Search to narrow them.
        </p>
      )}
    </Panel>
  );
}
