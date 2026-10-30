import type { Decorator, Preview } from '@storybook/react-vite';
import '../src/renderer/tokens.css';
import '../src/renderer/styles/base.css';
import '../src/renderer/styles/typography.css';

// Mirrors the app: the theme is a data-theme attribute on <html>.
const withTheme: Decorator = (Story, context) => {
  document.documentElement.dataset.theme = context.globals.theme as 'light' | 'dark';
  document.body.style.background = 'var(--canvas)';
  document.body.style.color = 'var(--ink)';
  // base.css locks the app window's scroll; stories need the page to scroll.
  document.body.style.overflow = 'auto';
  return Story();
};

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: 'Color theme',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'light' },
  parameters: {
    layout: 'centered',
    backgrounds: { disabled: true },
    // Accessibility violations fail the story's test.
    a11y: { test: 'error' },
  },
};

export default preview;
