// DiffViewer stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import { DiffViewer } from './DiffViewer.tsx';

const original = `export function total(items: number[]): number {
  let sum = 0;
  for (const item of items) sum += item;
  return sum;
}
`;

const modified = `export function total(items: readonly number[]): number {
  return items.reduce((sum, item) => sum + item, 0);
}
`;

const meta = {
  title: 'App/DiffViewer',
  component: DiffViewer,
  args: { path: 'src/total.ts', previousPath: null, original, modified, mode: 'split' },
  decorators: [
    (Story) => (
      <div style={{ height: 320, width: 720 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DiffViewer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Split: Story = {
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('.monaco-diff-editor')).not.toBeNull(), {
      timeout: 10000,
    });
  },
};

export const Unified: Story = { args: { mode: 'unified' } };
