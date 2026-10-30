// Tabs stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Bot, FileCode, MessageSquare } from 'lucide-react';
import { expect, fn, userEvent } from 'storybook/test';
import { TabPanel, Tabs } from './Tabs.tsx';

const meta = {
  title: 'Components/Tabs',
  component: Tabs,
  args: {
    'aria-label': 'Review sections',
    items: [
      { value: 'files', label: 'Files', icon: <FileCode aria-hidden />, count: 12 },
      { value: 'comments', label: 'Comments', icon: <MessageSquare aria-hidden />, count: 4 },
      { value: 'agent', label: 'Agent', icon: <Bot aria-hidden /> },
    ],
    onValueChange: fn(),
  },
  decorators: [(Story) => <div style={{ width: 480 }}>{Story()}</div>],
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Small: Story = {
  args: {
    size: 'sm',
    'aria-label': 'Character',
    items: [
      { value: 'appearance', label: 'Appearance' },
      { value: 'animations', label: 'Animations' },
      { value: 'details', label: 'Details' },
    ],
  },
};

export const Block: Story = { args: { block: true } };

export const WithPanels: Story = {
  render: (args) => (
    <Tabs {...args}>
      <TabPanel value="files">12 changed files</TabPanel>
      <TabPanel value="comments">4 comments</TabPanel>
      <TabPanel value="agent">Agent is idle</TabPanel>
    </Tabs>
  ),
  play: async ({ args, canvas }) => {
    await expect(canvas.getByText('12 changed files')).toBeVisible();
    await userEvent.click(canvas.getByRole('tab', { name: /Comments/ }));
    await expect(args.onValueChange).toHaveBeenCalledWith('comments');
    await expect(canvas.getByText('4 comments')).toBeVisible();
  },
};
