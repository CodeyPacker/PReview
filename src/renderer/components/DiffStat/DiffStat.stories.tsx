// DiffStat stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DiffStat } from './DiffStat.tsx';

const meta = {
  title: 'Components/DiffStat',
  component: DiffStat,
  args: { additions: 58, deletions: 12 },
} satisfies Meta<typeof DiffStat>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithBar: Story = { args: { additions: 142, deletions: 28, bar: true } };

export const OnlyAdditions: Story = { args: { additions: 30, deletions: 0, bar: true } };

export const NoChanges: Story = { args: { additions: 0, deletions: 0, bar: true } };
