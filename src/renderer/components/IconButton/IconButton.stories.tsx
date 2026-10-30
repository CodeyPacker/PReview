// IconButton stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Bell, ChevronLeft, LayoutGrid, MoreHorizontal } from 'lucide-react';
import { expect } from 'storybook/test';
import { IconButton } from './IconButton.tsx';

const meta = {
  title: 'Components/IconButton',
  component: IconButton,
  args: { icon: <MoreHorizontal />, label: 'More actions' },
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'More actions' })).toBeVisible();
  },
};

export const NotificationDot: Story = {
  args: { icon: <Bell />, label: 'Notifications', dot: true, size: 'lg' },
};

export const Plain: Story = {
  args: { icon: <ChevronLeft />, label: 'Previous', variant: 'plain' },
};

export const Tinted: Story = {
  args: { icon: <LayoutGrid />, label: 'Grid view', variant: 'tinted' },
};

export const Small: Story = { args: { size: 'sm' } };
