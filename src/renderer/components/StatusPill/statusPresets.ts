// Presets for StatusPill: the tone, icon and word for each review, PR, agent and unlock state.
import {
  Bot,
  CircleCheck,
  CircleX,
  Clock,
  GitMerge,
  GitPullRequest,
  Lock,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { Tone } from '../../styles/tones.ts';

export interface StatusPreset {
  tone: Tone;
  icon: LucideIcon | null;
  label: string;
}

// Every state has a word and an icon, so color is never the only signal. Keep GitHub PR
// state, local review state and agent state in separate pills.
export const statusPresets = {
  // Local review state.
  'needs-review': { tone: 'accent', icon: CircleCheck, label: 'Needs Review' },
  'in-progress': { tone: 'warning', icon: Clock, label: 'In Progress' },
  'ready-for-rereview': { tone: 'info', icon: RefreshCw, label: 'Ready for Re-review' },
  'action-required': { tone: 'danger', icon: Zap, label: 'Action Required' },
  'changes-requested': { tone: 'danger', icon: CircleX, label: 'Changes Requested' },
  approved: { tone: 'success', icon: CircleCheck, label: 'Approved' },
  completed: { tone: 'neutral', icon: CircleCheck, label: 'Completed' },
  // GitHub PR state.
  open: { tone: 'success', icon: GitPullRequest, label: 'Open' },
  merged: { tone: 'accent', icon: GitMerge, label: 'Merged' },
  closed: { tone: 'neutral', icon: CircleX, label: 'Closed' },
  draft: { tone: 'neutral', icon: GitPullRequest, label: 'Draft' },
  // Findings.
  resolved: { tone: 'success', icon: CircleCheck, label: 'Resolved' },
  unresolved: { tone: 'danger', icon: null, label: 'Open' },
  validated: { tone: 'success', icon: ShieldCheck, label: 'Validated' },
  rejected: { tone: 'neutral', icon: ShieldX, label: 'Not Confirmed' },
  // Agent state.
  'agent-running': { tone: 'info', icon: Bot, label: 'Agent Running' },
  'agent-failed': { tone: 'danger', icon: Bot, label: 'Agent Failed' },
  // Achievements and characters.
  blocked: { tone: 'danger', icon: Lock, label: 'Blocked' },
  unlocked: { tone: 'success', icon: CircleCheck, label: 'Unlocked' },
} satisfies Record<string, StatusPreset>;

export type Status = keyof typeof statusPresets;
