// ToggleGroup stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Columns2, Rows3 } from 'lucide-react';
import { expect, fn, userEvent } from 'storybook/test';
import { ToggleGroup } from './ToggleGroup.tsx';

const meta = {
  title: 'Components/ToggleGroup',
  component: ToggleGroup,
  args: {
    'aria-label': 'Diff view',
    options: [
      { value: 'split', label: 'Split', icon: <Columns2 aria-hidden /> },
      { value: 'unified', label: 'Unified', icon: <Rows3 aria-hidden /> },
    ],
    onValueChange: fn(),
  },
} satisfies Meta<typeof ToggleGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Track: Story = {};

export const Chips: Story = {
  args: {
    variant: 'chips',
    'aria-label': 'Status',
    options: [
      { value: 'all', label: 'All', count: 24 },
      { value: 'needs-review', label: 'Needs Review', count: 8 },
      { value: 'in-progress', label: 'In Progress', count: 3 },
      { value: 'approved', label: 'Approved', count: 13 },
    ],
  },
};

export const Pills: Story = {
  args: {
    variant: 'pills',
    size: 'sm',
    'aria-label': 'Findings',
    options: ['All', 'Open', 'Resolved'],
  },
};

export const Block: Story = {
  args: { block: true, options: ['Compact', 'Comfortable', 'Spacious'], 'aria-label': 'Density' },
  decorators: [(Story) => <div style={{ width: 400 }}>{Story()}</div>],
};

export const DisabledOption: Story = {
  args: {
    'aria-label': 'Agent work',
    options: [
      { value: 'active', label: 'Active' },
      { value: 'completed', label: 'Completed' },
      { value: 'attention', label: 'Needs Attention', disabled: true },
    ],
  },
};

export const Selects: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole('radio', { name: 'Unified' }));
    await expect(canvas.getByRole('radio', { name: 'Unified' })).toBeChecked();
    await expect(args.onValueChange).toHaveBeenCalledWith('unified');
  },
};
