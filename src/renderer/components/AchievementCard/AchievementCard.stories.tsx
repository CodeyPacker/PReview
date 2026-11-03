// AchievementCard stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Bug, Search, Zap } from 'lucide-react';
import { AchievementCard } from './AchievementCard.tsx';

const meta = {
  title: 'Components/AchievementCard',
  component: AchievementCard,
  args: {
    title: 'Bug Hunter',
    description: 'Catch 50 bugs in code review',
    icon: <Bug />,
    tone: 'danger',
    earnedAt: 'Oct 26, 2026',
  },
  decorators: [(Story) => <div style={{ width: 220 }}>{Story()}</div>],
} satisfies Meta<typeof AchievementCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Earned: Story = {};

export const InProgress: Story = {
  args: {
    title: 'Detail Seeker',
    description: 'Catch 10 subtle issues',
    icon: <Search />,
    tone: 'accent',
    earnedAt: undefined,
    progress: { value: 8, max: 10 },
  },
};

export const Locked: Story = {
  args: {
    title: 'Code Sage',
    description: 'Reach account level 25',
    earnedAt: undefined,
    locked: true,
  },
};

export const Row: Story = {
  decorators: [(Story) => <div style={{ width: 360 }}>{Story()}</div>],
  args: { layout: 'row', description: undefined, xp: 250 },
};

export const RowList: Story = {
  decorators: [],
  render: () => (
    <div style={{ display: 'grid', gap: 12, width: 360 }}>
      <AchievementCard
        layout="row"
        title="Bug Hunter"
        icon={<Bug />}
        tone="warning"
        earnedAt="Oct 28, 2026"
        xp={250}
      />
      <AchievementCard
        layout="row"
        title="Review Streak"
        icon={<Zap />}
        tone="info"
        earnedAt="Oct 28, 2026"
        xp={200}
      />
    </div>
  ),
};
