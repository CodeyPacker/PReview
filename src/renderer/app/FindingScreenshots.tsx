import { CircleAlert, ImagePlus, X } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { MAX_FINDING_SCREENSHOTS } from '../../shared/contracts/review-findings.ts';
import { Button } from '../components/Button/Button.tsx';
import { IconButton } from '../components/IconButton/IconButton.tsx';
import { cx } from '../lib/cx.ts';
import styles from './FindingScreenshots.module.css';

export interface FindingScreenshotsProps {
  savedIds: readonly number[];
  added?: readonly string[];
  loadScreenshot: (id: number) => Promise<string | null>;
  error?: string;
  // Leaving these out shows the screenshots read-only.
  onFiles?: (files: File[]) => void;
  onRemoveSaved?: (id: number) => void;
  onRemoveAdded?: (url: string) => void;
}

function Thumbnail({
  src,
  label,
  onOpen,
  onRemove,
}: {
  src: string | null;
  label: string;
  onOpen: (src: string) => void;
  onRemove?: () => void;
}) {
  return (
    <li className={styles.thumbnail}>
      <button
        type="button"
        className={styles.open}
        aria-label={`Open ${label}`}
        disabled={src === null}
        onClick={() => src && onOpen(src)}
      >
        {src && <img className={styles.image} src={src} alt="" />}
      </button>
      {onRemove && (
        <IconButton
          className={styles.remove}
          type="button"
          variant="secondary"
          size="sm"
          icon={<X aria-hidden />}
          label={`Remove ${label}`}
          onClick={onRemove}
        />
      )}
    </li>
  );
}

function SavedThumbnail({
  id,
  loadScreenshot,
  ...rest
}: {
  id: number;
  loadScreenshot: (id: number) => Promise<string | null>;
  label: string;
  onOpen: (src: string) => void;
  onRemove?: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    void loadScreenshot(id)
      .catch(() => null)
      .then((loaded) => {
        if (current) setSrc(loaded);
      });
    return () => {
      current = false;
    };
  }, [id, loadScreenshot]);
  return <Thumbnail src={src} {...rest} />;
}

// A finding's screenshots, plus a place to drop or choose more when editing.
export function FindingScreenshots({
  savedIds,
  added = [],
  loadScreenshot,
  error,
  onFiles,
  onRemoveSaved,
  onRemoveAdded,
}: FindingScreenshotsProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [expanded, setExpanded] = useState<string>();
  const count = savedIds.length + added.length;

  function drop(event: DragEvent) {
    event.preventDefault();
    setOver(false);
    onFiles?.([...event.dataTransfer.files]);
  }

  return (
    <div className={styles.screenshots}>
      {onFiles && (
        <div
          className={cx(styles.zone, over && styles.over)}
          data-testid="screenshot-drop"
          onDragOver={(event) => {
            event.preventDefault();
            setOver(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
          }}
          onDrop={drop}
        >
          <ImagePlus aria-hidden className={styles.icon} />
          <span className={styles.hint}>
            Drag screenshots here. They stay on this computer, and the agent can see them.
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={count >= MAX_FINDING_SCREENSHOTS}
            onClick={() => input.current?.click()}
          >
            Choose files
          </Button>
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            hidden
            aria-label="Screenshots"
            onChange={(event) => {
              onFiles([...(event.target.files ?? [])]);
              event.target.value = '';
            }}
          />
        </div>
      )}
      {error && (
        <p className={styles.error} role="alert">
          <CircleAlert aria-hidden />
          {error}
        </p>
      )}
      {count > 0 && (
        <ul className={styles.list} aria-label="Attached screenshots">
          {savedIds.map((id, index) => (
            <SavedThumbnail
              key={id}
              id={id}
              loadScreenshot={loadScreenshot}
              label={`screenshot ${index + 1}`}
              onOpen={setExpanded}
              onRemove={
                onRemoveSaved &&
                (() => {
                  setExpanded(undefined);
                  onRemoveSaved(id);
                })
              }
            />
          ))}
          {added.map((url, index) => (
            <Thumbnail
              key={url}
              src={url}
              label={`screenshot ${savedIds.length + index + 1}`}
              onOpen={setExpanded}
              onRemove={
                onRemoveAdded &&
                (() => {
                  setExpanded(undefined);
                  onRemoveAdded(url);
                })
              }
            />
          ))}
        </ul>
      )}
      {expanded && (
        <button
          type="button"
          className={styles.expanded}
          aria-label="Close screenshot"
          onClick={() => setExpanded(undefined)}
        >
          <img className={styles.fullImage} src={expanded} alt="" />
        </button>
      )}
    </div>
  );
}
