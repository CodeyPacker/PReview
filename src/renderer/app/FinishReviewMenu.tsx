import { Menu } from '@base-ui/react/menu';
import {
  Bot,
  CheckCheck,
  ChevronDown,
  CircleCheck,
  CircleX,
  GitMerge,
  GitPullRequestClosed,
  MessageSquare,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { ReviewVerdict } from '../../shared/contracts/pull-request-reviews.ts';
import { Button } from '../components/Button/Button.tsx';
import { ProgressBar } from '../components/ProgressBar/ProgressBar.tsx';
import { cx } from '../lib/cx.ts';
import styles from './FinishReviewMenu.module.css';

export interface FinishReviewMenuProps {
  roundNumber?: number;
  filesApproved: number;
  filesTotal: number;
  // What goes out with a review, and what the agent would work on.
  draftCount: number;
  findingCount: number;
  openThreads: number;
  // GitHub refuses approvals and change requests from a pull request's own author.
  ownPullRequest: boolean;
  // False until the diff has loaded, since a review is published against its commits.
  canSubmit: boolean;
  agentBusy: boolean;
  // Why merging now would leave the agent's work out.
  mergeWarning: string | null;
  roundFinished: boolean;
  canFinish: boolean;
  onVerdict: (verdict: ReviewVerdict) => void;
  onMerge: () => void;
  onSendToAgent: () => void;
  onFinish: () => void;
  onClose: () => void;
}

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function listed(parts: (string | false)[]) {
  return parts.filter(Boolean).join(', ');
}

interface ActionProps {
  icon: ReactNode;
  iconClassName?: string;
  title: string;
  description: string;
  warning?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function Action({
  icon,
  iconClassName,
  title,
  description,
  warning,
  disabled,
  onClick,
}: ActionProps) {
  return (
    <Menu.Item className={styles.action} disabled={disabled} onClick={onClick}>
      <span className={cx(styles.icon, iconClassName)}>{icon}</span>
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        <span className={cx(styles.description, warning && styles.warning)}>{description}</span>
      </span>
    </Menu.Item>
  );
}

// Everything that can end a review, in one place. Most open the dialog for that action.
export function FinishReviewMenu({
  roundNumber,
  filesApproved,
  filesTotal,
  draftCount,
  findingCount,
  openThreads,
  ownPullRequest,
  canSubmit,
  agentBusy,
  mergeWarning,
  roundFinished,
  canFinish,
  onVerdict,
  onMerge,
  onSendToAgent,
  onFinish,
  onClose,
}: FinishReviewMenuProps) {
  const comments = draftCount > 0 && plural(draftCount, 'line comment');
  const findings = findingCount > 0 && plural(findingCount, 'finding');
  const review = listed([comments, findings]);
  const agentWork = listed([
    comments,
    findings,
    openThreads > 0 && plural(openThreads, 'open discussion'),
  ]);

  return (
    <Menu.Root>
      <Menu.Trigger
        render={<Button variant="primary" size="sm" iconEnd={<ChevronDown aria-hidden />} />}
      >
        Finish Review
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className={styles.positioner} align="end" sideOffset={4}>
          <Menu.Popup className={styles.popup}>
            <div className={styles.progress}>
              <div className={styles.progressHead}>
                {roundNumber !== undefined && (
                  <span className={styles.round}>Round {roundNumber}</span>
                )}
                <span className={styles.description}>
                  {filesApproved} of {plural(filesTotal, 'file')} approved
                </span>
              </div>
              <ProgressBar
                value={filesApproved}
                max={Math.max(filesTotal, 1)}
                aria-label="Files approved"
              />
              {review && <p className={styles.description}>Goes with your review: {review}</p>}
            </div>

            <Menu.Group className={styles.group}>
              <Menu.GroupLabel className={styles.label}>Submit to GitHub</Menu.GroupLabel>
              {ownPullRequest ? (
                <Action
                  icon={<GitMerge aria-hidden />}
                  iconClassName={styles.accent}
                  title="Merge Pull Request"
                  description={mergeWarning ?? 'Merge it now. It needs no review from you.'}
                  warning={mergeWarning !== null}
                  disabled={!canSubmit}
                  onClick={onMerge}
                />
              ) : (
                <>
                  <Action
                    icon={<CircleCheck aria-hidden />}
                    iconClassName={styles.success}
                    title="Approve"
                    description="The change is ready to merge."
                    disabled={!canSubmit}
                    onClick={() => onVerdict('approve')}
                  />
                  <Action
                    icon={<CircleX aria-hidden />}
                    iconClassName={styles.warningIcon}
                    title="Request Changes"
                    description="The author has to fix something first."
                    disabled={!canSubmit}
                    onClick={() => onVerdict('request-changes')}
                  />
                </>
              )}
              <Action
                icon={<MessageSquare aria-hidden />}
                iconClassName={styles.info}
                title="Comment"
                description="Share feedback without a verdict."
                disabled={!canSubmit}
                onClick={() => onVerdict('comment')}
              />
              {ownPullRequest && (
                <p className={cx(styles.description, styles.note)}>
                  GitHub doesn’t let you approve or request changes on your own pull request.
                </p>
              )}
            </Menu.Group>

            <Menu.Group className={styles.group}>
              <Menu.GroupLabel className={styles.label}>Hand Off</Menu.GroupLabel>
              <Action
                icon={<Bot aria-hidden />}
                iconClassName={styles.accent}
                title="Send to Agent"
                description={
                  agentBusy
                    ? 'The agent is already working on this.'
                    : agentWork
                      ? `The agent works on ${agentWork}.`
                      : 'Tell the agent what to do.'
                }
                disabled={!canSubmit || agentBusy}
                onClick={onSendToAgent}
              />
            </Menu.Group>

            <div className={styles.group}>
              <Menu.Item className={styles.plain} disabled={!canFinish} onClick={onFinish}>
                <CheckCheck aria-hidden />
                {roundFinished ? 'Review Finished' : 'Finish Without Submitting'}
              </Menu.Item>
              <Menu.Item className={cx(styles.plain, styles.danger)} onClick={onClose}>
                <GitPullRequestClosed aria-hidden />
                Close Pull Request…
              </Menu.Item>
            </div>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
