// Kbd stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Kbd } from './Kbd.tsx';

const meta = {
  title: 'Components/Kbd',
  component: Kbd,
} satisfies Meta<typeof Kbd>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Command: Story = { args: { keys: ['⌘', 'K'] } };
export const Control: Story = { args: { keys: ['Ctrl', 'K'] } };
export const Single: Story = { args: { keys: ['Esc'] } };
