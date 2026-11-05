// ChoiceTile stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { CircleX, User } from 'lucide-react';
import { ChoiceTile } from './ChoiceTile.tsx';

const meta = {
  title: 'Components/ChoiceTile',
  component: ChoiceTile,
  args: { label: 'Default', children: <User /> },
} satisfies Meta<typeof ChoiceTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Selected: Story = { args: { selected: true } };

export const Locked: Story = { args: { label: 'Teal', locked: true } };

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', alignItems: 'start', gap: 16 }}>
      <ChoiceTile label="None" size="sm">
        <CircleX />
      </ChoiceTile>
      <ChoiceTile label="Default" size="md" selected>
        <User />
      </ChoiceTile>
      <ChoiceTile label="Teal" size="lg" locked>
        <User />
      </ChoiceTile>
    </div>
  ),
};
