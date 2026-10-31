import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { ChangedFiles } from '../app/ChangedFiles.tsx';
import { DiffViewer, type DiffMode } from '../app/DiffViewer.tsx';
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
  const repository = repositoryState?.repositories.find(
    (item) => item.id === pullRequest?.repositoryId,
  );

  const files = usePullRequestFiles(pullRequestId, pullRequest?.headSha, pullRequest?.baseBranch);
  const changedFiles = files.data?.files;
  const [chosenPath, setChosenPath] = useState<string>();
  const [mode, setMode] = useState<DiffMode>('split');
  const selected = changedFiles?.find((file) => file.path === chosenPath) ?? changedFiles?.[0];
  const diff = usePullRequestFileDiff(
    pullRequestId,
    files.data,
    selected?.path,
    selected?.previousPath ?? null,
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
      <div className={styles.page}>
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
  else if (!selected && !files.isPending) diffMessage = 'There are no files to show.';

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        {back}
        <div className={styles.title}>
          <h1 className="title-1">{pullRequest.title}</h1>
          <StatusPill status={pullRequest.draft ? 'draft' : 'open'} />
        </div>
        <div className={styles.meta}>
          <span>
            {repository ? repositoryName(repository) : 'Repository'} #{pullRequest.number}
          </span>
          <span className={styles.branches}>
            {pullRequest.headBranch} → {pullRequest.baseBranch}
          </span>
          <span className={styles.author}>
            <Avatar name={author?.login ?? 'Unknown author'} src={author?.avatarUrl} size="xs" />
            Opened {relativeTime(pullRequest.createdAt)} by {author?.login ?? 'an unknown author'}
          </span>
        </div>
      </header>
      <div className={styles.workspace}>
        <ChangedFiles
          className={styles.files}
          files={changedFiles}
          loading={files.isPending}
          error={files.isError}
          selectedPath={selected?.path}
          onSelect={setChosenPath}
        />
        <Panel
          className={styles.diff}
          padding="sm"
          title={selected?.path ?? 'Diff'}
          titleAs="h2"
          action={
            <ToggleGroup
              aria-label="Diff layout"
              size="sm"
              options={modeOptions}
              value={mode}
              onValueChange={setMode}
            />
          }
        >
          {diffMessage ? (
            <p className={styles.message}>{diffMessage}</p>
          ) : (
            selected &&
            diff.data && (
              <DiffViewer
                path={selected.path}
                previousPath={selected.previousPath}
                original={diff.data.original}
                modified={diff.data.modified}
                mode={mode}
              />
            )
          )}
        </Panel>
      </div>
    </div>
  );
}
