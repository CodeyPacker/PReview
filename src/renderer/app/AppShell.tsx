import { Outlet } from '@tanstack/react-router';
import { Bell, House, Inbox, Plug, Settings, Smile, Trophy } from 'lucide-react';
import logo from '../assets/logo.png';
import { IconButton } from '../components/IconButton/IconButton.tsx';
import { NavItem } from '../components/NavItem/NavItem.tsx';
import { SearchField } from '../components/SearchField/SearchField.tsx';
import { modKey } from '../lib/platform.ts';
import styles from './AppShell.module.css';
import { GitHubPrompt } from './GitHubPrompt.tsx';

export function AppShell() {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <img src={logo} alt="" className={styles.logo} />
          <span className={styles.wordmark}>PReview</span>
        </div>
        <nav aria-label="Main" className={styles.nav}>
          <NavItem to="/dashboard" icon={<House />} label="Dashboard" />
          <NavItem to="/inbox" icon={<Inbox />} label="Inbox" />
          <NavItem to="/characters" icon={<Smile />} label="Characters" />
          <NavItem to="/achievements" icon={<Trophy />} label="Achievements" />
          <NavItem to="/integrations" icon={<Plug />} label="Integrations" />
          <NavItem to="/settings" icon={<Settings />} label="Settings" />
        </nav>
      </aside>

      <div className={styles.main}>
        <header className={styles.toolbar}>
          <SearchField
            size="lg"
            placeholder="Search pull requests, files, or repositories…"
            shortcut={[modKey, 'K']}
            className={styles.search}
          />
          <IconButton icon={<Bell />} label="Notifications" size="lg" />
        </header>
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
      <GitHubPrompt />
    </div>
  );
}
