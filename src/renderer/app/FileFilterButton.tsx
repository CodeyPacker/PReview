import { Menu } from '@base-ui/react/menu';
import { Check, ListFilter } from 'lucide-react';
import { IconButton } from '../components/IconButton/IconButton.tsx';
import type { FileReviewFilter } from '../lib/fileReview.ts';
import styles from './FileFilterButton.module.css';

const options = [
  { value: 'all', label: 'All' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'not-approved', label: 'Unapproved' },
] satisfies { value: FileReviewFilter; label: string }[];

export interface FileFilterButtonProps {
  value: FileReviewFilter;
  onValueChange: (value: FileReviewFilter) => void;
}

// Picks which files the list shows. The button stays highlighted while a filter hides files.
export function FileFilterButton({ value, onValueChange }: FileFilterButtonProps) {
  const chosen = options.find((option) => option.value === value);
  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <IconButton
            size="sm"
            variant={value === 'all' ? 'plain' : 'secondary'}
            tone="neutral"
            icon={<ListFilter aria-hidden />}
            label={value === 'all' ? 'Filter files' : `Filter files: ${chosen?.label}`}
            selected={value !== 'all'}
          />
        }
      />
      <Menu.Portal>
        <Menu.Positioner className={styles.positioner} align="end" sideOffset={4}>
          <Menu.Popup className={styles.popup}>
            <Menu.RadioGroup
              value={value}
              onValueChange={(next: FileReviewFilter) => onValueChange(next)}
            >
              {options.map((option) => (
                <Menu.RadioItem
                  key={option.value}
                  value={option.value}
                  closeOnClick
                  className={styles.item}
                >
                  <span className={styles.check}>
                    <Menu.RadioItemIndicator>
                      <Check aria-hidden />
                    </Menu.RadioItemIndicator>
                  </span>
                  {option.label}
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
