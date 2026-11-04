import { ChevronRight, FileDiff, FlaskConical } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { IconButton } from '../components/IconButton/IconButton.tsx';
import { splitSupportFiles } from '../lib/supportFiles.ts';
import { useActiveItemRect } from '../lib/useActiveItemRect.ts';
import { ActiveItemIndicator } from '../components/ActiveItemIndicator/ActiveItemIndicator.tsx';
import type {
  PullRequestCommit,
  PullRequestFile,
} from '../../shared/contracts/pull-request-files.ts';
import { DiffStat } from '../components/DiffStat/DiffStat.tsx';
import { FileTreeItem } from '../components/FileTreeItem/FileTreeItem.tsx';
import { Select } from '../components/Select/Select.tsx';
import { Panel } from '../components/Panel/Panel.tsx';
import { SearchField } from '../components/SearchField/SearchField.tsx';
import type { FileSearchMatch } from '../lib/fileSearch.ts';
import { ToggleGroup } from '../components/ToggleGroup/ToggleGroup.tsx';
import { FileListSwitch } from './FileListSwitch.tsx';
import type { FileReviewFilter, FileReviewState } from '../lib/fileReview.ts';
import styles from './ChangedFiles.module.css';

const ALL_CHANGES = 'all';
export const SINCE_REVIEW = 'since-review';

export interface ChangedFilesProps {
  id?: string;
  className?: string;
  // The pull request's commits, oldest first. The files of one can be shown on their own.
  commits?: readonly PullRequestCommit[];
  // Adds the choice of the changes since the last submitted review.
  hasLastReview?: boolean;
  // Undefined shows all changes of the pull request. SINCE_REVIEW shows the changes since the
  // last submitted review.
  commitSha?: string;
  onCommitChange?: (sha: string | undefined) => void;
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
  // Adds the choice of listing the repository's files instead of the changed ones.
  onBrowseChange?: (browsing: boolean) => void;
  // Puts tests, stories and generated files in a group at the bottom, collapsed until opened.
  groupSupport?: boolean;
  onGroupSupportChange?: (grouped: boolean) => void;
  supportOpen?: boolean;
  onSupportOpenChange?: (open: boolean) => void;
}

export function ChangedFiles({
  id,
  className,
  commits,
  hasLastReview = false,
  commitSha,
  onCommitChange,
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
  onBrowseChange,
  groupSupport = false,
  onGroupSupportChange,
  supportOpen = false,
  onSupportOpenChange,
}: ChangedFilesProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const activeLayout = useMemo(
    () => ({ filter, selectedPath, searchQuery, searchMatches, groupSupport, supportOpen }),
    [filter, selectedPath, searchQuery, searchMatches, groupSupport, supportOpen],
  );
  const { code, support } = groupSupport
    ? splitSupportFiles(files ?? [])
    : { code: files ?? [], support: [] };
  const item = (file: PullRequestFile) => (
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
      {onBrowseChange && <FileListSwitch browsing={false} onBrowseChange={onBrowseChange} />}
      {commits && commits.length > 0 && (
        <Select
          block
          size="sm"
          aria-label="Commit"
          value={commitSha ?? ALL_CHANGES}
          onValueChange={(value) => onCommitChange?.(value === ALL_CHANGES ? undefined : value)}
          options={[
            { value: ALL_CHANGES, label: 'All changes' },
            ...(hasLastReview ? [{ value: SINCE_REVIEW, label: 'Since last review' }] : []),
            ...commits.map((commit) => ({
              value: commit.sha,
              label: `${commit.sha.slice(0, 7)} ${commit.subject}`,
            })),
          ]}
        />
      )}
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
        <div className={styles.searchRow}>
          <SearchField
            aria-label="Search files or text"
            placeholder="Search files or text…"
            value={searchQuery}
            onValueChange={onSearchChange}
          />
          {onGroupSupportChange && (
            <IconButton
              size="sm"
              variant="plain"
              icon={<FlaskConical aria-hidden />}
              label="Group tests and generated files"
              selected={groupSupport}
              onClick={() => onGroupSupportChange(!groupSupport)}
            />
          )}
        </div>
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
          {code.map(item)}
          {support.length > 0 && (
            <li className={styles.group}>
              <button
                type="button"
                className={styles.groupHeader}
                aria-expanded={supportOpen}
                onClick={() => onSupportOpenChange?.(!supportOpen)}
              >
                <ChevronRight aria-hidden className={styles.groupChevron} />
                <span>Tests, stories & generated</span>
                <span className={styles.groupCount}>{support.length}</span>
              </button>
            </li>
          )}
          {supportOpen && support.map(item)}
        </ul>
      )}
    </Panel>
  );
}
