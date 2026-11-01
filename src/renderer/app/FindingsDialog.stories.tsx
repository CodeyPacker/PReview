// FindingsDialog stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, waitFor } from 'storybook/test';
import type { ReviewFinding } from '../../shared/contracts/review-findings.ts';
import { FindingsDialog } from './FindingsDialog.tsx';

const finding = (id: number, overrides: Partial<ReviewFinding>): ReviewFinding => ({
  id,
  pullRequestId: 1,
  category: 'bug',
  description: 'Saving twice creates two drafts.',
  steps: '',
  validation: 'pending',
  resolution: 'open',
  publishedAt: null,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  ...overrides,
});

const initial = [
  finding(1, { steps: '1. Write a comment.\n2. Press save twice quickly.' }),
  finding(2, {
    category: 'security',
    description: 'The GitHub token is written to the log.',
    validation: 'validated',
    publishedAt: '2026-10-02T00:00:00Z',
  }),
  finding(3, {
    category: 'ui-bug',
    description: 'The footer covers the save button on small windows.',
    resolution: 'resolved',
    publishedAt: '2026-10-02T00:00:00Z',
  }),
];

// Keeps the findings in memory, as the app keeps them in its database.
function Stateful({ findings: start }: { findings: ReviewFinding[] }) {
  const [findings, setFindings] = useState(start);
  return (
    <FindingsDialog
      open
      onOpenChange={() => undefined}
      findings={findings}
      onSave={({ id, ...draft }) => {
        setFindings((items) =>
          id === undefined
            ? [...items, finding(Math.max(0, ...items.map((item) => item.id)) + 1, draft)]
            : items.map((item) => (item.id === id ? { ...item, ...draft } : item)),
        );
        return Promise.resolve();
      }}
      onSetResolution={(id, resolution) => {
        setFindings((items) =>
          items.map((item) => (item.id === id ? { ...item, resolution } : item)),
        );
        return Promise.resolve();
      }}
      onDelete={(id) => {
        setFindings((items) => items.filter((item) => item.id !== id));
        return Promise.resolve();
      }}
    />
  );
}

const meta = {
  title: 'App/FindingsDialog',
  component: Stateful,
  args: { findings: initial },
} satisfies Meta<typeof Stateful>;

export default meta;
type Story = StoryObj<typeof meta>;

export const List: Story = {
  play: async ({ canvasElement }) => {
    const body = canvasElement.ownerDocument.body;
    await waitFor(() => expect(body.textContent).toContain('Saving twice creates two drafts.'));
    await expect(body.textContent).toContain('Unpublished: 1.');
  },
};

export const Empty: Story = { args: { findings: [] } };
