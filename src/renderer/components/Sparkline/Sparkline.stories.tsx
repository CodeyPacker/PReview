// Sparkline stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Sparkline } from './Sparkline.tsx';

const meta = {
  title: 'Components/Sparkline',
  component: Sparkline,
  args: { data: [3, 5, 4, 7, 6, 9, 12] },
} satisfies Meta<typeof Sparkline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Tones: Story = {
  render: (args) => (
    <div style={{ display: 'flex', gap: 24 }}>
      <Sparkline {...args} tone="accent" />
      <Sparkline {...args} tone="danger" />
      <Sparkline {...args} tone="warning" />
      <Sparkline {...args} tone="info" />
      <Sparkline {...args} tone="success" />
    </div>
  ),
};

export const LineOnly: Story = { args: { fill: false } };
