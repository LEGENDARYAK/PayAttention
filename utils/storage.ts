import { browser } from 'wxt/browser';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from './defaults';
import type {
  ActivityEntry,
  Settings,
  SiteRule,
  SiteNotificationRule,
  TemporarySiteAllowance,
} from './types';

let sessionMutationQueue: Promise<unknown> = Promise.resolve();
let activityMutationQueue: Promise<unknown> = Promise.resolve();

function getSessionArea(): typeof browser.storage.local {
  const storageWithSession = browser.storage as typeof browser.storage & {
    session?: typeof browser.storage.local;
  };
  return storageWithSession.session ?? browser.storage.local;
}

async function serializeSessionMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = sessionMutationQueue.then(operation, operation);
  sessionMutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function ensureStorageDefaults(): Promise<void> {
  const stored = await browser.storage.local.get([
    STORAGE_KEYS.settings,
    STORAGE_KEYS.rules,
    STORAGE_KEYS.notificationRules,
    STORAGE_KEYS.temporarySiteAllowances,
    STORAGE_KEYS.activityLog,
  ]);

  const updates: Record<string, unknown> = {};
  if (!stored[STORAGE_KEYS.settings]) updates[STORAGE_KEYS.settings] = DEFAULT_SETTINGS;
  if (!stored[STORAGE_KEYS.rules]) updates[STORAGE_KEYS.rules] = [];
  if (!stored[STORAGE_KEYS.notificationRules]) updates[STORAGE_KEYS.notificationRules] = [];
  if (!stored[STORAGE_KEYS.temporarySiteAllowances]) {
    updates[STORAGE_KEYS.temporarySiteAllowances] = [];
  }
  if (!stored[STORAGE_KEYS.activityLog]) updates[STORAGE_KEYS.activityLog] = [];

  if (Object.keys(updates).length > 0) {
    await browser.storage.local.set(updates);
  }
}

export async function getSettings(): Promise<Settings> {
  const result = await browser.storage.local.get(STORAGE_KEYS.settings);
  const stored = (result[STORAGE_KEYS.settings] ?? {}) as Partial<Settings>;
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  next.toastDurationMs = Math.min(15_000, Math.max(2_000, next.toastDurationMs));
  next.maxActivityEntries = Math.min(500, Math.max(10, next.maxActivityEntries));
  await browser.storage.local.set({ [STORAGE_KEYS.settings]: next });
  return next;
}

export async function replaceSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({
    [STORAGE_KEYS.settings]: { ...DEFAULT_SETTINGS, ...settings },
  });
}

export async function getRules(): Promise<SiteRule[]> {
  const result = await browser.storage.local.get(STORAGE_KEYS.rules);
  const value = result[STORAGE_KEYS.rules];
  return Array.isArray(value) ? (value as SiteRule[]) : [];
}

export async function setRules(rules: SiteRule[]): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEYS.rules]: rules });
}

export async function getNotificationRules(): Promise<SiteNotificationRule[]> {
  const result = await browser.storage.local.get(STORAGE_KEYS.notificationRules);
  const rules = result[STORAGE_KEYS.notificationRules];
  return Array.isArray(rules) ? (rules as SiteNotificationRule[]) : [];
}

export async function setNotificationRules(rules: SiteNotificationRule[]): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEYS.notificationRules]: rules });
}

export async function getTemporarySiteAllowances(): Promise<TemporarySiteAllowance[]> {
  const result = await browser.storage.local.get(STORAGE_KEYS.temporarySiteAllowances);
  const stored = Array.isArray(result[STORAGE_KEYS.temporarySiteAllowances])
    ? (result[STORAGE_KEYS.temporarySiteAllowances] as TemporarySiteAllowance[])
    : [];
  const now = Date.now();
  const active = stored.filter((allowance) => allowance.expiresAt > now);
  if (active.length !== stored.length) {
    await browser.storage.local.set({ [STORAGE_KEYS.temporarySiteAllowances]: active });
  }
  return active;
}

export async function setTemporarySiteAllowances(
  allowances: TemporarySiteAllowance[],
): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEYS.temporarySiteAllowances]: allowances });
}

export async function getActivityLog(): Promise<ActivityEntry[]> {
  const result = await browser.storage.local.get(STORAGE_KEYS.activityLog);
  const value = result[STORAGE_KEYS.activityLog];
  return Array.isArray(value) ? (value as ActivityEntry[]) : [];
}

export async function appendActivity(entry: ActivityEntry): Promise<void> {
  activityMutationQueue = activityMutationQueue.then(async () => {
    const settings = await getSettings();
    if (!settings.activityLogEnabled) return;
    const current = await getActivityLog();
    const next = [entry, ...current].slice(0, settings.maxActivityEntries);
    await browser.storage.local.set({ [STORAGE_KEYS.activityLog]: next });
  });
  await activityMutationQueue;
}

export async function clearActivityLog(): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEYS.activityLog]: [] });
}

async function getBooleanMap(key: string): Promise<Record<string, boolean>> {
  const result = await getSessionArea().get(key);
  const value = result[key];
  return value && typeof value === 'object' ? (value as Record<string, boolean>) : {};
}

async function updateBooleanMap(
  key: string,
  itemKey: string,
  enabled: boolean,
): Promise<Record<string, boolean>> {
  return serializeSessionMutation(async () => {
    const area = getSessionArea();
    const current = await getBooleanMap(key);
    if (enabled) current[itemKey] = true;
    else delete current[itemKey];
    await area.set({ [key]: current });
    return current;
  });
}

export async function isTabAllowedUntilClose(tabId: number): Promise<boolean> {
  const map = await getBooleanMap(STORAGE_KEYS.tabAllowances);
  return Boolean(map[String(tabId)]);
}

export async function setTabAllowedUntilClose(tabId: number, allowed: boolean): Promise<void> {
  await updateBooleanMap(STORAGE_KEYS.tabAllowances, String(tabId), allowed);
}

export async function isMutedByExtension(tabId: number): Promise<boolean> {
  const map = await getBooleanMap(STORAGE_KEYS.mutedByExtension);
  return Boolean(map[String(tabId)]);
}

export async function setMutedByExtension(tabId: number, muted: boolean): Promise<void> {
  await updateBooleanMap(STORAGE_KEYS.mutedByExtension, String(tabId), muted);
}

export async function getMutedByExtensionMap(): Promise<Record<string, boolean>> {
  return getBooleanMap(STORAGE_KEYS.mutedByExtension);
}

export async function removeTabSessionState(tabId: number): Promise<void> {
  await Promise.all([
    updateBooleanMap(STORAGE_KEYS.tabAllowances, String(tabId), false),
    updateBooleanMap(STORAGE_KEYS.mutedByExtension, String(tabId), false),
  ]);
}
