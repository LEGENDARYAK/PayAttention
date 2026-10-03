export type SiteBehavior = 'allow' | 'pause' | 'mute' | 'pause-and-mute';
export type RuleMatchType = 'domain' | 'subdomain' | 'url-pattern';
export type PolicySource =
  | 'disabled'
  | 'tab-exception'
  | 'temporary-site-exception'
  | 'site-rule'
  | 'default';

export interface Settings {
  enabled: boolean;
  autoResume: boolean;
  muteFallbackEnabled: boolean;
  showToast: boolean;
  toastShowUndo: boolean;
  toastShowReason: boolean;
  toastDurationMs: number;
  activityLogEnabled: boolean;
  maxActivityEntries: number;
}

export interface SiteRule {
  id: string;
  matchType: RuleMatchType;
  pattern: string;
  behavior: SiteBehavior;
  createdAt: number;
}

export interface SiteNotificationRule {
  id: string;
  matchType: RuleMatchType;
  pattern: string;
  showToast: boolean;
  showResume: boolean;
  createdAt: number;
}

export interface TemporarySiteAllowance {
  id: string;
  hostname: string;
  expiresAt: number;
  createdAt: number;
}

export interface ActivityEntry {
  id: string;
  timestamp: number;
  hostname: string;
  action: 'paused' | 'resumed' | 'muted' | 'unmuted';
  mediaCount: number;
  muted: boolean;
  reason: string;
}

export interface ResolvedPolicy {
  enabled: boolean;
  allowed: boolean;
  behavior: SiteBehavior;
  shouldPause: boolean;
  shouldMute: boolean;
  source: PolicySource;
  reason: string;
  matchedRuleId?: string;
  autoResume: boolean;
  showToast: boolean;
  toastShowUndo: boolean;
  toastShowReason: boolean;
  toastDurationMs: number;
}

export interface PopupState {
  tabId: number | null;
  url: string;
  hostname: string;
  title: string;
  supportedPage: boolean;
  policy: ResolvedPolicy;
  settings: Settings;
  tabAllowedUntilClose: boolean;
  hasTemporarySiteAllowance: boolean;
  currentSiteRule?: SiteRule;
}

export interface ToastPayload {
  mediaCount: number;
  muted: boolean;
  reason: string;
  autoResume: boolean;
  showUndo: boolean;
  showReason: boolean;
  durationMs: number;
}

export interface ExportPayload {
  schemaVersion: 1;
  exportedAt: string;
  settings: Settings;
  rules: SiteRule[];
  notificationRules?: SiteNotificationRule[];
}
