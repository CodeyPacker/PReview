// Typography stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Typography } from './Typography.tsx';

const meta = {
  title: 'Components/Typography',
  component: Typography,
  args: { children: 'Review pull requests, earn XP.' },
} satisfies Meta<typeof Typography>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Paragraph: Story = {};

export const Secondary: Story = { args: { size: 'md', color: 'secondary' } };

export const Accent: Story = { args: { weight: 'semibold', color: 'accent' } };

export const Mono: Story = { args: { font: 'mono', size: 'md', children: 'feat/typography' } };

export const Headings: Story = {
  render: () => (
    <div>
      <Typography tag="h1">Heading 1</Typography>
      <Typography tag="h2">Heading 2</Typography>
      <Typography tag="h3">Heading 3</Typography>
      <Typography tag="h4">Heading 4</Typography>
      <Typography tag="h5">Heading 5</Typography>
      <Typography tag="h6">Heading 6</Typography>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div>
      {(['4xl', '3xl', '2xl', 'xl', 'lg', 'base', 'md', 'sm', 'xs'] as const).map((size) => (
        <Typography key={size} size={size}>
          {size}
        </Typography>
      ))}
    </div>
  ),
};

export const StyledAsAnotherElement: Story = {
  render: () => (
    <Typography tag="h2" as="h6" color="secondary">
      An h2 styled as an h6
    </Typography>
  ),
};
