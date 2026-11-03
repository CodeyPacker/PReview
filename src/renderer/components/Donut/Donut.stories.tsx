// Donut stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Donut } from './Donut.tsx';

const meta = {
  title: 'Components/Donut',
  component: Donut,
  args: {
    centerValue: '12,450',
    centerLabel: 'XP Earned',
    segments: [
      { label: 'PR Reviews', value: 45 },
      { label: 'Bugs Caught', value: 25 },
      { label: 'Improvements', value: 20 },
      { label: 'Comments', value: 8 },
      { label: 'Other', value: 2 },
    ],
  },
  decorators: [(Story) => <div style={{ width: 480 }}>{Story()}</div>],
} satisfies Meta<typeof Donut>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomValues: Story = {
  args: {
    centerValue: '+650',
    centerLabel: 'XP',
    segments: [
      { label: 'Bugs caught', value: 250, color: 'chart-2', display: '+250 XP' },
      { label: 'Suggestions', value: 200, color: 'chart-3', display: '+200 XP' },
      { label: 'Comments', value: 120, color: 'chart-4', display: '+120 XP' },
      { label: 'Review completion', value: 80, color: 'chart-1', display: '+80 XP' },
    ],
  },
};

export const WithoutLegend: Story = { args: { legend: false } };
