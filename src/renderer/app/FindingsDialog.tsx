import { Dialog } from '@base-ui/react/dialog';
import { CircleAlert, Plus } from 'lucide-react';
import { useState } from 'react';
import {
  findingCategoryLabels,
  findingCategorySchema,
  type FindingCategory,
  type FindingResolution,
  type ReviewFinding,
} from '../../shared/contracts/review-findings.ts';
import { Button } from '../components/Button/Button.tsx';
import { FindingItem } from '../components/FindingItem/FindingItem.tsx';
import { StatusPill } from '../components/StatusPill/StatusPill.tsx';
import { TextField } from '../components/TextField/TextField.tsx';
import { ToggleGroup } from '../components/ToggleGroup/ToggleGroup.tsx';
import styles from './FindingsDialog.module.css';

export interface FindingDraft {
  category: FindingCategory;
  description: string;
  steps: string;
}

export interface FindingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  findings: readonly ReviewFinding[];
  // id is set when it edits a saved finding. Each call rejects when the change failed.
  onSave: (finding: FindingDraft & { id?: number }) => Promise<unknown>;
  onSetResolution: (id: number, resolution: FindingResolution) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
}

const categoryOptions = findingCategorySchema.options.map((value) => ({
  value,
  label: findingCategoryLabels[value],
}));

const emptyDraft: FindingDraft = { category: 'bug', description: '', steps: '' };

// The finding's first line names it in the list.
function title(finding: ReviewFinding) {
  return finding.description.split('\n', 1)[0];
}

// Lists the pull request's findings and adds, edits, resolves and deletes them. Unpublished
// findings go out with the next review. Published ones can only be resolved or reopened,
// because GitHub already has their text.
export function FindingsDialog({
  open,
  onOpenChange,
  findings,
  onSave,
  onSetResolution,
  onDelete,
}: FindingsDialogProps) {
  // 'new' while adding a finding, or the id of the one on show.
  const [selected, setSelected] = useState<'new' | number>();
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState<'save' | 'resolve' | 'delete'>();
  const [failed, setFailed] = useState(false);
  const finding = findings.find((item) => item.id === selected);
  const editing = selected === 'new' || (finding !== undefined && finding.publishedAt === null);

  function show(next: 'new' | ReviewFinding | undefined) {
    setSelected(next === 'new' ? 'new' : next?.id);
    setDraft(next && next !== 'new' ? next : emptyDraft);
    setFailed(false);
  }

  async function run(kind: NonNullable<typeof busy>, change: () => Promise<unknown>) {
    setBusy(kind);
    setFailed(false);
    try {
      await change();
      return true;
    } catch {
      setFailed(true);
      return false;
    } finally {
      setBusy(undefined);
    }
  }

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) show(undefined);
  };

  const error = failed && (
    <p className={styles.error} role="alert">
      <CircleAlert aria-hidden />
      Could not save this change. Try again.
    </p>
  );
  const back = (
    <Button variant="plain" type="button" onClick={() => show(undefined)}>
      Back
    </Button>
  );
  const resolveButton = finding && (
    <Button
      type="button"
      variant={editing ? 'secondary' : 'primary'}
      loading={busy === 'resolve'}
      disabled={busy !== undefined && busy !== 'resolve'}
      onClick={() =>
        void run('resolve', () =>
          onSetResolution(finding.id, finding.resolution === 'open' ? 'resolved' : 'open'),
        )
      }
    >
      {finding.resolution === 'open' ? 'Resolve' : 'Reopen'}
    </Button>
  );

  let content;
  if (editing) {
    const canSave = busy === undefined && draft.description.trim() !== '';
    content = (
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSave) return;
          void run('save', () => onSave({ ...draft, id: finding?.id })).then(
            (saved) => saved && show(undefined),
          );
        }}
      >
        <Dialog.Title className="title-2">{finding ? 'Edit finding' : 'New finding'}</Dialog.Title>
        <ToggleGroup
          aria-label="Category"
          options={categoryOptions}
          value={draft.category}
          onValueChange={(category) => setDraft({ ...draft, category })}
        />
        <TextField
          multiline
          rows={4}
          label="Description"
          value={draft.description}
          onChange={(event) => setDraft({ ...draft, description: event.target.value })}
        />
        <TextField
          multiline
          rows={4}
          label="Steps to reproduce (optional)"
          value={draft.steps}
          onChange={(event) => setDraft({ ...draft, steps: event.target.value })}
        />
        {error}
        <div className={finding ? styles.splitActions : styles.actions}>
          {finding && (
            <Button
              type="button"
              variant="plain"
              tone="danger"
              loading={busy === 'delete'}
              disabled={busy !== undefined && busy !== 'delete'}
              onClick={() =>
                void run('delete', () => onDelete(finding.id)).then(
                  (deleted) => deleted && show(undefined),
                )
              }
            >
              Delete
            </Button>
          )}
          <div className={styles.actions}>
            {back}
            {resolveButton}
            <Button variant="primary" type="submit" loading={busy === 'save'} disabled={!canSave}>
              Save
            </Button>
          </div>
        </div>
      </form>
    );
  } else if (finding) {
    content = (
      <>
        <Dialog.Title className="title-2">
          {findingCategoryLabels[finding.category]} finding
        </Dialog.Title>
        <div className={styles.pills}>
          {finding.validation !== 'pending' && <StatusPill status={finding.validation} size="sm" />}
          <StatusPill
            status={finding.resolution === 'resolved' ? 'resolved' : 'unresolved'}
            size="sm"
            variant={finding.resolution === 'resolved' ? 'soft' : 'outline'}
          />
        </div>
        <p className={styles.text}>{finding.description}</p>
        {finding.steps && (
          <section className={styles.steps}>
            <h3 className={styles.heading}>Steps to reproduce</h3>
            <p className={styles.text}>{finding.steps}</p>
          </section>
        )}
        <Dialog.Description className={styles.description}>
          Published with a review. GitHub has this text, so it can’t be edited.
        </Dialog.Description>
        {error}
        <div className={styles.actions}>
          {back}
          {resolveButton}
        </div>
      </>
    );
  } else {
    const unpublished = findings.filter((item) => item.publishedAt === null).length;
    content = (
      <>
        <Dialog.Title className="title-2">Findings</Dialog.Title>
        <Dialog.Description className={styles.description}>
          Problems that aren’t on a code line. New findings go out with your next review.
          {unpublished > 0 && ` Unpublished: ${unpublished}.`}
        </Dialog.Description>
        {findings.length === 0 ? (
          <p className={styles.description}>No findings yet.</p>
        ) : (
          <ul className={styles.list}>
            {findings.map((item) => (
              <li key={item.id}>
                <FindingItem
                  category={item.category}
                  title={title(item)}
                  meta={`${findingCategoryLabels[item.category]} · ${
                    item.publishedAt === null ? 'Not published' : 'Published'
                  }`}
                  resolution={item.resolution}
                  validation={item.validation}
                  onClick={() => show(item)}
                />
              </li>
            ))}
          </ul>
        )}
        <div className={styles.actions}>
          <Button variant="plain" type="button" onClick={() => close(false)}>
            Close
          </Button>
          <Button variant="primary" iconStart={<Plus aria-hidden />} onClick={() => show('new')}>
            Add finding
          </Button>
        </div>
      </>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={close}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.popup}>{content}</Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
