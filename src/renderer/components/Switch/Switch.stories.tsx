// Switch stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { Switch } from './Switch.tsx';

const meta = {
  title: 'Components/Switch',
  component: Switch,
  args: { 'aria-label': 'Sound effects', onCheckedChange: fn() },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = {};

export const On: Story = { args: { defaultChecked: true } };

export const Small: Story = { args: { size: 'sm', defaultChecked: true } };

export const WithLabel: Story = { args: { 'aria-label': undefined, label: 'Sound effects' } };

export const Disabled: Story = { args: { disabled: true, defaultChecked: true } };

export const Toggles: Story = {
  args: { 'aria-label': undefined, label: 'Sound effects' },
  play: async ({ args, canvas }) => {
    const control = canvas.getByRole('switch', { name: 'Sound effects' });
    await userEvent.click(canvas.getByText('Sound effects'));
    await expect(control).toBeChecked();
    await expect(args.onCheckedChange).toHaveBeenCalledWith(true, expect.anything());
  },
};
