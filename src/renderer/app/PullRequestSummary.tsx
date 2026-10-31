import type { PullRequest } from '../../shared/contracts/pull-requests.ts';
import { Avatar } from '../components/Avatar/Avatar.tsx';
import { Panel } from '../components/Panel/Panel.tsx';
import { StatusPill } from '../components/StatusPill/StatusPill.tsx';
import styles from './PullRequestSummary.module.css';
import { relativeTime } from './relativeTime.ts';

export interface PullRequestSummaryProps {
  pullRequest: PullRequest | undefined;
  repositoryName: string | undefined;
}

export function PullRequestSummary({ pullRequest, repositoryName }: PullRequestSummaryProps) {
  if (!pullRequest) {
    return (
      <Panel title="Summary">
        <p className={styles.empty}>Select a pull request to see its details.</p>
      </Panel>
    );
  }

  const { author } = pullRequest;
  return (
    <Panel
      title={`${repositoryName ?? 'Repository'} #${pullRequest.number}`}
      action={<StatusPill status={pullRequest.draft ? 'draft' : 'open'} />}
    >
      <h3 className="title-2">{pullRequest.title}</h3>
      <div className={styles.author}>
        <Avatar name={author?.login ?? 'Unknown author'} src={author?.avatarUrl} size="sm" />
        <span className={styles.detail}>
          Opened {relativeTime(pullRequest.createdAt)} by {author?.login ?? 'an unknown author'}
          {author?.bot && ' (automated)'}
        </span>
      </div>
      <dl className={styles.facts}>
        <dt>Branch</dt>
        <dd className={styles.mono}>
          {pullRequest.headBranch} → {pullRequest.baseBranch}
        </dd>
        <dt>Updated</dt>
        <dd>{relativeTime(pullRequest.updatedAt)}</dd>
      </dl>
    </Panel>
  );
}
