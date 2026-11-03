// StatCard stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Bug, Check, FileText, GitPullRequest, Lightbulb, MessageSquare } from 'lucide-react';
import { StatCard } from './StatCard.tsx';

const meta = {
  title: 'Components/StatCard',
  component: StatCard,
  args: {
    label: 'Bugs Caught',
    value: 24,
    delta: 12,
    tone: 'danger',
    icon: <Bug />,
    data: [3, 5, 4, 7, 6, 9, 12],
  },
  decorators: [(Story) => <div style={{ width: 260 }}>{Story()}</div>],
} satisfies Meta<typeof StatCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Decrease: Story = { args: { delta: -8 } };

export const Row: Story = {
  decorators: [],
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 240px)', gap: 16 }}>
      <StatCard
        label="Bugs Caught"
        value={24}
        delta={12}
        tone="danger"
        icon={<Bug />}
        data={[3, 5, 4, 7, 6, 9, 12]}
      />
      <StatCard
        label="Changes Requested"
        value={18}
        delta={28}
        tone="info"
        icon={<GitPullRequest />}
        data={[2, 4, 3, 6, 5, 8, 9]}
      />
      <StatCard
        label="Reviews Approved"
        value={42}
        delta={16}
        tone="success"
        icon={<Check />}
        data={[5, 4, 6, 6, 8, 9, 11]}
      />
    </div>
  ),
};

export const Stacked: Story = {
  decorators: [],
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 110px)', gap: 12 }}>
      <StatCard layout="stacked" label="PRs Reviewed" value={48} delta={14} icon={<FileText />} />
      <StatCard
        layout="stacked"
        label="Bugs Caught"
        value={23}
        delta={35}
        tone="danger"
        icon={<Bug />}
      />
      <StatCard
        layout="stacked"
        label="Improvements"
        value={37}
        delta={22}
        tone="warning"
        icon={<Lightbulb />}
      />
      <StatCard
        layout="stacked"
        label="Comments"
        value={96}
        delta={18}
        tone="info"
        icon={<MessageSquare />}
      />
    </div>
  ),
};
