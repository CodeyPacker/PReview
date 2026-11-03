// ListItem stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { GitPullRequest } from 'lucide-react';
import { Avatar } from '../Avatar/Avatar.tsx';
import { Button } from '../Button/Button.tsx';
import { StatusPill } from '../StatusPill/StatusPill.tsx';
import { ListItem } from './ListItem.tsx';

const meta = {
  title: 'Components/ListItem',
  component: ListItem,
  args: {
    eyebrow: 'acme/web-app',
    title: 'Add user authentication',
    meta: '#482 · 2 hours ago',
    leading: <Avatar name="acme" shape="rounded" icon={<GitPullRequest />} />,
    trailing: <StatusPill status="needs-review" size="sm" />,
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 520 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ListItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Clickable: Story = { args: { onClick: () => undefined } };

export const Selected: Story = { args: { onClick: () => undefined, selected: true } };

export const Card: Story = { args: { variant: 'card' } };

export const Stripe: Story = { args: { variant: 'card', stripe: 'accent' } };

export const WithAction: Story = {
  args: {
    trailing: (
      <Button variant="primary" size="sm">
        Review
      </Button>
    ),
  },
};
