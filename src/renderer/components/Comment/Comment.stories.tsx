// Comment stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Pencil, Trash2 } from 'lucide-react';
import { expect } from 'storybook/test';
import { Button } from '../Button/Button.tsx';
import { IconButton } from '../IconButton/IconButton.tsx';
import { StatusPill } from '../StatusPill/StatusPill.tsx';
import { Comment } from './Comment.tsx';

const meta = {
  title: 'Components/Comment',
  component: Comment,
  args: {
    author: 'Cody',
    time: '2 hours ago',
    children:
      'Consider adding error handling for non-200 responses. Right now this still tries to parse the response as JSON.',
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 560 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Comment>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Draft: Story = {
  args: {
    status: (
      <StatusPill tone="neutral" icon={<Pencil aria-hidden />} size="sm">
        Draft
      </StatusPill>
    ),
    actions: (
      <>
        <Button variant="plain" tone="neutral" size="sm">
          Edit
        </Button>
        <IconButton variant="plain" tone="neutral" size="sm" icon={<Trash2 />} label="Delete" />
      </>
    ),
  },
};

export const PlainText: Story = {
  args: { children: '<b>not bold</b>\nsecond line' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/<b>not bold<\/b>/)).toBeVisible();
  },
};
