import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import type { ReviewThread } from '../../shared/contracts/pull-request-reviews.ts';
import { Avatar } from '../components/Avatar/Avatar.tsx';
import { Button } from '../components/Button/Button.tsx';
import { Comment } from '../components/Comment/Comment.tsx';
import { StatusPill } from '../components/StatusPill/StatusPill.tsx';
import styles from './ReviewThreads.module.css';
import { relativeTime } from './relativeTime.ts';

export interface ThreadCardProps {
  thread: ReviewThread;
}

// A published thread in the diff. Resolved threads start with their replies hidden, as on
// GitHub.
export function ThreadCard({ thread }: ThreadCardProps) {
  const [expanded, setExpanded] = useState(!thread.resolved);
  const [first, ...replies] = thread.comments;
  if (!first) return null;
  const shown = expanded ? thread.comments : [first];
  const hiddenCount = replies.length;
  const lines = thread.startLine
    ? `lines ${thread.startLine}–${thread.line}`
    : `line ${thread.line}`;
  const state = thread.resolved ? (
    <StatusPill status="resolved" size="sm" />
  ) : thread.outdated ? (
    <StatusPill tone="neutral" size="sm">
      Outdated
    </StatusPill>
  ) : undefined;

  return (
    <section
      className={styles.thread}
      aria-label={`Thread on ${thread.side === 'original' ? 'old' : 'new'} ${lines}`}
    >
      {shown.map((comment, index) => {
        const author = comment.author?.login ?? 'Deleted user';
        const last = index === shown.length - 1;
        return (
          <Comment
            key={comment.id}
            author={author}
            avatar={<Avatar name={author} src={comment.author?.avatarUrl} size="md" />}
            time={relativeTime(comment.createdAt)}
            status={index === 0 ? state : undefined}
            actions={
              last ? (
                <>
                  {thread.resolved && hiddenCount > 0 && (
                    <Button
                      variant="plain"
                      tone="neutral"
                      size="sm"
                      aria-expanded={expanded}
                      onClick={() => setExpanded(!expanded)}
                    >
                      {expanded
                        ? 'Hide replies'
                        : `Show ${hiddenCount} ${hiddenCount === 1 ? 'reply' : 'replies'}`}
                    </Button>
                  )}
                  <Button
                    render={<a href={first.url} target="_blank" rel="noreferrer" />}
                    nativeButton={false}
                    variant="plain"
                    tone="neutral"
                    size="sm"
                    iconEnd={<ExternalLink />}
                  >
                    View on GitHub
                  </Button>
                </>
              ) : undefined
            }
          >
            {comment.body}
          </Comment>
        );
      })}
    </section>
  );
}
