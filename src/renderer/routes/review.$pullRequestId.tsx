import { FileTreeResizeHandle } from '../app/FileTreeResizeHandle.tsx';
import { useTour } from '../hooks/useTour.ts';
import { TourGuide, TourPlanning } from '../app/Tour.tsx';
import type { TourStop, TourDepth, TourProvider } from '../../shared/contracts/tours.ts';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Flag,
  Maximize2,
  Minimize2,
  PanelRight,
  RefreshCw,
  Route as TourIcon,
} from 'lucide-react';
import { useEffect, useEffectEvent, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useSidebar } from '../app/SidebarContext.ts';
import { IconButton } from '../components/IconButton/IconButton.tsx';
import { cx } from '../lib/cx.ts';
import { ChangedFiles } from '../app/ChangedFiles.tsx';
import { ClosePullRequestDialog } from '../app/ClosePullRequestDialog.tsx';
import { FinishReviewMenu } from '../app/FinishReviewMenu.tsx';
import type { ReviewVerdict } from '../../shared/contracts/pull-request-reviews.ts';
import type { PullRequestFile } from '../../shared/contracts/pull-request-files.ts';
import type { RepositorySearchMatch } from '../../shared/contracts/repository-search.ts';
import { RepositoryFiles } from '../app/RepositoryFiles.tsx';
import { ImageDiff } from '../app/ImageDiff.tsx';
import { DiffViewer, type DiffMode, type DiffViewerHandle } from '../app/DiffViewer.tsx';
import { relativeTime } from '../app/relativeTime.ts';
import { repositoryName } from '../app/repositoryName.ts';
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
import { agentIsBusy, agentMergeWarning, agentStatus } from '../app/agentStatus.ts';
import { AgentReviewDialog } from '../app/AgentReviewDialog.tsx';
import { ReviewDialog } from '../app/ReviewDialog.tsx';
import { ReviewSidePanel } from '../app/ReviewSidePanel.tsx';
import { FindingsDialog } from '../app/FindingsDialog.tsx';
import { PullRequestDetailsDialog } from '../app/PullRequestDetailsDialog.tsx';
import { loadFindingScreenshot, useReviewFindings } from '../hooks/useReviewFindings.ts';
import { useQueuedReview } from '../hooks/useQueuedReview.ts';
import { useReviewCompletion } from '../hooks/useReviewCompletion.ts';
import { useReviewTime } from '../hooks/useReviewTime.ts';
import { useReviewChanges } from '../hooks/useReviewChanges.ts';
import { useDraftComposer } from '../hooks/useDraftComposer.ts';
import { useDraftPlacement } from '../hooks/useDraftPlacement.ts';
import { useReviewSession } from '../hooks/useReviewSession.ts';
import type { ReviewSession } from '../../shared/contracts/review-sessions.ts';
import { useReviewThreads } from '../hooks/useReviewThreads.ts';
import { useThreadActions } from '../hooks/useThreadActions.ts';
import { useSettings } from '../hooks/useSettings.ts';
import { orderForReview } from '../lib/supportFiles.ts';
import { useReviewShortcuts } from '../hooks/useReviewShortcuts.ts';
import { defaultSettings, type ReviewAction } from '../../shared/contracts/settings.ts';
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
  const { data: agentTasks, isPending: agentsLoading, isError: agentsError } = useAgentTasks();
  // Tasks come newest first.
  const agentTask = agentTasks?.find((task) => task.pullRequestId === pullRequestId);
  const [filesWidth, setFilesWidth] = useState(300);
  const [resizingFiles, setResizingFiles] = useState(false);
  const [tourLayout, setTourLayout] = useState<'split' | 'stacked'>('stacked');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [agentReviewOpen, setAgentReviewOpen] = useState(false);
  const [findingsOpen, setFindingsOpen] = useState(false);
  const [findingSelection, setFindingSelection] = useState<number | 'new'>();
  const [sidePanelOpen, setSidePanelOpen] = useState(
    () => matchMedia('(min-width: 1400px)').matches,
  );
  function openFinding(selection?: number | 'new') {
    setFindingSelection(selection);
    setFindingsOpen(true);
  }
  const [closeOpen, setCloseOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [chosenVerdict, setChosenVerdict] = useState<ReviewVerdict>('approve');
  const openReviewDialog = (verdict: ReviewVerdict) => {
    setChosenVerdict(verdict);
    setReviewOpen(true);
  };
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
  const groupSupport = settings?.groupSupportFiles ?? defaultSettings.groupSupportFiles;
  const [supportOpen, setSupportOpen] = useState(false);
  const listedFiles = changedFiles?.filter(
    (file) =>
      matchesFileReviewFilter(reviewStates[file.path], fileFilter) &&
      (!searchTerm || matchesFilePath(file, searchTerm) || search.matches.has(file.path)),
  );
  // The files in the order the list shows them, so next and previous follow it. A collapsed
  // group of tests and generated files is skipped.
  const tour = useTour(
    files.data
      ? {
          pullRequestId,
          headSha: files.data.headSha,
          mergeBase: files.data.mergeBase,
        }
      : undefined,
  );
  const tourPaths = useMemo(
    () => (tour.open && view === 'all' ? tour.tour?.stops.map((stop) => stop.file) : undefined),
    [tour.open, tour.tour, view],
  );
  const visibleFiles =
    listedFiles && orderForReview(listedFiles, groupSupport, supportOpen, tourPaths);
  const reviewFindings = useReviewFindings(pullRequestId);
  const refreshFindings = reviewFindings.findings.refetch;
  useEffect(() => {
    if (agentTask?.status === 'completed') void refreshFindings();
  }, [agentTask?.id, agentTask?.status, agentTask?.finishedAt, refreshFindings]);
  const queuedReview = useQueuedReview(pullRequestId).data;
  const { finish: finishReview } = useReviewCompletion(pullRequestId);
  const roundFinished = round?.finishedAt != null;
  const findings = reviewFindings.findings.data ?? [];
  const unpublishedFindings = findings.filter((finding) => finding.publishedAt === null);
  const reviewThreads = useReviewThreads(pullRequestId, files.data?.headSha);
  // The discussions an agent reads. It skips outdated ones, since their code has changed.
  const openThreads =
    reviewThreads.data?.filter((thread) => !thread.resolved && !thread.outdated).length ?? 0;
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
  const reviewKeys = settings?.reviewKeys ?? defaultSettings.reviewKeys;
  const shortcut = (action: ReviewAction) => reviewShortcutLabel(leader, reviewKeys[action], isMac);
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

  const tourStop = tour.open ? tour.tour?.stops[tour.index] : undefined;
  const [tourVisit, setTourVisit] = useState(0);

  function visitTourStop(stop: TourStop) {
    setChosenView('all');
    setBrowsing(false);
    setFileFilter('all');
    setFileSearch('');
    setExpandedPaths((paths) => new Set(paths).add(stop.file));
    selectFile(stop.file);
    setTourVisit((visit) => visit + 1);
  }

  function startTour() {
    saveOpenComment(() => {
      void tour.prepare();
    });
  }

  function planTour(depth: TourDepth, provider: TourProvider, resumeId?: number) {
    void tour.start(visitTourStop, depth, provider, resumeId);
  }

  function stepTour(index: number) {
    const stop = tour.tour?.stops[index];
    if (!stop) return;
    saveOpenComment(() => {
      tour.setIndex(index);
      visitTourStop(stop);
    });
  }

  function selectTourFile(path: string) {
    const firstStop = tourPaths
      ? tour.tour?.stops.findIndex((stop) => stop.file === path)
      : undefined;
    if (firstStop !== undefined && firstStop >= 0) stepTour(firstStop);
    else selectFile(path);
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
    reviewKeys,
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
    tour.open ? tour.close : zen ? toggleZen : undefined,
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

  const { composer, changeComposer, saveComposer, saveOpenComment } = useDraftComposer(
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
      shortcut={shortcut('tree')}
      aria-expanded={!filesCollapsed}
      aria-controls="review-files"
      onClick={() => {
        refocusFilesToggle.current = true;
        setFilesCollapsed((value) => !value);
      }}
    />
  );

  const agentBusy = agentIsBusy(agentTask);
  const ownPullRequest =
    reviewer !== undefined &&
    reviewer.login.toLowerCase() === pullRequest.author?.login.toLowerCase();

  return (
    <div className={cx(styles.page, zen && styles.zen)}>
      <header className={styles.header}>
        <div className={styles.summary}>
          <div className={styles.titleRow}>
            <h1 className={styles.pullRequest} title={pullRequest.title}>
              {repository ? repositoryName(repository) : 'Repository'} #{pullRequest.number}
            </h1>
            <StatusPill status={pullRequest.draft ? 'draft' : 'open'} />
          </div>
          <p className={styles.details}>
            <span className={styles.branches}>
              {pullRequest.headBranch} → {pullRequest.baseBranch}
            </span>
            {round && ` · Round ${round.number}`} · Opened {relativeTime(pullRequest.createdAt)} by{' '}
            {author?.login ?? 'an unknown author'}
          </p>
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
            iconStart={<TourIcon aria-hidden />}
            disabled={!files.data || tour.planning}
            selected={tour.open}
            aria-keyshortcuts={tour.open ? 'Escape' : undefined}
            title={tour.open ? 'Exit tour (Esc)' : undefined}
            onClick={tour.open ? tour.close : startTour}
          >
            {tour.open ? 'Exit tour' : 'Start tour'}
          </Button>
          <Button
            size="sm"
            iconStart={<FileText aria-hidden />}
            onClick={() => setDetailsOpen(true)}
          >
            Details
          </Button>
          {!zen && !tour.open && (
            <IconButton
              size="sm"
              icon={<PanelRight />}
              label={sidePanelOpen ? 'Hide agent and findings' : 'Show agent and findings'}
              aria-expanded={sidePanelOpen}
              aria-controls="review-side-panel"
              selected={sidePanelOpen}
              onClick={() => setSidePanelOpen((open) => !open)}
            />
          )}
          <FinishReviewMenu
            roundNumber={round?.number}
            filesApproved={
              files.data?.files.filter((file) => markedStates[file.path] === 'approved').length ?? 0
            }
            filesTotal={files.data?.files.length ?? 0}
            draftCount={sendableDrafts.length}
            findingCount={unpublishedFindings.length}
            openThreads={openThreads}
            ownPullRequest={ownPullRequest}
            canSubmit={files.data !== undefined}
            agentBusy={agentBusy}
            mergeWarning={agentMergeWarning(agentTask)}
            roundFinished={roundFinished}
            canFinish={!rounds.isPending && !roundFinished && !finishReview.isPending}
            onVerdict={(verdict) => saveOpenComment(() => openReviewDialog(verdict))}
            onMerge={() => saveOpenComment(() => openReviewDialog('comment'))}
            onSendToAgent={() => saveOpenComment(() => setAgentReviewOpen(true))}
            onFinish={() => finishReview.mutate()}
            onClose={() => setCloseOpen(true)}
          />
        </div>
      </header>
      <PullRequestDetailsDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        pullRequest={pullRequest}
      />
      {findingsOpen && (
        <FindingsDialog
          initialSelection={findingSelection}
          open={findingsOpen}
          onOpenChange={setFindingsOpen}
          findings={findings}
          loadScreenshot={loadFindingScreenshot}
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
      )}
      <ClosePullRequestDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        pullRequestId={pullRequestId}
        number={pullRequest.number}
        agentBusy={agentBusy}
        onClosed={() => void navigate({ to: '/inbox' })}
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
            findingIds={unpublishedFindings.map((finding) => finding.id)}
            openThreads={openThreads}
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
            findingIds={unpublishedFindings.map((finding) => finding.id)}
            chosenVerdict={chosenVerdict}
            onVerdictChange={setChosenVerdict}
            ownPullRequest={ownPullRequest}
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
      {tour.open && !tour.tour ? (
        <TourPlanning state={tour} onRetry={startTour} onContinue={planTour} />
      ) : (
        <div
          className={cx(
            styles.workspace,
            resizingFiles && styles.resizing,
            filesCollapsed && styles.filesCollapsed,
            sidePanelOpen && !zen && !tour.open && styles.withSidePanel,
          )}
          style={{ '--files-width': `${filesWidth}px` } as CSSProperties}
        >
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
                tourPaths={tourPaths}
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
                onSelect={selectTourFile}
                onBrowseChange={setBrowsing}
              />
            )}
            {!filesCollapsed && (
              <FileTreeResizeHandle
                width={filesWidth}
                onResize={setFilesWidth}
                onDraggingChange={setResizingFiles}
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
                  shortcut={shortcut('previous')}
                  disabled={!previousFile}
                  onClick={() => previousFile && selectFile(previousFile.path)}
                />
                <IconButton
                  variant="plain"
                  size="sm"
                  icon={<ArrowRight />}
                  label="Next file"
                  shortcut={shortcut('next')}
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
                  shortcut={shortcut('approve')}
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
                  shortcut={shortcut('flag')}
                  selected={reviewState === 'flagged'}
                  disabled={!selected || readOnlyView}
                  onClick={() => toggleReviewState('flagged')}
                />
                <IconButton
                  variant="plain"
                  size="sm"
                  icon={zen ? <Minimize2 /> : <Maximize2 />}
                  label={zen ? 'Exit Zen mode' : 'Enter Zen mode'}
                  shortcut={shortcut('zen')}
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
            <div
              className={cx(
                styles.diffContent,
                tourStop && styles.tourContent,
                tourStop && tourLayout === 'split' && styles.tourSplit,
              )}
            >
              {tourStop && (
                <TourGuide
                  state={tour}
                  layout={tourLayout}
                  onLayoutChange={setTourLayout}
                  atStop={selected?.path === tourStop.file && !readOnlyView}
                  onStep={stepTour}
                />
              )}
              <div className={styles.diffBody}>
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
                      tourRange={
                        tourStop && selected.path === tourStop.file && !readOnlyView
                          ? {
                              start: tourStop.start,
                              end: tourStop.end,
                              side: selected.status === 'removed' ? 'original' : 'modified',
                              visit: tourVisit,
                            }
                          : undefined
                      }
                      fontSize={settings?.diffFontSize}
                      wordWrap={settings?.diffWordWrap}
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
                                reviewThreads.data?.filter(
                                  (thread) => thread.path === selected.path,
                                ) ?? [],
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
                              items:
                                currentDrafts?.filter((draft) => draft.path === selected.path) ??
                                [],
                              hunks: selected.hunks,
                              author: reviewer
                                ? { name: reviewer.login, avatarUrl: reviewer.avatarUrl }
                                : { name: 'You' },
                              composer: composer?.path === selected.path ? composer : undefined,
                              onComposerChange: changeComposer,
                              onSave: () => saveComposer(),
                              saving:
                                reviewDrafts.create.isPending || reviewDrafts.update.isPending,
                              saveFailed:
                                reviewDrafts.create.isError || reviewDrafts.update.isError,
                              onDelete: (id) => reviewDrafts.remove.mutate(id),
                              deletingId: reviewDrafts.remove.isPending
                                ? reviewDrafts.remove.variables
                                : undefined,
                            }
                      }
                    />
                  ))
                )}
              </div>
            </div>
          </Panel>
          <ReviewSidePanel
            hidden={zen || !sidePanelOpen || tour.open}
            className={styles.sidePanel}
            task={agentTask}
            agentsLoading={agentsLoading}
            agentsError={agentsError}
            findings={findings}
            findingsLoading={reviewFindings.findings.isPending}
            findingsError={reviewFindings.findings.isError}
            onOpenFinding={openFinding}
          />
        </div>
      )}
    </div>
  );
}
