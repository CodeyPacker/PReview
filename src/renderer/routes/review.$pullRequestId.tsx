import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Flag,
  ListChecks,
  Maximize2,
  Minimize2,
  RefreshCw,
} from 'lucide-react';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { useSidebar } from '../app/SidebarContext.ts';
import { IconButton } from '../components/IconButton/IconButton.tsx';
import { cx } from '../lib/cx.ts';
import { ChangedFiles } from '../app/ChangedFiles.tsx';
import type { PullRequestFile } from '../../shared/contracts/pull-request-files.ts';
import type { RepositorySearchMatch } from '../../shared/contracts/repository-search.ts';
import { RepositoryFiles } from '../app/RepositoryFiles.tsx';
import { ImageDiff } from '../app/ImageDiff.tsx';
import { DiffViewer, type DiffMode, type DiffViewerHandle } from '../app/DiffViewer.tsx';
import { relativeTime } from '../app/relativeTime.ts';
import { repositoryName } from '../app/repositoryName.ts';
import { Avatar } from '../components/Avatar/Avatar.tsx';
import { Button } from '../components/Button/Button.tsx';
import { Panel } from '../components/Panel/Panel.tsx';
import { StatusPill } from '../components/StatusPill/StatusPill.tsx';
import { ToggleGroup } from '../components/ToggleGroup/ToggleGroup.tsx';
import { usePullRequestFileDiff } from '../hooks/usePullRequestFiles.ts';
import { usePullRequests } from '../hooks/usePullRequests.ts';
import { useRepositories } from '../hooks/useRepositories.ts';
import { useFileSearch } from '../hooks/useFileSearch.ts';
import { matchesFilePath, type FileSearchMatch } from '../lib/fileSearch.ts';
import { useFileReviewStates } from '../hooks/useFileReviewStates.ts';
import {
  matchesFileReviewFilter,
  type FileReviewFilter,
  type FileReviewState,
} from '../lib/fileReview.ts';
import { findAccount, useGitHubAuth } from '../hooks/useGitHubAuth.ts';
import { useAgentTasks } from '../hooks/useAgentTasks.ts';
import { agentStatus } from '../app/agentStatus.ts';
import { AgentReviewDialog } from '../app/AgentReviewDialog.tsx';
import { ReviewDialog } from '../app/ReviewDialog.tsx';
import { FindingsDialog } from '../app/FindingsDialog.tsx';
import { Count } from '../components/Count/Count.tsx';
import { useReviewFindings } from '../hooks/useReviewFindings.ts';
import { useQueuedReview } from '../hooks/useQueuedReview.ts';
import { useReviewCompletion } from '../hooks/useReviewCompletion.ts';
import { useReviewTime } from '../hooks/useReviewTime.ts';
import { useReviewChanges } from '../hooks/useReviewChanges.ts';
import { useDraftComposer } from '../hooks/useDraftComposer.ts';
import { useDraftPlacement } from '../hooks/useDraftPlacement.ts';
import { Tag } from '../components/Tag/Tag.tsx';
import { useReviewSession } from '../hooks/useReviewSession.ts';
import type { ReviewSession } from '../../shared/contracts/review-sessions.ts';
import { useReviewThreads } from '../hooks/useReviewThreads.ts';
import { useThreadActions } from '../hooks/useThreadActions.ts';
import { useSettings, useUpdateSettings } from '../hooks/useSettings.ts';
import { orderForReview } from '../lib/supportFiles.ts';
import { useReviewShortcuts } from '../hooks/useReviewShortcuts.ts';
import { defaultSettings } from '../../shared/contracts/settings.ts';
import { reviewShortcutLabel } from '../lib/reviewShortcuts.ts';
import { isMac } from '../lib/platform.ts';
import { collapseReason } from '../lib/collapsedFile.ts';
import styles from './review.module.css';

export const Route = createFileRoute('/review/$pullRequestId')({ component: ReviewPage });

