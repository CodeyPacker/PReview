// ColorSwatch stories (Storybook, CSF 3).
import { RadioGroup } from '@base-ui/react/radio-group';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ColorSwatch } from './ColorSwatch.tsx';

const meta = {
  title: 'Components/ColorSwatch',
  component: ColorSwatch,
  args: { value: 'blue', color: 'var(--accent-option-2)', 'aria-label': 'Blue' },
  decorators: [
    (Story) => (
      <RadioGroup aria-label="Accent color" defaultValue="blue">
        <Story />
      </RadioGroup>
    ),
  ],
} satisfies Meta<typeof ColorSwatch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
