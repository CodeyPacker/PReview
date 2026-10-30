// TextField stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Folder } from 'lucide-react';
import { expect, userEvent } from 'storybook/test';
import { TextField } from './TextField.tsx';

const meta = {
  title: 'Components/TextField',
  component: TextField,
  args: { label: 'Display name', placeholder: 'octocat' },
  decorators: [(Story) => <div style={{ width: 360 }}>{Story()}</div>],
} satisfies Meta<typeof TextField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithHint: Story = { args: { hint: 'Shown on your profile and leaderboard.' } };

export const WithError: Story = {
  args: {
    label: 'Watched folder',
    defaultValue: '~/projcts',
    error: 'This folder does not exist. Pick a folder that contains Git repositories.',
  },
};

export const Multiline: Story = {
  args: { label: 'Comment', placeholder: 'Leave a comment', multiline: true, rows: 4 },
};

export const WithIconEnd: Story = {
  args: { label: 'Watched folder', defaultValue: '~/projects', iconEnd: <Folder aria-hidden /> },
};

export const Inline: Story = {
  args: { layout: 'inline', label: 'Model', defaultValue: 'claude-opus-5-5' },
  decorators: [(Story) => <div style={{ width: 480 }}>{Story()}</div>],
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 12 }}>
      <TextField size="sm" aria-label="Small" placeholder="Small" />
      <TextField size="md" aria-label="Medium" placeholder="Medium" />
      <TextField size="lg" aria-label="Large" placeholder="Large" />
    </div>
  ),
};

export const Disabled: Story = { args: { disabled: true, defaultValue: 'octocat' } };

export const LabelFocusesInput: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByText('Display name'));
    await expect(canvas.getByRole('textbox', { name: 'Display name' })).toHaveFocus();
  },
};
