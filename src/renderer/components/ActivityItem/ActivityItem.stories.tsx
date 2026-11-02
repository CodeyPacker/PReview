// ActivityItem stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Bot } from 'lucide-react';
import { Avatar } from '../Avatar/Avatar.tsx';
import { ActivityItem } from './ActivityItem.tsx';

const meta = {
  title: 'Components/ActivityItem',
  component: ActivityItem,
  args: { author: 'Claude', time: '2 hours ago', children: 'Started working.' },
} satisfies Meta<typeof ActivityItem>;

export default meta;
type Story = StoryObj<typeof meta>;

const agent = <Avatar name="Claude" icon={<Bot aria-hidden />} size="sm" />;

export const Feed: Story = {
  render: () => (
    <ol style={{ margin: 0, padding: 0, maxWidth: 520 }}>
      <ActivityItem author="Claude" time="2 hours ago" avatar={agent}>
        Edited <code>src/auth/AuthService.ts</code>
      </ActivityItem>
      <ActivityItem author="Claude" time="1 hour ago" avatar={agent}>
        Tests passed
      </ActivityItem>
      <ActivityItem
        author="You"
        time="45 min ago"
        highlighted
        avatar={<Avatar name="You" tone="accent" size="sm" />}
      >
        You answered: Keep the old endpoint
      </ActivityItem>
      <ActivityItem author="Claude" time="10 min ago" last avatar={agent}>
        Finished. Renamed the token store and added tests.
      </ActivityItem>
    </ol>
  ),
};
