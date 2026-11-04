// LevelTrack stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { LevelTrack } from './LevelTrack.tsx';

const meta = {
  title: 'Components/LevelTrack',
  component: LevelTrack,
  args: {
    steps: [
      { level: 1, label: 'Outfit', sublabel: 'Default', state: 'done' },
      { level: 3, label: 'Outfit', sublabel: 'Midnight', state: 'current' },
      { level: 5, label: 'Outfit', sublabel: 'Crimson' },
      { level: 8, label: 'Outfit', sublabel: 'Sage' },
    ],
  },
} satisfies Meta<typeof LevelTrack>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllLocked: Story = {
  args: {
    steps: [
      { level: 3, label: 'Outfit', sublabel: 'Midnight' },
      { level: 5, label: 'Outfit', sublabel: 'Crimson' },
    ],
  },
};
