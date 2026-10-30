// Count stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Count } from './Count.tsx';

const meta = {
  title: 'Components/Count',
  component: Count,
  args: { value: 3 },
} satisfies Meta<typeof Count>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = { args: { value: 12 } };
export const Accent: Story = { args: { tone: 'accent' } };
export const Danger: Story = { args: { tone: 'danger' } };
export const Capped: Story = { args: { value: 140, max: 99, tone: 'accent' } };
