// ImageDiff stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ImageDiff } from './ImageDiff.tsx';

const svg = (color: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="160" height="120" rx="20" fill="${color}"/></svg>`,
  )}`;

const meta = {
  title: 'App/ImageDiff',
  component: ImageDiff,
  args: { path: 'build/icon.png', original: svg('#6b4ef6'), modified: svg('#18b47a') },
  decorators: [
    (Story) => (
      <div style={{ width: 640 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ImageDiff>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Changed: Story = {};

export const Added: Story = { args: { original: null } };

export const Removed: Story = { args: { modified: null } };
