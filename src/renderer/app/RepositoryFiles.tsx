import { FolderTree } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { FileTree } from '../components/FileTree/FileTree.tsx';
import { Panel } from '../components/Panel/Panel.tsx';
import { SearchField } from '../components/SearchField/SearchField.tsx';
import { ToggleGroup } from '../components/ToggleGroup/ToggleGroup.tsx';
import styles from './RepositoryFiles.module.css';

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
      {matches && matches.length > 0 && (
        <FileTree
          className={styles.tree}
          aria-label="Repository files"
          paths={matches}
          selectedPath={selectedPath}
          onSelect={onSelect}
          expandAll={term !== ''}
        />
      )}
    </Panel>
  );
}
