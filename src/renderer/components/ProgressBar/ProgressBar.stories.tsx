// ProgressBar stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProgressBar } from './ProgressBar.tsx';

const meta = {
  title: 'Components/ProgressBar',
  component: ProgressBar,
  args: { value: 62, 'aria-label': 'Level progress' },
  decorators: [(Story) => <div style={{ width: 320 }}>{Story()}</div>],
} satisfies Meta<typeof ProgressBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const XP: Story = {
  args: { value: 1250, max: 2000, label: 'Level 12', valueLabel: '1,250 / 2,000 XP' },
};

export const Percentage: Story = { args: { label: 'Agent task', tone: 'info', showValue: true } };

export const Tones: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 16 }}>
      <ProgressBar value={70} aria-label="XP" />
      <ProgressBar value={45} tone="info" aria-label="Agent task" />
      <ProgressBar value={100} tone="success" aria-label="Finished" />
      <ProgressBar value={30} tone="warning" aria-label="Warning" />
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 16 }}>
      <ProgressBar value={40} size="sm" aria-label="Small" />
      <ProgressBar value={60} size="md" aria-label="Medium" />
      <ProgressBar value={80} size="lg" aria-label="Large" />
    </div>
  ),
};
