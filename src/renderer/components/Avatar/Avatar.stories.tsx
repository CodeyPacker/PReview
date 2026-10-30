// Avatar stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Bot } from 'lucide-react';
import { expect } from 'storybook/test';
import { Avatar } from './Avatar.tsx';

const meta = {
  title: 'Components/Avatar',
  component: Avatar,
  args: { name: 'codex-agent' },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Initials: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('img', { name: 'codex-agent' })).toHaveTextContent('CA');
  },
};

export const Accent: Story = { args: { name: 'Cody', tone: 'accent', size: 'xl' } };

export const AgentIcon: Story = { args: { name: 'Agent', icon: <Bot />, tone: 'info' } };

export const Rounded: Story = { args: { name: 'acme web-app', shape: 'rounded', size: 'lg' } };

export const Online: Story = { args: { name: 'Cody', size: 'lg', status: 'success' } };
