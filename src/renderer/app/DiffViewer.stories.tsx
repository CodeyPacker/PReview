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

const comment = (id: string, login: string, body: string) => ({
  id,
  author: { login, avatarUrl: '' },
  body,
  createdAt: '2026-10-01T00:00:00Z',
  url: `https://github.com/octo/app/pull/7#discussion_${id}`,
});

export const WithThreads: Story = {
  args: {
    threads: [
      {
        id: 'T1',
        path: 'src/total.ts',
        side: 'modified',
        startLine: null,
        line: 2,
        resolved: false,
        outdated: false,
        comments: [
          comment('C1', 'hubot', 'Does reduce read better than the loop here?'),
          comment('C2', 'octocat', 'Yes, and it drops the mutable sum.'),
        ],
      },
      {
        id: 'T2',
        path: 'src/total.ts',
        side: 'original',
        startLine: 2,
        line: 3,
        resolved: true,
        outdated: false,
        comments: [comment('C3', 'hubot', 'Remove the loop.'), comment('C4', 'octocat', 'Done.')],
      },
    ],
  },
  decorators: [
    (Story) => (
      <div style={{ height: 640, width: 960 }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByText(/Does reduce read better/)).toBeVisible(), {
      timeout: 10000,
    });
    await expect(canvas.getByRole('button', { name: 'Show 1 reply' })).toBeVisible();
    await expect(canvas.queryByText('Done.')).toBeNull();
  },
};
