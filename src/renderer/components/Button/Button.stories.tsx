// Button stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrowRight, Check, MessageSquare, Trash2, XCircle } from 'lucide-react';
import { expect, fn, userEvent } from 'storybook/test';
import { Button } from './Button.tsx';

const meta = {
  title: 'Components/Button',
  component: Button,
  args: { children: 'Comment', onClick: fn() },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: { variant: 'primary', children: 'Review Pull Requests', iconEnd: <ArrowRight /> },
};

export const Secondary: Story = { args: { iconStart: <MessageSquare /> } };

export const Approve: Story = {
  args: { variant: 'outline', tone: 'success', iconStart: <Check />, children: 'Approve' },
};

export const RequestChanges: Story = {
  args: { variant: 'outline', tone: 'danger', iconStart: <XCircle />, children: 'Request Changes' },
};

export const Destructive: Story = {
  args: {
    variant: 'outline',
    tone: 'danger',
    iconStart: <Trash2 />,
    children: 'Remove Repository',
  },
};

export const Tinted: Story = { args: { variant: 'tinted', children: 'Write' } };

export const Plain: Story = {
  args: { variant: 'plain', children: 'View All', iconEnd: <ArrowRight /> },
};

export const Large: Story = { args: { variant: 'primary', size: 'lg', children: 'Open Review' } };

export const Small: Story = { args: { size: 'sm', children: 'Open in GitHub' } };

export const Selected: Story = { args: { selected: true, children: 'Split' } };

export const Loading: Story = {
  args: { variant: 'primary', loading: true, children: 'Posting' },
  play: async ({ args, canvas }) => {
    const button = canvas.getByRole('button', { name: 'Posting' });
    await expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};

export const Disabled: Story = { args: { disabled: true, children: 'Disabled' } };

export const Clicks: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Comment' }));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};
