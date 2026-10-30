// Icon stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Bell, Bot, Bug, GitPullRequest, Lightbulb, Trophy } from 'lucide-react';
import { Icon } from './Icon.tsx';

const meta = {
  title: 'Components/Icon',
  component: Icon,
  args: { icon: Bug },
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <Icon icon={GitPullRequest} size="sm" />
      <Icon icon={GitPullRequest} size="md" />
      <Icon icon={GitPullRequest} size="lg" />
    </div>
  ),
};

// Icons take currentColor from their parent.
export const InheritsColor: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16, color: 'var(--accent-text)' }}>
      {[Bell, Bot, Bug, Lightbulb, Trophy].map((icon, index) => (
        <Icon key={index} icon={icon} />
      ))}
    </div>
  ),
};

export const Labeled: Story = { args: { icon: Bell, label: 'Notifications' } };
