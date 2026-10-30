// Panel stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrowRight, ClipboardCheck } from 'lucide-react';
import { expect } from 'storybook/test';
import { Button } from '../Button/Button.tsx';
import { Panel } from './Panel.tsx';

const meta = {
  title: 'Components/Panel',
  component: Panel,
  args: {
    style: { width: 360 },
    children: <p className="callout">Three pull requests are waiting for your review.</p>,
  },
} satisfies Meta<typeof Panel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithHeader: Story = {
  args: {
    title: 'Pending Reviews',
    icon: <ClipboardCheck />,
    count: 3,
    action: (
      <Button variant="plain" size="sm" iconEnd={<ArrowRight />}>
        View All
      </Button>
    ),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('region', { name: 'Pending Reviews' })).toBeVisible();
  },
};

export const Glass: Story = {};
export const Solid: Story = { args: { variant: 'solid', title: 'Zen Mode' } };
export const Raised: Story = { args: { variant: 'raised', padding: 'sm' } };
export const Sunken: Story = { args: { variant: 'sunken', padding: 'lg' } };
