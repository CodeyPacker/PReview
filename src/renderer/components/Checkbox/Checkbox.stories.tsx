// Checkbox stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { Checkbox } from './Checkbox.tsx';

const meta = {
  title: 'Components/Checkbox',
  component: Checkbox,
  args: { label: 'Viewed', onCheckedChange: fn() },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unchecked: Story = {};

export const Checked: Story = { args: { defaultChecked: true } };

export const Indeterminate: Story = { args: { label: 'Select all', indeterminate: true } };

export const WithoutLabel: Story = { args: { label: undefined, 'aria-label': 'Mark file viewed' } };

export const Disabled: Story = { args: { disabled: true } };

export const Toggles: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByText('Viewed'));
    await expect(canvas.getByRole('checkbox', { name: 'Viewed' })).toBeChecked();
    await expect(args.onCheckedChange).toHaveBeenCalledWith(true, expect.anything());
  },
};
