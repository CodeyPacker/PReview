import { Outlet, useLocation } from '@tanstack/react-router';
import {
  House,
  Inbox,
  ChevronLeft,
  ChevronRight,
  Plug,
  Settings,
  Smile,
  Trophy,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type SetStateAction } from 'react';
import wordmarkDark from '../assets/wordmark-dark.png';
import wordmarkLight from '../assets/wordmark-light.png';
import { usePullRequests } from '../hooks/usePullRequests.ts';
import { useSettings } from '../hooks/useSettings.ts';
import { defaultSettings } from '../../shared/contracts/settings.ts';
import { reviewShortcutLabel } from '../lib/reviewShortcuts.ts';
import { SidebarContext } from './SidebarContext.ts';
import { IconButton } from '../components/IconButton/IconButton.tsx';
import { NavItem } from '../components/NavItem/NavItem.tsx';
import { SearchField } from '../components/SearchField/SearchField.tsx';
import { cx } from '../lib/cx.ts';
import { isMac, modKey } from '../lib/platform.ts';
import styles from './AppShell.module.css';
import { GitHubPrompt } from './GitHubPrompt.tsx';
import { NotificationsButton } from './NotificationsButton.tsx';

interface PanelVisibility {
  collapsed: boolean;
  filesCollapsed: boolean;
}

export function AppShell() {
  const { data: pullRequestState } = usePullRequests();
  // Pull requests whose review hasn't been opened yet.
  const unopened = pullRequestState?.pullRequests.filter((pull) => !pull.opened).length;
  const [layout, setLayout] = useState<PanelVisibility & { beforeZen: PanelVisibility | null }>({
    collapsed: false,
    filesCollapsed: true,
    beforeZen: null,
  });
  const { collapsed, filesCollapsed } = layout;
  const zen = layout.beforeZen !== null;
  const setCollapsed = useCallback((next: SetStateAction<boolean>) => {
    setLayout((state) => ({
      ...(state.beforeZen ?? state),
      collapsed: typeof next === 'function' ? next(state.collapsed) : next,
      beforeZen: null,
    }));
  }, []);
  const setFilesCollapsed = useCallback((next: SetStateAction<boolean>) => {
    setLayout((state) => ({
      ...(state.beforeZen ?? state),
      filesCollapsed: typeof next === 'function' ? next(state.filesCollapsed) : next,
      beforeZen: null,
    }));
  }, []);
  const toggleZen = useCallback(() => {
    setLayout((state) =>
      state.beforeZen
        ? { ...state.beforeZen, beforeZen: null }
        : {
            collapsed: true,
            filesCollapsed: true,
            beforeZen: { collapsed: state.collapsed, filesCollapsed: state.filesCollapsed },
          },
    );
  }, []);
  const sidebar = useMemo(
    () => ({ collapsed, setCollapsed, filesCollapsed, setFilesCollapsed, zen, toggleZen }),
    [collapsed, setCollapsed, filesCollapsed, setFilesCollapsed, zen, toggleZen],
  );
  const isReview = useLocation({ select: (location) => location.pathname.startsWith('/review/') });
  // No desktop notifications in Zen Mode.
  const quiet = zen && isReview;
  useEffect(() => {
    void window.preview.notifications.setQuiet(quiet);
  }, [quiet]);
  const { data: settings } = useSettings();
  const leader = settings?.reviewLeader ?? defaultSettings.reviewLeader;
  return (
    <SidebarContext value={sidebar}>
      <div
        className={cx(
          styles.shell,
          isMac && styles.mac,
          collapsed && styles.collapsed,
          zen && styles.zen,
          isReview && styles.review,
        )}
      >
        <IconButton
          className={styles.sidebarToggle}
          variant="plain"
          size="sm"
          icon={collapsed ? <ChevronRight /> : <ChevronLeft />}
          label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          shortcut={
            isReview
              ? reviewShortcutLabel(
                  leader,
                  settings?.reviewKeys.sidebar ?? defaultSettings.reviewKeys.sidebar,
                  isMac,
                )
              : undefined
          }
          aria-expanded={!collapsed}
          aria-controls="main-sidebar"
          onClick={() => setCollapsed((value) => !value)}
        />

        <div className={styles.sidebarSlot} inert={collapsed} aria-hidden={collapsed || undefined}>
          <aside id="main-sidebar" className={styles.sidebar}>
            <div className={styles.brand}>
              <img src={wordmarkLight} alt="PReview" className={styles.wordmarkLight} />
              <img src={wordmarkDark} alt="" aria-hidden className={styles.wordmarkDark} />
            </div>
            <nav aria-label="Main" className={styles.nav}>
              <NavItem to="/dashboard" icon={<House />} label="Dashboard" />
              <NavItem
                to="/inbox"
                icon={<Inbox />}
                label="Inbox"
                count={unopened}
                countTone="warning"
              />
              <NavItem to="/characters" icon={<Smile />} label="Characters" />
              <NavItem to="/achievements" icon={<Trophy />} label="Achievements" />
              <NavItem to="/integrations" icon={<Plug />} label="Integrations" />
              <NavItem to="/settings" icon={<Settings />} label="Settings" />
            </nav>
            <div className={styles.footer}>
              <NotificationsButton />
            </div>
          </aside>
        </div>

        <div className={styles.main}>
          <header className={styles.toolbar}>
            <SearchField
              size="lg"
              placeholder="Search pull requests, files, or repositories…"
              shortcut={[modKey, 'K']}
              className={styles.search}
            />
          </header>
          <main className={styles.content}>
            <Outlet />
          </main>
        </div>
        <GitHubPrompt />
      </div>
    </SidebarContext>
  );
}
