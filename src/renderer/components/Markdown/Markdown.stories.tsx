// Markdown stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Markdown } from './Markdown.tsx';

const meta = {
  title: 'Components/Markdown',
  component: Markdown,
  args: {
    children: `## Summary

Adds a **login** page with \`useSession\`. See [the docs](https://example.com).
A new line stays on its own line.

- First item
- [x] Done item

> A quote

\`\`\`ts
const a = 1;
\`\`\`

| File | Lines |
| --- | --- |
| a.ts | 12 |

![A screenshot](https://example.com/a.png)`,
  },
} satisfies Meta<typeof Markdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