const noReviewStates: Record<string, FileReviewState> = {};

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
  const { data: agentTasks } = useAgentTasks();
  // Tasks come newest first.
  const agentTask = agentTasks?.find((task) => task.pullRequestId === pullRequestId);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [agentReviewOpen, setAgentReviewOpen] = useState(false);
  const [findingsOpen, setFindingsOpen] = useState(false);
  const repository = repositoryState?.repositories.find(
    (item) => item.id === pullRequest?.repositoryId,
  );
  // The account this repository's reviews go out as.
  const reviewer = findAccount(auth, repository?.account?.login);

  const {
    files,
    commits,
    rounds,
    round,
    baselineSha,
    chosenView,
    setChosenView,
    view,
    browsing,
    setBrowsing,
    repositoryFiles,
    readOnlyView,
    shown,
    newCommits,
    showNewCommits,
  } = useReviewChanges(pullRequestId, pullRequest);
  const changedFiles = shown.data?.files;
  const reviewSession = useReviewSession(pullRequestId);
  useReviewTime(pullRequestId);
  // Undefined until the saved session is read, then null when there was none.
  const [restored, setRestored] = useState<ReviewSession | null>();
  // The saved scroll position, until the reviewer picks another file.
  const [restoredScroll, setRestoredScroll] = useState<{ path: string; top: number }>();
  const [chosenPath, setChosenPath] = useState<string>();
  const [fileFilter, setFileFilter] = useState<FileReviewFilter>('all');
  const [fileSearch, setFileSearch] = useState('');
  const search = useFileSearch(pullRequestId, shown.data, fileSearch);
  const searchTerm = fileSearch.trim().toLowerCase();
  const { reviewStates: markedStates, setReviewState } = useFileReviewStates(
    pullRequestId,
    files.data,
  );
  const reviewStates = readOnlyView ? noReviewStates : markedStates;
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const groupSupport = settings?.groupSupportFiles ?? defaultSettings.groupSupportFiles;
  const [supportOpen, setSupportOpen] = useState(false);
  const listedFiles = changedFiles?.filter(
    (file) =>
      matchesFileReviewFilter(reviewStates[file.path], fileFilter) &&
      (!searchTerm || matchesFilePath(file, searchTerm) || search.matches.has(file.path)),
  );
  // The files in the order the list shows them, so next and previous follow it. A collapsed
  // group of tests and generated files is skipped.
  const visibleFiles = listedFiles && orderForReview(listedFiles, groupSupport, supportOpen);
  const reviewFindings = useReviewFindings(pullRequestId);
  const queuedReview = useQueuedReview(pullRequestId).data;
  const { finish: finishReview } = useReviewCompletion(pullRequestId);
  const roundFinished = round?.finishedAt != null;
  const findings = reviewFindings.findings.data ?? [];
  const openFindings = findings.filter((finding) => finding.resolution === 'open').length;
  const reviewThreads = useReviewThreads(pullRequestId, files.data?.headSha);
  const threadActions = useThreadActions(pullRequestId);
  // A failure to reach GitHub reads like a refusal, so the thread shows it in place.
  const unreachable = {
    status: 'rejected',
    message: 'Could not reach GitHub. Try again.',
  } as const;
  const { reviewDrafts, currentDrafts, sendableDrafts } = useDraftPlacement(
    pullRequestId,
    files.data,
    changedFiles,
  );
  const [mode, setMode] = useState<DiffMode>('split');
  if (restored === undefined && reviewSession.session.isFetched) {
    const saved = reviewSession.session.data ?? null;
    setRestored(saved);
    if (saved?.selectedPath) {
      setChosenPath(saved.selectedPath);
      setRestoredScroll({ path: saved.selectedPath, top: saved.scrollTop });
    }
    if (saved) setMode(saved.diffMode);
    if (saved?.view) setChosenView(saved.view);
  }
  const [lineNumberOffset, setLineNumberOffset] = useState(52);
  const {
    collapsed: sidebarCollapsed,
    setCollapsed: setSidebarCollapsed,
    filesCollapsed,
    setFilesCollapsed,
    zen,
    toggleZen,
  } = useSidebar();
  const leader = settings?.reviewLeader ?? defaultSettings.reviewLeader;
  const shortcut = (key: string) => reviewShortcutLabel(leader, key, isMac);
  const diffViewer = useRef<DiffViewerHandle>(null);
  // The toggle moves to the other panel, so it is a new element and takes focus back after a click.
  const refocusFilesToggle = useRef(false);
  useEffect(() => {
    if (!refocusFilesToggle.current) return;
    refocusFilesToggle.current = false;
    document.getElementById('review-files-toggle')?.focus();
  }, [filesCollapsed]);
  const initialSidebarCollapsed = useRef(sidebarCollapsed);

  useEffect(() => {
    const wasCollapsed = initialSidebarCollapsed.current;
    setSidebarCollapsed(false);
    setFilesCollapsed(false);
    return () => setSidebarCollapsed(wasCollapsed);
  }, [setSidebarCollapsed, setFilesCollapsed]);

  // The unified layout opens the panels, as choosing it does.
  const restoredUnified = restored?.diffMode === 'unified';
  useEffect(() => {
    if (!restoredUnified) return;
    setFilesCollapsed(false);
    setSidebarCollapsed(false);
  }, [restoredUnified, setSidebarCollapsed, setFilesCollapsed]);

  function changeMode(next: DiffMode) {
    setMode(next);
    setFilesCollapsed(next === 'split');
    setSidebarCollapsed(next === 'split');
  }
  const changedSelection =
    restored === undefined
      ? undefined
      : (visibleFiles?.find((file) => file.path === chosenPath) ?? visibleFiles?.[0]);
  const browsedFile: PullRequestFile | undefined =
    browsing && chosenPath !== undefined
      ? (files.data?.files.find((file) => file.path === chosenPath) ?? {
          path: chosenPath,
          blobSha: '',
          previousPath: null,
          status: 'modified',
          additions: 0,
          deletions: 0,
          hunks: null,
        })
      : undefined;
  const selected = browsing ? browsedFile : changedSelection;
  // A file the pull request leaves alone is the same on both sides, so one side is enough.
  const unchanged =
    browsedFile !== undefined && !files.data?.files.some((file) => file.path === browsedFile.path);
  const selectedIndex = visibleFiles?.findIndex((file) => file.path === selected?.path) ?? -1;
  const previousFile = visibleFiles?.[selectedIndex - 1];
  const nextFile = selectedIndex >= 0 ? visibleFiles?.[selectedIndex + 1] : undefined;
  const reviewState = selected ? reviewStates[selected.path] : undefined;

  function selectFile(path: string) {
    setChosenPath(path);
    setRestoredScroll(undefined);
  }

  const selectedPath = selected?.path;
  const initialScrollTop =
    restoredScroll && restoredScroll.path === selectedPath ? restoredScroll.top : 0;
  const saveSession = reviewSession.save;
  const sessionReady = restored !== undefined;
  // Only a new file or layout is saved here. Scrolling saves itself.
  const saveSelection = useEffectEvent((path: string) =>
    saveSession({
      selectedPath: path,
      scrollTop: initialScrollTop,
      diffMode: mode,
      view: chosenView ?? null,
    }),
  );
  useEffect(() => {
    if (sessionReady && selectedPath !== undefined) saveSelection(selectedPath);
  }, [sessionReady, selectedPath, mode, chosenView]);

  function toggleReviewState(state: FileReviewState) {
    if (!selected || readOnlyView) return;
    const nextState = reviewState === state ? undefined : state;
    setReviewState(selected.path, nextState);
    if (nextState && nextFile) selectFile(nextFile.path);
  }

  useReviewShortcuts(
    leader,
    {
      approve: () => toggleReviewState('approved'),
      flag: () => toggleReviewState('flagged'),
      comment: () => diffViewer.current?.commentOnSelection(),
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

  // The match of a text search of the repository that is open, so the diff shows its line.
  const [repositoryMatch, setRepositoryMatch] = useState<{
    match: RepositorySearchMatch;
    query: string;
  }>();
  const openMatch = repositoryMatch?.match.path === selected?.path ? repositoryMatch : undefined;
  const openMatchInFile = useMemo<FileSearchMatch | undefined>(
    () =>
      openMatch && {
        side: 'modified',
        line: openMatch.match.line,
        preview: openMatch.match.preview,
      },
    [openMatch],
  );

  const unifiedOnly = selected?.status === 'added' || unchanged;
  const effectiveMode = unifiedOnly ? 'unified' : mode;
  // Generated and large files wait for the reviewer, so their diffs are not read before then.
  const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(new Set());
  const collapsedReason =
    selected && !expandedPaths.has(selected.path) ? collapseReason(selected) : undefined;
  const diff = usePullRequestFileDiff(
    pullRequestId,
    browsing ? files.data : shown.data,
    collapsedReason ? undefined : selected?.path,
    selected?.previousPath ?? null,
  );

  const { composer, changeComposer, saveComposer } = useDraftComposer(
    pullRequestId,
    files.data,
    reviewDrafts,
    selectFile,
  );

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
  if (collapsedReason) diffMessage = undefined;
  else if (diff.isPending && selected) diffMessage = 'Loading the file…';
  else if (diff.isError) diffMessage = 'Could not load the file. Try again later.';
  else if (diff.data?.unavailable === 'binary') diffMessage = 'This file is binary.';
  else if (diff.data?.unavailable === 'too-large') diffMessage = 'This file is too large to show.';
  else if (!selected && !shown.isPending && restored !== undefined)
    diffMessage = search.searching
      ? 'Searching file contents…'
      : searchTerm
        ? 'No files match this search and filter.'
        : fileFilter === 'all'
          ? 'There are no files to show.'
          : 'No files match this filter.';

  // Open, the toggle sits inside the files panel. Closed, it sits inside the review panel.
  const filesToggle = (
    <IconButton
      id="review-files-toggle"
      className={cx(styles.treeToggle, filesCollapsed && styles.treeToggleClosed)}
      variant="plain"
      size="sm"
      icon={filesCollapsed ? <ChevronRight /> : <ChevronLeft />}
      label={filesCollapsed ? 'Expand changed files' : 'Collapse changed files'}
      shortcut={shortcut('t')}
      aria-expanded={!filesCollapsed}
      aria-controls="review-files"
      onClick={() => {
        refocusFilesToggle.current = true;
        setFilesCollapsed((value) => !value);
      }}
    />
  );

  return (
    <div className={cx(styles.page, zen && styles.zen)}>
      <header className={styles.header}>
        <div className={styles.summary}>
          <h1 className={styles.pullRequest} title={pullRequest.title}>
            {repository ? repositoryName(repository) : 'Repository'} #{pullRequest.number}
          </h1>
          <StatusPill status={pullRequest.draft ? 'draft' : 'open'} />
          <StatusPill status={pullRequest.reviewState} />
          {round && <Tag size="sm">Round {round.number}</Tag>}
          <span className={styles.branches}>
            {pullRequest.headBranch} → {pullRequest.baseBranch}
          </span>
          <span className={styles.author}>
            <Avatar name={author?.login ?? 'Unknown author'} src={author?.avatarUrl} size="xs" />
            Opened {relativeTime(pullRequest.createdAt)} by {author?.login ?? 'an unknown author'}
          </span>
        </div>
        <div className={styles.headerActions}>
          {agentTask && <StatusPill status={agentStatus[agentTask.status]} />}
          {queuedReview && (
            <span role="status" className={styles.queued}>
              Review waiting to send
            </span>
          )}
          <span role="status" className={styles.newCommits}>
            {newCommits && 'New commits'}
          </span>
          {newCommits && (
            <Button size="sm" iconStart={<RefreshCw aria-hidden />} onClick={showNewCommits}>
              Show new commits
            </Button>
          )}
          <Button
            size="sm"
            iconStart={<ListChecks aria-hidden />}
            iconEnd={openFindings > 0 ? <Count value={openFindings} /> : undefined}
            aria-label={`Findings, ${openFindings} open`}
            onClick={() => setFindingsOpen(true)}
          >
            Findings
          </Button>
          <Button
            size="sm"
            iconStart={<CheckCheck aria-hidden />}
            disabled={rounds.isPending || roundFinished}
            loading={finishReview.isPending}
            onClick={() => finishReview.mutate()}
          >
            {roundFinished ? 'Review finished' : 'Finish review'}
          </Button>
          <Button size="sm" disabled={!files.data} onClick={() => setAgentReviewOpen(true)}>
            Submit to Agent
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!files.data}
            onClick={() => setReviewOpen(true)}
          >
            Submit review
          </Button>
        </div>
      </header>
      <FindingsDialog
        open={findingsOpen}
        onOpenChange={setFindingsOpen}
        findings={findings}
        onSave={({ id, ...finding }) =>
          id === undefined
            ? reviewFindings.create.mutateAsync({ pullRequestId, ...finding })
            : reviewFindings.update.mutateAsync({ pullRequestId, id, ...finding })
        }
        onSetResolution={(id, resolution) =>
          reviewFindings.setResolution.mutateAsync({ pullRequestId, id, resolution })
        }
        onDelete={(id) => reviewFindings.remove.mutateAsync(id)}
      />
      {files.data && (
        <>
          <AgentReviewDialog
            open={agentReviewOpen}
            onOpenChange={setAgentReviewOpen}
            pullRequestId={pullRequestId}
            headSha={files.data.headSha}
            mergeBase={files.data.mergeBase}
            draftIds={sendableDrafts.map((draft) => draft.id)}
            draftsOutsideDiff={(currentDrafts?.length ?? 0) - sendableDrafts.length}
            findingIds={findings
              .filter((finding) => finding.publishedAt === null)
              .map((finding) => finding.id)}
            openThreads={reviewThreads.data?.filter((thread) => !thread.resolved).length ?? 0}
            onDone={() => void navigate({ to: '/inbox' })}
          />
          <ReviewDialog
            open={reviewOpen}
            onOpenChange={setReviewOpen}
            pullRequestId={pullRequestId}
            pullRequestUrl={pullRequest.url}
            headSha={files.data.headSha}
            mergeBase={files.data.mergeBase}
            draftIds={sendableDrafts.map((draft) => draft.id)}
            draftsOutsideDiff={(currentDrafts?.length ?? 0) - sendableDrafts.length}
            findingIds={findings
              .filter((finding) => finding.publishedAt === null)
              .map((finding) => finding.id)}
            ownPullRequest={
              reviewer !== undefined &&
              reviewer.login.toLowerCase() === pullRequest.author?.login.toLowerCase()
            }
            agentTask={agentTask}
            onDone={({ merged }) =>
              void navigate(
                merged
                  ? {
                      to: '/post-merge/$pullRequestId',
                      params: { pullRequestId: String(pullRequestId) },
                    }
                  : { to: '/inbox' },
              )
            }
          />
        </>
      )}
      <div className={cx(styles.workspace, filesCollapsed && styles.filesCollapsed)}>
        <div
          className={styles.filesSlot}
          inert={filesCollapsed}
          aria-hidden={filesCollapsed || undefined}
        >
          {!filesCollapsed && filesToggle}
          {browsing ? (
            <RepositoryFiles
              id="review-files"
              className={styles.files}
              paths={repositoryFiles.data?.paths}
              truncated={repositoryFiles.data?.truncated ?? false}
              error={repositoryFiles.isError}
              selectedPath={selected?.path}
              onSelect={selectFile}
              pullRequestId={pullRequestId}
              headSha={files.data?.headSha}
              selectedMatch={openMatch?.match}
              onSelectMatch={(match, query) => {
                selectFile(match.path);
                setRepositoryMatch({ match, query });
              }}
              onBrowseChange={setBrowsing}
            />
          ) : (
            <ChangedFiles
              id="review-files"
              className={styles.files}
              files={listedFiles}
              groupSupport={groupSupport}
              onGroupSupportChange={(grouped) =>
                updateSettings.mutate({ groupSupportFiles: grouped })
              }
              supportOpen={supportOpen}
              onSupportOpenChange={setSupportOpen}
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
              commits={commits.data}
              hasLastReview={baselineSha !== undefined}
              commitSha={view === 'all' ? undefined : view}
              onCommitChange={(sha) => setChosenView(sha ?? 'all')}
              loading={shown.isPending}
              error={shown.isError}
              selectedPath={selected?.path}
              onSelect={selectFile}
              onBrowseChange={setBrowsing}
            />
          )}
        </div>
        <Panel className={styles.diff} padding="sm" aria-labelledby="review-file-title">
          {filesCollapsed && filesToggle}
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
                disabled={!selected || readOnlyView}
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
                disabled={!selected || readOnlyView}
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
                  disabled: unifiedOnly && option.value === 'split',
                }))}
                value={effectiveMode}
                onValueChange={changeMode}
              />
            </div>
          </header>
          {collapsedReason && selected ? (
            <div className={styles.collapsed}>
              <p className={styles.message}>
                {collapsedReason === 'generated'
                  ? 'This file looks generated, so its diff is collapsed.'
                  : 'This diff is large, so it is collapsed.'}
              </p>
              <Button
                size="sm"
                onClick={() => setExpandedPaths((paths) => new Set(paths).add(selected.path))}
              >
                Show diff
              </Button>
            </div>
          ) : diffMessage ? (
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
                initialScrollTop={initialScrollTop}
                onScrollChange={(scrollTop) =>
                  saveSession({ selectedPath: selected.path, scrollTop })
                }
                searchQuery={browsing ? (openMatch?.query ?? '') : fileSearch.trim()}
                searchMatch={
                  browsing
                    ? openMatchInFile
                    : selected
                      ? search.matches.get(selected.path)
                      : undefined
                }
                threads={
                  readOnlyView
                    ? undefined
                    : {
                        items:
                          reviewThreads.data?.filter((thread) => thread.path === selected.path) ??
                          [],
                        actions: {
                          onReply: (threadId, body) =>
                            threadActions.reply
                              .mutateAsync({ threadId, body })
                              .catch(() => unreachable),
                          onSetResolved: (threadId, resolved) =>
                            threadActions.setResolved
                              .mutateAsync({ threadId, resolved })
                              .catch(() => unreachable),
                        },
                      }
                }
                drafts={
                  readOnlyView
                    ? undefined
                    : {
                        items: currentDrafts?.filter((draft) => draft.path === selected.path) ?? [],
                        hunks: selected.hunks,
                        author: reviewer
                          ? { name: reviewer.login, avatarUrl: reviewer.avatarUrl }
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
                      }
                }
              />
            ))
          )}
        </Panel>
      </div>
    </div>
  );
}
