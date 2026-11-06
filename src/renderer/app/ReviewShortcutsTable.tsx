import { useState, type KeyboardEvent } from 'react';
import {
  defaultSettings,
  type ReviewAction,
  type ReviewKeys,
  type ReviewLeader,
} from '../../shared/contracts/settings.ts';
import { Button } from '../components/Button/Button.tsx';
import {
  changeReviewKey,
  reviewActionLabels,
  reviewShortcutLabel,
} from '../lib/reviewShortcuts.ts';
import styles from './ReviewShortcutsTable.module.css';

export interface ReviewShortcutsTableProps {
  leader: ReviewLeader;
  keys: ReviewKeys;
  mac: boolean;
  disabled: boolean;
  onChange: (keys: ReviewKeys) => void;
}

const MODIFIER_KEYS = ['Control', 'Alt', 'Meta', 'Shift'];

// Lists the review shortcuts. Clicking one waits for the next letter pressed, with or without
// the leader held, until Escape or the button loses focus.
export function ReviewShortcutsTable({
  leader,
  keys,
  mac,
  disabled,
  onChange,
}: ReviewShortcutsTableProps) {
  const [capturing, setCapturing] = useState<ReviewAction>();
  const [error, setError] = useState<string>();
  const isDefault = (Object.keys(keys) as ReviewAction[]).every(
    (action) => keys[action] === defaultSettings.reviewKeys[action],
  );

  function capture(action: ReviewAction, event: KeyboardEvent) {
    if (capturing !== action || event.key === 'Tab' || MODIFIER_KEYS.includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      setCapturing(undefined);
      setError(undefined);
      return;
    }
    const result = changeReviewKey(keys, action, event.code);
    setError(result.error);
    if (result.error !== undefined) return;
    setCapturing(undefined);
    if (result.keys !== keys) onChange(result.keys);
  }

  return (
    <>
      <table className={styles.shortcuts} aria-label="Review keyboard shortcuts">
        <thead>
          <tr>
            <th scope="col">Shortcut</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          {(Object.keys(reviewActionLabels) as ReviewAction[]).map((action) => (
            <tr key={action}>
              <td>
                <Button
                  size="sm"
                  aria-label={`Change shortcut for ${reviewActionLabels[action]}`}
                  disabled={disabled}
                  onClick={() => {
                    setCapturing(action);
                    setError(undefined);
                  }}
                  onBlur={() => {
                    if (capturing === action) setCapturing(undefined);
                  }}
                  onKeyDown={(event) => capture(action, event)}
                >
                  {capturing === action
                    ? 'Press a letter…'
                    : reviewShortcutLabel(leader, keys[action], mac)}
                </Button>
              </td>
              <td>{reviewActionLabels[action]}</td>
            </tr>
          ))}
          <tr>
            <td>J / K</td>
            <td>Scroll code down / up</td>
          </tr>
        </tbody>
      </table>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <Button
          variant="plain"
          disabled={disabled || isDefault}
          onClick={() => {
            setError(undefined);
            onChange(defaultSettings.reviewKeys);
          }}
        >
          Reset Shortcuts
        </Button>
      </div>
    </>
  );
}
