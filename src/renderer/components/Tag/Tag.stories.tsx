// Tag stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Folder, Hash } from 'lucide-react';
import { expect, fn, userEvent } from 'storybook/test';
import { Tag } from './Tag.tsx';

const meta = {
  title: 'Components/Tag',
  component: Tag,
  args: { children: 'frontend' },
} satisfies Meta<typeof Tag>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Tones: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8 }}>
      <Tag>Personal</Tag>
      <Tag tone="info">enhancement</Tag>
      <Tag tone="accent">design</Tag>
    </div>
  ),
};

export const Small: Story = { args: { size: 'sm', icon: <Hash />, children: '1284' } };

export const WithIcon: Story = { args: { icon: <Folder />, children: 'Work' } };

export const FilterButton: Story = {
  args: { onClick: fn(), children: 'bug' },
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'bug' }));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};
