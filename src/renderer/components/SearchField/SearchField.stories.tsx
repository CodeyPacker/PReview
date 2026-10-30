// SearchField stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import { SearchField } from './SearchField.tsx';

const meta = {
  title: 'Components/SearchField',
  component: SearchField,
  decorators: [
    (Story) => (
      <div style={{ width: 480 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SearchField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Global: Story = {
  args: {
    size: 'lg',
    placeholder: 'Search pull requests, files, or repositories…',
    shortcut: ['⌘', 'K'],
  },
};

export const Filter: Story = {
  args: { placeholder: 'Filter reviews…' },
  play: async ({ canvas }) => {
    const input = canvas.getByRole('searchbox', { name: 'Filter reviews…' });
    await userEvent.type(input, 'auth');
    await expect(input).toHaveValue('auth');
  },
};
