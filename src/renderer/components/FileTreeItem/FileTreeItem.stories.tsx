// FileTreeItem stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FileTreeItem } from './FileTreeItem.tsx';

const meta = {
  title: 'Components/FileTreeItem',
  component: FileTreeItem,
  args: { path: 'src/auth/AuthService.ts', status: 'modified', additions: 58, deletions: 12 },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FileTreeItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Selected: Story = { args: { selected: true } };

export const Added: Story = { args: { status: 'added', additions: 32, deletions: 0 } };

export const Removed: Story = { args: { status: 'removed', additions: 0, deletions: 8 } };

export const Renamed: Story = { args: { status: 'renamed', additions: 0, deletions: 0 } };

export const LongPath: Story = {
  args: { path: 'packages/web/src/features/authentication/components/LoginForm/LoginForm.tsx' },
};
