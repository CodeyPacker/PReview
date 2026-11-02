import { ToggleGroup } from '../components/ToggleGroup/ToggleGroup.tsx';

export interface FileListSwitchProps {
  // Which list is on show.
  browsing: boolean;
  onBrowseChange: (browsing: boolean) => void;
}

// Switches the files panel between the files the pull request changes and the whole repository.
export function FileListSwitch({ browsing, onBrowseChange }: FileListSwitchProps) {
  return (
    <ToggleGroup
      aria-label="File list"
      size="sm"
      block
      value={browsing ? 'repository' : 'changed'}
      onValueChange={(value) => onBrowseChange(value === 'repository')}
      options={[
        { value: 'changed', label: 'Changed' },
        { value: 'repository', label: 'Repository' },
      ]}
    />
  );
}
