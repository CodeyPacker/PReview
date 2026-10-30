// StatusDot stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusDot } from './StatusDot.tsx';

const meta = {
  title: 'Components/StatusDot',
  component: StatusDot,
  args: { label: 'Connected' },
} satisfies Meta<typeof StatusDot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const States: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 12 }}>
      <StatusDot tone="success" label="Online" />
      <StatusDot tone="warning" label="Syncing" />
      <StatusDot tone="danger" label="Disconnected" />
      <StatusDot tone="neutral" label="Offline" />
    </div>
  ),
};

export const WithSublabel: Story = { args: { label: 'Connected', sublabel: '12 open PRs' } };

export const Pulsing: Story = { args: { tone: 'info', label: 'Agent running', pulse: true } };
