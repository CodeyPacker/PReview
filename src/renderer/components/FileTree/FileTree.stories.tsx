// FileTree stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { FileTree } from './FileTree.tsx';

const paths = [
  'README.md',
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'src/styles/tokens.css',
  'src/assets/logo.png',
  'Dockerfile',
  '.gitignore',
  'src/main/index.ts',
  'src/main/ipc/index.ts',
  'src/main/ipc/handlers.ts',
  'src/renderer/app/App.tsx',
  'src/renderer/app/AppShell.tsx',
  'docs/guide/getting-started.md',
];

const meta = {
  title: 'Components/FileTree',
  component: FileTree,
  args: { 'aria-label': 'Repository files', paths, onSelect: () => undefined },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FileTree>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SelectedFile: Story = { args: { selectedPath: 'src/main/ipc/handlers.ts' } };

export const AllOpen: Story = { args: { expandAll: true } };

export const Choosing: Story = {
  render: (args) => {
    const [path, setPath] = useState<string>();
    return <FileTree {...args} selectedPath={path} onSelect={setPath} />;
  },
};
