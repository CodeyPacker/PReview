// BarChart stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { BarChart } from './BarChart.tsx';

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const meta = {
  title: 'Components/BarChart',
  component: BarChart,
  args: {
    data: days.map((label, index) => ({ label, values: [[3, 7, 11, 7, 14, 5, 11][index]!] })),
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 420 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BarChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Stacked: Story = {
  args: {
    series: [
      { label: 'Bugs', color: 'chart-2' },
      { label: 'Improvements', color: 'chart-3' },
      { label: 'Comments', color: 'chart-4' },
    ],
    data: days.map((label, index) => ({
      label,
      values: [
        [1, 2, 3, 1, 4, 1, 2][index]!,
        [1, 3, 4, 2, 5, 2, 4][index]!,
        [1, 2, 4, 3, 5, 2, 5][index]!,
      ],
    })),
  },
};

export const Fill: Story = {
  args: { fill: true },
  decorators: [
    (Story) => (
      <div style={{ width: 420, height: 200 }}>
        <Story />
      </div>
    ),
  ],
};
