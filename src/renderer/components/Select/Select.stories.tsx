// Select stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Calendar, FolderGit2 } from 'lucide-react';
import { expect, fn, screen, userEvent, waitFor } from 'storybook/test';
import { Select } from './Select.tsx';

const meta = {
  title: 'Components/Select',
  component: Select,
  args: {
    'aria-label': 'Sort',
    options: ['Newest', 'Oldest', 'Most changed'],
    defaultValue: 'Newest',
    onValueChange: fn(),
  },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithIcon: Story = {
  args: {
    'aria-label': 'Repository',
    iconStart: <FolderGit2 aria-hidden />,
    options: [
      { value: 'all', label: 'All Repos' },
      { value: 'preview', label: 'PReview' },
      { value: 'pigmentory', label: 'Pigmentory' },
    ],
    defaultValue: 'all',
  },
};

export const Small: Story = {
  args: {
    size: 'sm',
    'aria-label': 'Range',
    iconStart: <Calendar aria-hidden />,
    options: ['Last 7 Days', 'Last 30 Days', 'All Time'],
    defaultValue: 'Last 30 Days',
  },
};

export const Plain: Story = { args: { variant: 'plain' } };

export const Placeholder: Story = {
  args: { defaultValue: undefined, placeholder: 'Sort by', 'aria-label': 'Sort by' },
};

export const Block: Story = {
  args: { block: true },
  decorators: [(Story) => <div style={{ width: 280 }}>{Story()}</div>],
};

export const Disabled: Story = { args: { disabled: true } };

export const Chooses: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole('combobox', { name: 'Sort' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Oldest' }));
    await expect(args.onValueChange).toHaveBeenCalledWith('Oldest');
    await expect(canvas.getByRole('combobox', { name: 'Sort' })).toHaveTextContent('Oldest');
    // The popup unmounts after its exit transition. Until then its focus guards are in the DOM,
    // so wait for it before the a11y check runs.
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  },
};
