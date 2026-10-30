import { createRootRoute } from '@tanstack/react-router';
import { AppShell } from '../app/AppShell.tsx';

export const Route = createRootRoute({ component: AppShell });
