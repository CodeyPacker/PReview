// Sprite stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor } from 'storybook/test';
import { characterArt } from '../../lib/characterArt.ts';
import { Sprite } from './Sprite.tsx';

const shadow = characterArt.shadow!;
const layers = shadow.layers('default', 'dagger');

const meta = {
  title: 'Components/Sprite',
  component: Sprite,
  args: { animation: shadow.idle, layers: layers.idle, label: 'Shadow' },
  decorators: [
    (Story) => (
      <div style={{ width: 240 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Sprite>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  play: async ({ canvas }) => {
    const sprite = canvas.getByRole('img', { name: 'Shadow' });
    await waitFor(() => expect(sprite.dataset.frame).toBe('3'));
    // It loops back to the start.
    await waitFor(() => expect(sprite.dataset.frame).toBe('0'));
  },
};

export const Victory: Story = {
  args: { animation: shadow.victory, layers: layers.victory, onFinished: fn() },
  play: async ({ args, canvas }) => {
    const sprite = canvas.getByRole('img', { name: 'Shadow' });
    await waitFor(() => expect(args.onFinished).toHaveBeenCalledOnce(), { timeout: 3000 });
    // It holds the last frame.
    await expect(sprite.dataset.frame).toBe('11');
  },
};
