// NavItem stories (Storybook, CSF 3).
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { Home, Inbox, Settings } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { expect } from 'storybook/test';
import { NavItem } from './NavItem.tsx';

// NavItem needs a router. This one starts on /inbox so the Inbox link is active.
function MemoryRouter({ children }: { children: ReactNode }) {
  const [router] = useState(() =>
    createRouter({
      routeTree: createRootRoute({ component: () => children }),
      history: createMemoryHistory({ initialEntries: ['/inbox'] }),
    }),
  );
  return <RouterProvider router={router} />;
}

const meta = {
  title: 'Components/NavItem',
  component: NavItem,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <nav aria-label="Main" style={{ display: 'grid', gap: 4, width: 220 }}>
          <Story />
        </nav>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof NavItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Inactive: Story = { args: { to: '/dashboard', icon: <Home />, label: 'Dashboard' } };

export const Active: Story = {
  args: { to: '/inbox', icon: <Inbox />, label: 'Inbox', count: 3 },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('link', { name: /Inbox/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
  },
};

export const WithCount: Story = {
  args: { to: '/settings', icon: <Settings />, label: 'Settings', count: 2 },
};
