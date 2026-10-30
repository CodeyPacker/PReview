import type { Decorator, Preview } from '@storybook/react-vite';
import '../src/renderer/tokens.css';

// Mirrors the app: the theme is a data-theme attribute on <html>.
const withTheme: Decorator = (Story, context) => {
  document.documentElement.dataset.theme = context.globals.theme;
  document.body.style.background = 'var(--canvas)';
  document.body.style.color = 'var(--ink)';
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
  },
};

export default preview;
