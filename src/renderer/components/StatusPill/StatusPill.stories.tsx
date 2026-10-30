// StatusPill stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Bug, Lightbulb } from 'lucide-react';
import { StatusPill } from './StatusPill.tsx';
import { statusPresets, type Status } from './statusPresets.ts';

const meta = {
  title: 'Components/StatusPill',
  component: StatusPill,
  args: { status: 'needs-review' },
} satisfies Meta<typeof StatusPill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllStatuses: Story = {
  render: () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxWidth: 560 }}>
      {(Object.keys(statusPresets) as Status[]).map((status) => (
        <StatusPill key={status} status={status} />
      ))}
    </div>
  ),
};

export const Small: Story = { args: { status: 'approved', size: 'sm' } };

export const Outline: Story = { args: { status: 'unresolved', variant: 'outline' } };

// Anything outside the presets: tone + icon + children.
export const Custom: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8 }}>
      <StatusPill tone="danger" icon={<Bug />}>
        Bug
      </StatusPill>
      <StatusPill tone="warning" icon={<Lightbulb />}>
        Improvement
      </StatusPill>
    </div>
  ),
};

export const WithoutIcon: Story = { args: { status: 'merged', icon: null } };
