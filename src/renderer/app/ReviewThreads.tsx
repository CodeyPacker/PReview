import { CircleAlert, ExternalLink } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import type {
  ReviewThread,
  ThreadActionResult,
} from '../../shared/contracts/pull-request-reviews.ts';
import { Avatar } from '../components/Avatar/Avatar.tsx';
import { Button } from '../components/Button/Button.tsx';
import { Comment } from '../components/Comment/Comment.tsx';
import { StatusPill } from '../components/StatusPill/StatusPill.tsx';
import { TextField } from '../components/TextField/TextField.tsx';
import { isMac } from '../lib/platform.ts';
import styles from './ReviewThreads.module.css';
import { relativeTime } from './relativeTime.ts';

// Changes to a thread. Each resolves once the change is on GitHub, or says why it isn't.
export interface ThreadActions {
  onReply: (threadId: string, body: string) => Promise<ThreadActionResult>;
  onSetResolved: (threadId: string, resolved: boolean) => Promise<ThreadActionResult>;
}

export interface ThreadCardProps {
  thread: ReviewThread;
  // Leave it out to show the thread without replying or resolving.
  actions?: ThreadActions;
}

// A published thread in the diff. Resolved threads start with their replies hidden, as on
// GitHub.
export function ThreadCard({ thread, actions }: ThreadCardProps) {
  const [expanded, setExpanded] = useState(!thread.resolved);
  // The reply being written. undefined when the reply field is closed.
  const [reply, setReply] = useState<string>();
  const [busy, setBusy] = useState<'reply' | 'resolve'>();
  const [error, setError] = useState<string>();

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

  const run = async (
    kind: 'reply' | 'resolve',
    change: () => Promise<ThreadActionResult>,
    onSaved?: () => void,
  ) => {
    setBusy(kind);
    setError(undefined);
    const result = await change();
    setBusy(undefined);
    if (result.status === 'rejected') setError(result.message);
    else onSaved?.();
  };

  const canSend = busy === undefined && reply !== undefined && reply.trim() !== '';
  const send = () => {
    if (!actions || !canSend) return;
    void run(
      'reply',
      () => actions.onReply(thread.id, reply),
      () => setReply(undefined),
    );
  };
  // The zone stops key events from bubbling to Monaco, so these listen while capturing.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && (isMac ? event.metaKey : event.ctrlKey)) {
      event.preventDefault();
      send();
    } else if (event.key === 'Escape' && reply?.trim() === '') {
      event.preventDefault();
      setReply(undefined);
    }
  };

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
                  {actions && (
                    <>
                      <Button
                        variant="plain"
                        tone="neutral"
                        size="sm"
                        loading={busy === 'resolve'}
                        disabled={busy !== undefined}
                        onClick={() =>
                          void run('resolve', () =>
                            actions.onSetResolved(thread.id, !thread.resolved),
                          )
                        }
                      >
                        {thread.resolved ? 'Reopen' : 'Resolve'}
                      </Button>
                      {reply === undefined && (
                        <Button
                          variant="plain"
                          tone="neutral"
                          size="sm"
                          onClick={() => {
                            setError(undefined);
                            setReply('');
                          }}
                        >
                          Reply
                        </Button>
                      )}
                    </>
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
      {reply !== undefined && (
        <form
          className={styles.composer}
          onKeyDownCapture={onKeyDown}
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <TextField
            multiline
            rows={3}
            autoFocus
            aria-label={`Reply to the thread on ${lines}`}
            placeholder="Write a reply"
            value={reply}
            onChange={(event) => setReply(event.target.value)}
          />
          <div className={styles.composerActions}>
            {error && <ThreadError message={error} />}
            <Button
              variant="plain"
              tone="neutral"
              size="sm"
              type="button"
              onClick={() => setReply(undefined)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              loading={busy === 'reply'}
              disabled={!canSend}
            >
              Reply
            </Button>
          </div>
        </form>
      )}
      {error && reply === undefined && <ThreadError message={error} />}
    </section>
  );
}

function ThreadError({ message }: { message: string }) {
  return (
    <p className={styles.error} role="alert">
      <CircleAlert aria-hidden />
      {message}
    </p>
  );
}
