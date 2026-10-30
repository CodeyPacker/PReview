// IconTile stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Bug, CircleCheck, GitPullRequest, Lightbulb, MessageSquare, Trophy } from 'lucide-react';
import { IconTile } from './IconTile.tsx';

const meta = {
  title: 'Components/IconTile',
  component: IconTile,
  args: { icon: <GitPullRequest /> },
} satisfies Meta<typeof IconTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Tones: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12 }}>
      <IconTile icon={<GitPullRequest />} tone="accent" />
      <IconTile icon={<CircleCheck />} tone="success" />
      <IconTile icon={<Bug />} tone="danger" />
      <IconTile icon={<Lightbulb />} tone="warning" />
      <IconTile icon={<MessageSquare />} tone="info" />
      <IconTile icon={<Trophy />} tone="neutral" />
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {(['sm', 'md', 'lg', 'xl'] as const).map((size) => (
        <IconTile key={size} icon={<Trophy />} size={size} />
      ))}
    </div>
  ),
};

export const Solid: Story = { args: { icon: <Trophy />, size: 'lg', variant: 'solid' } };
