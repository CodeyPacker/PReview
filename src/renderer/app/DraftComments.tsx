import { CircleAlert, Pencil, Trash2 } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import type { DiffSide, ReviewDraft } from '../../shared/contracts/review-drafts.ts';
import { Avatar } from '../components/Avatar/Avatar.tsx';
import { Button } from '../components/Button/Button.tsx';
import { Comment } from '../components/Comment/Comment.tsx';
import { IconButton } from '../components/IconButton/IconButton.tsx';
import { StatusPill } from '../components/StatusPill/StatusPill.tsx';
import { TextField } from '../components/TextField/TextField.tsx';
import { isMac } from '../lib/platform.ts';
import styles from './DraftComments.module.css';
import { relativeTime } from './relativeTime.ts';

// The comment being written. draftId is set when it edits a saved draft.
export interface DraftComposerState {
  path: string;
  side: DiffSide;
  // Set when the comment covers several lines. It runs from startLine to line.
  startLine?: number;
  line: number;
  draftId?: number;
  body: string;
}

export interface DraftAuthor {
  name: string;
  avatarUrl?: string;
}

// "new line 3" or "old lines 3–5".
function linesName(side: DiffSide, startLine: number | null | undefined, line: number) {
  const name = side === 'original' ? 'old' : 'new';
  return startLine ? `${name} lines ${startLine}–${line}` : `${name} line ${line}`;
}

export interface DraftComposerProps {
  composer: DraftComposerState;
  onChange: (body: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  failed: boolean;
}

export function DraftComposer({
  composer,
  onChange,
  onSave,
  onCancel,
  saving,
  failed,
}: DraftComposerProps) {
  const canSave = !saving && composer.body.trim() !== '';
  // The zone stops key events from bubbling to Monaco, so these listen while capturing.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && (isMac ? event.metaKey : event.ctrlKey)) {
      event.preventDefault();
      if (canSave) onSave();
    } else if (event.key === 'Escape' && composer.body.trim() === '') {
      event.preventDefault();
      onCancel();
    }
  };
  return (
    <form
      className={styles.composer}
      onKeyDownCapture={onKeyDown}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) onSave();
      }}
    >
      <TextField
        multiline
        rows={3}
        autoFocus
        aria-label={`Comment on ${linesName(composer.side, composer.startLine, composer.line)}`}
        placeholder="Leave a comment"
        value={composer.body}
        onChange={(event) => onChange(event.target.value)}
      />
      <div className={styles.actions}>
        {failed && (
          <p className={styles.error} role="alert">
            <CircleAlert aria-hidden />
            Could not save the draft. Try again.
          </p>
        )}
        <Button variant="plain" tone="neutral" size="sm" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" type="submit" loading={saving} disabled={!canSave}>
          {composer.draftId === undefined ? 'Save Draft' : 'Update Draft'}
        </Button>
      </div>
    </form>
  );
}

export interface DraftCardProps {
  draft: ReviewDraft;
  author: DraftAuthor;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}

export function DraftCard({ draft, author, onEdit, onDelete, deleting }: DraftCardProps) {
  return (
    <Comment
      aria-label={`Draft on ${linesName(draft.side, draft.startLine, draft.line)}`}
      author={author.name}
      avatar={<Avatar name={author.name} src={author.avatarUrl} size="md" />}
      time={relativeTime(draft.updatedAt)}
      status={
        <StatusPill tone="neutral" icon={<Pencil aria-hidden />} size="sm">
          Draft
        </StatusPill>
      }
      actions={
        <>
          <Button variant="plain" tone="neutral" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <IconButton
            variant="plain"
            tone="danger"
            size="sm"
            icon={<Trash2 />}
            label="Delete draft"
            disabled={deleting}
            onClick={onDelete}
          />
        </>
      }
    >
      {draft.body}
    </Comment>
  );
}
