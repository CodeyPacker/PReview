import { createContext, useContext, type Dispatch, type SetStateAction } from 'react';

export const SidebarContext = createContext<{
  collapsed: boolean;
  filesCollapsed: boolean;
  zen: boolean;
  setFilesCollapsed: Dispatch<SetStateAction<boolean>>;
  toggleZen: () => void;
  setCollapsed: Dispatch<SetStateAction<boolean>>;
} | null>(null);

export function useSidebar() {
  const sidebar = useContext(SidebarContext);
  if (!sidebar) throw new Error('useSidebar must be used inside AppShell.');
  return sidebar;
}
