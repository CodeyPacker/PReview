// XPChip stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Zap } from 'lucide-react';
import { XPChip } from './XPChip.tsx';

const meta = {
  title: 'Components/XPChip',
  component: XPChip,
  args: { amount: 250 },
} satisfies Meta<typeof XPChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Chip: Story = { args: { variant: 'chip', icon: <Zap /> } };

export const Pending: Story = { args: { amount: 0 } };

export const Large: Story = { args: { size: 'lg', amount: 1250 } };
