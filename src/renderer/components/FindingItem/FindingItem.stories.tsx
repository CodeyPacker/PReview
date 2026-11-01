// FindingItem stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FindingItem } from './FindingItem.tsx';

const meta = {
  title: 'Components/FindingItem',
  component: FindingItem,
  args: { category: 'bug', title: 'Saving twice creates two drafts', resolution: 'open' },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 520 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FindingItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllStates: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 4 }}>
      <FindingItem category="bug" title="Saving twice creates two drafts" resolution="open" />
      <FindingItem
        category="ui-bug"
        title="The footer covers the save button"
        resolution="open"
        validation="validated"
        selected
      />
      <FindingItem
        category="security"
        title="The token is written to the log"
        resolution="resolved"
        validation="validated"
      />
      <FindingItem
        category="improvement"
        title="Show progress while the diff loads"
        resolution="open"
        validation="rejected"
      />
      <FindingItem category="test" title="No test covers an empty file" resolution="resolved" />
    </div>
  ),
};
