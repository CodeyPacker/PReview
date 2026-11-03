// CharacterCard stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { CharacterCard } from './CharacterCard.tsx';

const meta = {
  title: 'Components/CharacterCard',
  component: CharacterCard,
  args: { name: 'Shadow', level: 4 },
} satisfies Meta<typeof CharacterCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Selected: Story = { args: { selected: true } };

export const Locked: Story = { args: { locked: true, unlockHint: 'Unlock at Level 20' } };

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', alignItems: 'start', gap: 16 }}>
      <CharacterCard name="Shadow" level={4} size="sm" />
      <CharacterCard name="Shadow" level={4} size="md" />
      <CharacterCard name="Shadow" level={4} size="lg" />
    </div>
  ),
};

export const Strip: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16 }}>
      <CharacterCard name="Shadow" level={4} selected />
      <CharacterCard name="Ember" level={2} />
      <CharacterCard name="Frost" level={1} />
      <CharacterCard name="Locked" locked unlockHint="Unlock at Level 20" />
    </div>
  ),
};
