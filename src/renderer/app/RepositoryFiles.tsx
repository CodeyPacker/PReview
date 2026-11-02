import { FolderTree } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import type { RepositorySearchMatch } from '../../shared/contracts/repository-search.ts';
import { useRepositorySearch } from '../hooks/useRepositorySearch.ts';
import { FileTree } from '../components/FileTree/FileTree.tsx';
import { Panel } from '../components/Panel/Panel.tsx';
import { SearchField } from '../components/SearchField/SearchField.tsx';
import { ToggleGroup } from '../components/ToggleGroup/ToggleGroup.tsx';
import { FileListSwitch } from './FileListSwitch.tsx';
import { RepositorySearchResults } from './RepositorySearchResults.tsx';
import styles from './RepositoryFiles.module.css';

export interface RepositoryFilesProps {
  id?: string;
  className?: string;
  pullRequestId: number;
  // The commit the files are read at. Undefined while it loads.
  headSha: string | undefined;
  // Undefined while the paths load.
  paths: readonly string[] | undefined;
  // The provider cut its listing short.
  truncated: boolean;
  error: boolean;
  selectedPath: string | undefined;
  onSelect: (path: string) => void;
  // The match of a text search that is open in the diff.
  selectedMatch: { path: string; line: number } | undefined;
  // query is the text that was searched, so the diff can mark it.
  onSelectMatch: (match: RepositorySearchMatch, query: string) => void;
  onBrowseChange: (browsing: boolean) => void;
}

// Every file of the repository at the pull request's head, to read the ones it doesn't change.
export function RepositoryFiles({
  id,
  className,
  pullRequestId,
  headSha,
  paths,
  truncated,
  error,
  selectedPath,
  onSelect,
  selectedMatch,
  onSelectMatch,
  onBrowseChange,
}: RepositoryFilesProps) {
  const [searchBy, setSearchBy] = useState<'names' | 'text'>('names');
  const [query, setQuery] = useState('');
  const term = useDeferredValue(searchBy === 'names' ? query.trim().toLowerCase() : '');
  const matches = paths?.filter((path) => path.toLowerCase().includes(term));
  const textSearch = useRepositorySearch(pullRequestId, headSha, searchBy === 'text' ? query : '');

  return (
    <Panel
      id={id}
      className={className}
      title="Repository files"
      icon={<FolderTree aria-hidden />}
      count={paths?.length}
      padding="sm"
    >
      <FileListSwitch browsing onBrowseChange={onBrowseChange} />
      <ToggleGroup
        aria-label="Search by"
        size="sm"
        block
        value={searchBy}
        onValueChange={setSearchBy}
        options={[
          { value: 'names', label: 'File names' },
          { value: 'text', label: 'Text' },
        ]}
      />
      <SearchField
        aria-label={
          searchBy === 'names' ? 'Search repository files' : 'Search text in the repository'
        }
        placeholder={searchBy === 'names' ? 'Search files…' : 'Search text in all files…'}
        value={query}
        onValueChange={setQuery}
      />
      {searchBy === 'text' ? (
        <RepositorySearchResults
          className={styles.results}
          {...textSearch}
          selected={selectedMatch}
          onSelect={(match) => onSelectMatch(match, query.trim())}
        />
      ) : (
        <>
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
        </>
      )}
    </Panel>
  );
}
