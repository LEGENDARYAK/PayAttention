import type { Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  autoResume: false,
  muteFallbackEnabled: false,
  showToast: true,
  toastShowUndo: true,
  toastShowReason: true,
  toastDurationMs: 5000,
  activityLogEnabled: false,
  maxActivityEntries: 100,
};

export const STORAGE_KEYS = {
  settings: 'settings',
  rules: 'rules',
  temporarySiteAllowances: 'temporarySiteAllowances',
  activityLog: 'activityLog',
  tabAllowances: 'tabAllowances',
  mutedByExtension: 'mutedByExtension',
} as const;
