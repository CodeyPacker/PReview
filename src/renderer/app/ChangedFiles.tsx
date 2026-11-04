import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronRight, FileDiff } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
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
import { FileFilterButton } from './FileFilterButton.tsx';
import { FileListSwitch } from './FileListSwitch.tsx';
import type { FileReviewFilter, FileReviewState } from '../lib/fileReview.ts';
import styles from './ChangedFiles.module.css';

const ALL_CHANGES = 'all';
// Longer lists render only the rows in view, so a large pull request stays quick to use.
export const VIRTUAL_AFTER = 300;
// A row's height before it's measured.
const ROW_ESTIMATE = 30;
// Matches the list's gap (--space-2).
const ROW_GAP = 2;

type Row = { kind: 'file'; file: PullRequestFile } | { kind: 'group' };
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
  supportOpen = false,
  onSupportOpenChange,
}: ChangedFilesProps) {
  const listRef = useRef<HTMLUListElement>(null);
  // In a long list, whether the selected row is rendered. The indicator is measured again
  // when it scrolls into view.
  const [selectedShown, setSelectedShown] = useState(true);
  const activeLayout = useMemo(
    () => ({
      filter,
      selectedPath,
      searchQuery,
      searchMatches,
      groupSupport,
      supportOpen,
      selectedShown,
    }),
    [filter, selectedPath, searchQuery, searchMatches, groupSupport, supportOpen, selectedShown],
  );
  const { code, support } = groupSupport
    ? splitSupportFiles(files ?? [])
    : { code: files ?? [], support: [] };
  const rows: Row[] = [
    ...code.map((file) => ({ kind: 'file' as const, file })),
    ...(support.length > 0 ? [{ kind: 'group' as const }] : []),
    ...(supportOpen ? support.map((file) => ({ kind: 'file' as const, file })) : []),
  ];
  const row = (row: Row) =>
    row.kind === 'group' ? (
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
    ) : (
      <FileTreeItem
        path={row.file.path}
        status={row.file.status}
        reviewState={reviewStates[row.file.path]}
        searchMatch={searchMatches.get(row.file.path)}
        additions={row.file.additions}
        deletions={row.file.deletions}
        selected={row.file.path === selectedPath}
        onClick={() => onSelect(row.file.path)}
      />
    );
  const rowKey = (row: Row) => (row.kind === 'group' ? 'support-group' : row.file.path);
  const rowClass = (row: Row) => (row.kind === 'group' ? styles.group : undefined);
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
      <div className={styles.search}>
        <div className={styles.searchRow}>
          <SearchField
            aria-label="Search files or text"
            placeholder="Search files or text…"
            value={searchQuery}
            onValueChange={onSearchChange}
          />
          <FileFilterButton value={filter} onValueChange={onFilterChange} />
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
          {rows.length > VIRTUAL_AFTER ? (
            <VirtualRows
              listRef={listRef}
              rows={rows}
              selectedIndex={rows.findIndex(
                (item) => item.kind === 'file' && item.file.path === selectedPath,
              )}
              onSelectedShownChange={setSelectedShown}
              rowKey={rowKey}
              rowClass={rowClass}
              renderRow={row}
            />
          ) : (
            rows.map((item) => (
              <li key={rowKey(item)} className={rowClass(item)}>
                {row(item)}
              </li>
            ))
          )}
        </ul>
      )}
    </Panel>
  );
}

// Margins count toward a row's size, so the group header's gap above it is kept.
function measureRow(element: Element): number {
  return element.getBoundingClientRect().height + parseFloat(getComputedStyle(element).marginTop);
}

// The rows in view of the list and a few either side. Empty rows above and below stand in for
// the rest, so rows stay in the list's flow and the indicator measures them as usual.
function VirtualRows({
  listRef,
  rows,
  selectedIndex,
  onSelectedShownChange,
  rowKey,
  rowClass,
  renderRow,
}: {
  listRef: RefObject<HTMLUListElement | null>;
  rows: readonly Row[];
  selectedIndex: number;
  onSelectedShownChange: (shown: boolean) => void;
  rowKey: (row: Row) => string;
  rowClass: (row: Row) => string | undefined;
  renderRow: (row: Row) => ReactNode;
}) {
  // eslint-disable-next-line react-hooks/incompatible-library -- No React Compiler memoizes it.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => ROW_ESTIMATE,
    getItemKey: (index) => rowKey(rows[index]!),
    gap: ROW_GAP,
    overscan: 10,
    measureElement: measureRow,
  });
  const items = virtualizer.getVirtualItems();
  const first = items[0];
  const last = items.at(-1);
  const selectedShown = items.some((item) => item.index === selectedIndex);
  useEffect(() => onSelectedShownChange(selectedShown), [selectedShown, onSelectedShownChange]);
  // Each spacer also takes a gap, so it is that much shorter.
  const above = (first?.start ?? 0) - ROW_GAP;
  const below = virtualizer.getTotalSize() - (last?.end ?? 0) - ROW_GAP;
  return (
    <>
      {above > 0 && <li aria-hidden style={{ height: above }} />}
      {items.map((item) => {
        const row = rows[item.index]!;
        return (
          <li
            key={item.key}
            ref={virtualizer.measureElement}
            data-index={item.index}
            className={rowClass(row)}
          >
            {renderRow(row)}
          </li>
        );
      })}
      {below > 0 && <li aria-hidden style={{ height: below }} />}
    </>
  );
}
