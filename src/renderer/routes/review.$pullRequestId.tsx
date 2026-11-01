import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Flag,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSidebar } from '../app/SidebarContext.ts';
import { IconButton } from '../components/IconButton/IconButton.tsx';
import { cx } from '../lib/cx.ts';
import { ChangedFiles } from '../app/ChangedFiles.tsx';
import { ImageDiff } from '../app/ImageDiff.tsx';
import { DiffViewer, type DiffMode, type DiffViewerHandle } from '../app/DiffViewer.tsx';
import { relativeTime } from '../app/relativeTime.ts';
import { repositoryName } from '../app/repositoryName.ts';
import { Avatar } from '../components/Avatar/Avatar.tsx';
import { Button } from '../components/Button/Button.tsx';
import { Panel } from '../components/Panel/Panel.tsx';
import { StatusPill } from '../components/StatusPill/StatusPill.tsx';
import { ToggleGroup } from '../components/ToggleGroup/ToggleGroup.tsx';
import { usePullRequestFileDiff, usePullRequestFiles } from '../hooks/usePullRequestFiles.ts';
import { usePullRequests } from '../hooks/usePullRequests.ts';
import { useRepositories } from '../hooks/useRepositories.ts';
import { useFileSearch } from '../hooks/useFileSearch.ts';
import { matchesFilePath } from '../lib/fileSearch.ts';
import { useFileReviewStates } from '../hooks/useFileReviewStates.ts';
import {
  matchesFileReviewFilter,
  type FileReviewFilter,
  type FileReviewState,
} from '../lib/fileReview.ts';
import { useGitHubAuth } from '../hooks/useGitHubAuth.ts';
import { ReviewDialog } from '../app/ReviewDialog.tsx';
import type { DraftComposerState } from '../app/DraftComments.tsx';
import { useReviewDrafts } from '../hooks/useReviewDrafts.ts';
import { useSettings } from '../hooks/useSettings.ts';
import { useReviewShortcuts } from '../hooks/useReviewShortcuts.ts';
import { defaultSettings } from '../../shared/contracts/settings.ts';
import { reviewShortcutLabel } from '../lib/reviewShortcuts.ts';
import { isMac } from '../lib/platform.ts';
import styles from './review.module.css';

export const Route = createFileRoute('/review/$pullRequestId')({ component: ReviewPage });

const modeOptions = [
  { value: 'split', label: 'Split' },
  { value: 'unified', label: 'Unified' },
] satisfies { value: DiffMode; label: string }[];

