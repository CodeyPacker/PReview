import { FileDiff } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { useActiveItemRect } from '../lib/useActiveItemRect.ts';
import { ActiveItemIndicator } from '../components/ActiveItemIndicator/ActiveItemIndicator.tsx';
import type { PullRequestFile } from '../../shared/contracts/pull-request-files.ts';
import { DiffStat } from '../components/DiffStat/DiffStat.tsx';
import { FileTreeItem } from '../components/FileTreeItem/FileTreeItem.tsx';
import { Panel } from '../components/Panel/Panel.tsx';
import { SearchField } from '../components/SearchField/SearchField.tsx';
import type { FileSearchMatch } from '../lib/fileSearch.ts';
import { ToggleGroup } from '../components/ToggleGroup/ToggleGroup.tsx';
import type { FileReviewFilter, FileReviewState } from '../lib/fileReview.ts';
import styles from './ChangedFiles.module.css';

export interface ChangedFilesProps {
  id?: string;
  className?: string;
  files: readonly PullRequestFile[] | undefined;
  totalFiles: number | undefined;
  reviewStates: Readonly<Record<string, FileReviewState>>;
  filter: FileReviewFilter;
  onFilterChange: (filter: FileReviewFilter) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchMatches: ReadonlyMap<string, FileSearchMatch>;
  searching: boolean;
  searchFailed: number;
  searchSkipped: number;
  loading: boolean;
  error: boolean;
  selectedPath: string | undefined;
  onSelect: (path: string) => void;
}

export function ChangedFiles({
  id,
  className,
  files,
  totalFiles,
  reviewStates,
  filter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  searchMatches,
  searching,
  searchFailed,
  searchSkipped,
  loading,
  error,
  selectedPath,
  onSelect,
}: ChangedFilesProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const activeLayout = useMemo(
    () => ({ filter, selectedPath, searchQuery, searchMatches }),
    [filter, selectedPath, searchQuery, searchMatches],
  );
  useActiveItemRect(listRef, ':scope > li > button[aria-current="true"]', activeLayout);
  const additions = files?.reduce((sum, file) => sum + file.additions, 0) ?? 0;
  const deletions = files?.reduce((sum, file) => sum + file.deletions, 0) ?? 0;

  return (
    <Panel
      id={id}
      className={className}
      title="Changed files"
      icon={<FileDiff aria-hidden />}
      count={totalFiles}
      padding="sm"
    >
      <ToggleGroup
        className={styles.filter}
        aria-label="Filter files"
        size="sm"
        block
        value={filter}
        onValueChange={onFilterChange}
        options={[
          { value: 'all', label: 'All' },
          { value: 'flagged', label: 'Flagged' },
          { value: 'not-approved', label: 'Unapproved' },
        ]}
      />
      <div className={styles.search}>
        <SearchField
          aria-label="Search files or text"
          placeholder="Search files or text…"
          value={searchQuery}
          onValueChange={onSearchChange}
        />
        {searching && (
          <p role="status" className={styles.searchStatus}>
            Searching file contents…
          </p>
        )}
        {searchFailed > 0 && (
          <p role="status" className={styles.searchStatus}>
            Some files could not be searched.
          </p>
        )}
        {searchSkipped > 0 && (
          <p className={styles.searchStatus}>
            Binary and large files are excluded from text search.
          </p>
        )}
      </div>
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
      {files?.length === 0 && (
        <p className={styles.message}>
          {searching
            ? 'Searching…'
            : searchQuery.trim()
              ? 'No files match this search and filter.'
              : filter === 'all'
                ? 'This pull request changes no files.'
                : 'No files match this filter.'}
        </p>
      )}
      {files && files.length > 0 && (
        <ul
          ref={listRef}
          className={styles.list}
          data-selected-review-state={selectedPath ? reviewStates[selectedPath] : undefined}
        >
          <ActiveItemIndicator as="li" className={styles.indicator} />
          {files.map((file) => (
            <li key={file.path}>
              <FileTreeItem
                path={file.path}
                status={file.status}
                reviewState={reviewStates[file.path]}
                searchMatch={searchMatches.get(file.path)}
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