function ReviewPage() {
  const pullRequestId = Number(Route.useParams().pullRequestId);
  const navigate = useNavigate();
  const { data: pullRequestState, isPending } = usePullRequests();
  const { data: repositoryState } = useRepositories();
  const pullRequest = pullRequestState?.pullRequests.find((pull) => pull.id === pullRequestId);
  const { data: auth } = useGitHubAuth();
  const [reviewOpen, setReviewOpen] = useState(false);
  const repository = repositoryState?.repositories.find(
    (item) => item.id === pullRequest?.repositoryId,
  );

  const files = usePullRequestFiles(pullRequestId, pullRequest?.headSha, pullRequest?.baseBranch);
  const changedFiles = files.data?.files;
  const [chosenPath, setChosenPath] = useState<string>();
  const [fileFilter, setFileFilter] = useState<FileReviewFilter>('all');
  const [fileSearch, setFileSearch] = useState('');
  const search = useFileSearch(pullRequestId, files.data, fileSearch);
  const searchTerm = fileSearch.trim().toLowerCase();
  const { reviewStates, setReviewState } = useFileReviewStates(pullRequestId, files.data);
  const visibleFiles = changedFiles?.filter(
    (file) =>
      matchesFileReviewFilter(reviewStates[file.path], fileFilter) &&
      (!searchTerm || matchesFilePath(file, searchTerm) || search.matches.has(file.path)),
  );
  const reviewDrafts = useReviewDrafts(pullRequestId);
  const [composer, setComposer] = useState<DraftComposerState>();
  // Drafts written on other commits stay stored, but only these line up with the diff on show.
  const currentDrafts = reviewDrafts.drafts.data?.filter(
    (draft) => draft.headSha === files.data?.headSha && draft.mergeBase === files.data.mergeBase,
  );
  const [mode, setMode] = useState<DiffMode>('split');
  const [lineNumberOffset, setLineNumberOffset] = useState(52);
  const {
    collapsed: sidebarCollapsed,
    setCollapsed: setSidebarCollapsed,
    filesCollapsed,
    setFilesCollapsed,
    zen,
    toggleZen,
  } = useSidebar();
  const { data: settings } = useSettings();
  const leader = settings?.reviewLeader ?? defaultSettings.reviewLeader;
  const shortcut = (key: string) => reviewShortcutLabel(leader, key, isMac);
  const diffViewer = useRef<DiffViewerHandle>(null);
  const initialSidebarCollapsed = useRef(sidebarCollapsed);

  useEffect(() => {
    const wasCollapsed = initialSidebarCollapsed.current;
    setSidebarCollapsed(true);
    setFilesCollapsed(true);
    return () => setSidebarCollapsed(wasCollapsed);
  }, [setSidebarCollapsed, setFilesCollapsed]);

  function changeMode(next: DiffMode) {
    setMode(next);
    setFilesCollapsed(next === 'split');
    setSidebarCollapsed(next === 'split');
  }
  const selected = visibleFiles?.find((file) => file.path === chosenPath) ?? visibleFiles?.[0];
  const selectedIndex = visibleFiles?.findIndex((file) => file.path === selected?.path) ?? -1;
  const previousFile = visibleFiles?.[selectedIndex - 1];
  const nextFile = selectedIndex >= 0 ? visibleFiles?.[selectedIndex + 1] : undefined;
  const reviewState = selected ? reviewStates[selected.path] : undefined;

  function selectFile(path: string) {
    setChosenPath(path);
  }

  function toggleReviewState(state: FileReviewState) {
    if (!selected) return;
    const nextState = reviewState === state ? undefined : state;
    setReviewState(selected.path, nextState);
    if (nextState && nextFile) selectFile(nextFile.path);
  }

  useReviewShortcuts(
    leader,
    {
      approve: () => toggleReviewState('approved'),
      flag: () => toggleReviewState('flagged'),
      comment: () => diffViewer.current?.commentOnCursorLine(),
      tree: () => setFilesCollapsed((value) => !value),
      next: () => {
        if (nextFile) selectFile(nextFile.path);
      },
      previous: () => {
        if (previousFile) selectFile(previousFile.path);
      },
      zen: toggleZen,
      sidebar: () => setSidebarCollapsed((value) => !value),
    },
    {
      start: (direction) => diffViewer.current?.startScroll(direction),
      stop: () => diffViewer.current?.stopScroll(),
      cancel: () => diffViewer.current?.cancelScroll(),
    },
  );

  const isAdded = selected?.status === 'added';
  const effectiveMode = isAdded ? 'unified' : mode;
  const diff = usePullRequestFileDiff(
    pullRequestId,
    files.data,
    selected?.path,
    selected?.previousPath ?? null,
  );

  function changeComposer(next: DraftComposerState | undefined) {
    // A comment with unsent text stays open until it is saved or cancelled. Opening another
    // one goes back to it instead.
    const moved =
      next?.path !== composer?.path ||
      next?.side !== composer?.side ||
      next?.line !== composer?.line ||
      next?.draftId !== composer?.draftId;
    if (next && moved && composer?.body.trim()) {
      selectFile(composer.path);
      return;
    }
    reviewDrafts.create.reset();
    reviewDrafts.update.reset();
    setComposer(next);
  }

  function saveComposer() {
    if (!composer || !files.data) return;
    const done = { onSuccess: () => setComposer(undefined) };
    if (composer.draftId === undefined) {
      reviewDrafts.create.mutate(
        {
          pullRequestId,
          headSha: files.data.headSha,
          mergeBase: files.data.mergeBase,
          path: composer.path,
          side: composer.side,
          line: composer.line,
          body: composer.body,
        },
        done,
      );
    } else {
      reviewDrafts.update.mutate(
        { pullRequestId, id: composer.draftId, body: composer.body },
        done,
      );
    }
  }

  const back = (
    <Button
      variant="plain"
      size="sm"
      iconStart={<ArrowLeft aria-hidden />}
      onClick={() => void navigate({ to: '/inbox' })}
    >
      Inbox
    </Button>
  );

  if (!pullRequest) {
    return (
      <div className={cx(styles.page, zen && styles.zen)}>
        <div className={styles.header}>{back}</div>
        <p className={styles.message}>
          {isPending ? 'Loading…' : 'This pull request is no longer open or monitored.'}
        </p>
      </div>
    );
  }

  const { author } = pullRequest;
  let diffMessage: string | undefined;
  if (diff.isPending && selected) diffMessage = 'Loading the file…';
  else if (diff.isError) diffMessage = 'Could not load the file. Try again later.';
  else if (diff.data?.unavailable === 'binary') diffMessage = 'This file is binary.';
  else if (diff.data?.unavailable === 'too-large') diffMessage = 'This file is too large to show.';
  else if (!selected && !files.isPending)
    diffMessage = search.searching
      ? 'Searching file contents…'
      : searchTerm
        ? 'No files match this search and filter.'
        : fileFilter === 'all'
          ? 'There are no files to show.'
          : 'No files match this filter.';

  return (
    <div className={cx(styles.page, zen && styles.zen)}>
      <header className={styles.header}>
        <div className={styles.summary}>
          <h1 className={styles.pullRequest} title={pullRequest.title}>
            {repository ? repositoryName(repository) : 'Repository'} #{pullRequest.number}
          </h1>
          <StatusPill status={pullRequest.draft ? 'draft' : 'open'} />
          <span className={styles.branches}>
            {pullRequest.headBranch} → {pullRequest.baseBranch}
          </span>
          <span className={styles.author}>
            <Avatar name={author?.login ?? 'Unknown author'} src={author?.avatarUrl} size="xs" />
            Opened {relativeTime(pullRequest.createdAt)} by {author?.login ?? 'an unknown author'}
          </span>
        </div>
        <Button
          variant="primary"
          size="sm"
          disabled={!files.data}
          onClick={() => setReviewOpen(true)}
        >
          Submit review
        </Button>
      </header>
      {files.data && (
        <ReviewDialog
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          pullRequestId={pullRequestId}
          pullRequestUrl={pullRequest.url}
          headSha={files.data.headSha}
          ownPullRequest={
            auth?.status === 'connected' && auth.user.login === pullRequest.author?.login
          }
        />
      )}
      <div className={cx(styles.workspace, filesCollapsed && styles.filesCollapsed)}>
        <IconButton
          className={styles.treeToggle}
          variant="plain"
          size="sm"
          icon={filesCollapsed ? <ChevronRight /> : <ChevronLeft />}
          label={filesCollapsed ? 'Expand changed files' : 'Collapse changed files'}
          shortcut={shortcut('t')}
          aria-expanded={!filesCollapsed}
          aria-controls="review-files"
          onClick={() => setFilesCollapsed((value) => !value)}
        />
        <div
          className={styles.filesSlot}
          inert={filesCollapsed}
          aria-hidden={filesCollapsed || undefined}
        >
          <ChangedFiles
            id="review-files"
            className={styles.files}
            files={visibleFiles}
            totalFiles={changedFiles?.length}
            reviewStates={reviewStates}
            filter={fileFilter}
            onFilterChange={setFileFilter}
            searchQuery={fileSearch}
            onSearchChange={setFileSearch}
            searchMatches={search.matches}
            searching={search.searching}
            searchFailed={search.failed}
            searchSkipped={search.skipped}
            loading={files.isPending}
            error={files.isError}
            selectedPath={selected?.path}
            onSelect={selectFile}
          />
        </div>
        <Panel className={styles.diff} padding="sm" aria-labelledby="review-file-title">
          <header
            className={styles.diffHeader}
            style={{ gridTemplateColumns: `${lineNumberOffset}px minmax(0, 1fr) auto` }}
          >
            <h2 id="review-file-title" className={styles.filename}>
              {selected?.path ?? 'Diff'}
            </h2>
            <div className={styles.diffActions}>
              <IconButton
                variant="plain"
                size="sm"
                icon={<ArrowLeft />}
                label="Previous file"
                shortcut={shortcut('p')}
                disabled={!previousFile}
                onClick={() => previousFile && selectFile(previousFile.path)}
              />
              <IconButton
                variant="plain"
                size="sm"
                icon={<ArrowRight />}
                label="Next file"
                shortcut={shortcut('n')}
                disabled={!nextFile}
                onClick={() => nextFile && selectFile(nextFile.path)}
              />
              <IconButton
                className={styles.reviewAction}
                variant="plain"
                tone="success"
                size="sm"
                icon={<Check />}
                label={reviewState === 'approved' ? 'Remove file approval' : 'Approve file'}
                shortcut={shortcut('a')}
                selected={reviewState === 'approved'}
                disabled={!selected}
                onClick={() => toggleReviewState('approved')}
              />
              <IconButton
                className={styles.reviewAction}
                variant="plain"
                tone="warning"
                size="sm"
                icon={<Flag className={styles.flagIcon} />}
                label={reviewState === 'flagged' ? 'Remove file flag' : 'Flag file'}
                shortcut={shortcut('f')}
                selected={reviewState === 'flagged'}
                disabled={!selected}
                onClick={() => toggleReviewState('flagged')}
              />
              <IconButton
                variant="plain"
                size="sm"
                icon={zen ? <Minimize2 /> : <Maximize2 />}
                label={zen ? 'Exit Zen mode' : 'Enter Zen mode'}
                shortcut={shortcut('z')}
                selected={zen}
                onClick={toggleZen}
              />
              <ToggleGroup
                aria-label="Diff layout"
                size="sm"
                options={modeOptions.map((option) => ({
                  ...option,
                  disabled: isAdded && option.value === 'split',
                }))}
                value={effectiveMode}
                onValueChange={changeMode}
              />
            </div>
          </header>
          {diffMessage ? (
            <p className={styles.message}>{diffMessage}</p>
          ) : (
            selected &&
            diff.data &&
            (diff.data.images ? (
              <ImageDiff
                path={selected.path}
                original={diff.data.images.original}
                modified={diff.data.images.modified}
              />
            ) : (
              <DiffViewer
                ref={diffViewer}
                path={selected.path}
                previousPath={selected.previousPath}
                original={diff.data.original}
                modified={diff.data.modified}
                mode={effectiveMode}
                onLineNumberOffsetChange={setLineNumberOffset}
                searchQuery={fileSearch.trim()}
                searchMatch={selected ? search.matches.get(selected.path) : undefined}
                drafts={{
                  items: currentDrafts?.filter((draft) => draft.path === selected.path) ?? [],
                  author:
                    auth?.status === 'connected'
                      ? { name: auth.user.login, avatarUrl: auth.user.avatarUrl }
                      : { name: 'You' },
                  composer: composer?.path === selected.path ? composer : undefined,
                  onComposerChange: changeComposer,
                  onSave: saveComposer,
                  saving: reviewDrafts.create.isPending || reviewDrafts.update.isPending,
                  saveFailed: reviewDrafts.create.isError || reviewDrafts.update.isError,
                  onDelete: (id) => reviewDrafts.remove.mutate(id),
                  deletingId: reviewDrafts.remove.isPending
                    ? reviewDrafts.remove.variables
                    : undefined,
                }}
              />
            ))
          )}
        </Panel>
      </div>
    </div>
  );
}
