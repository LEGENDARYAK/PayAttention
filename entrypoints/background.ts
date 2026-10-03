import { browser, type Browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { DEFAULT_SETTINGS } from '../utils/defaults';
import type { RuntimeMessage } from '../utils/messages';
import { resolvePolicy, selectMatchingRule } from '../utils/policy';
import {
  appendActivity,
  ensureStorageDefaults,
  getMutedByExtensionMap,
  getRules,
  getSettings,
  getTemporarySiteAllowances,
  isMutedByExtension,
  isTabAllowedUntilClose,
  removeTabSessionState,
  saveSettings,
  setMutedByExtension,
  setRules,
  setTabAllowedUntilClose,
  setTemporarySiteAllowances,
} from '../utils/storage';
import type {
  ActivityEntry,
  PopupState,
  SiteBehavior,
  SiteRule,
  ToastPayload,
} from '../utils/types';
import { hostnameFromUrl, isSupportedWebUrl, makeId, normalizeHostname } from '../utils/url';

interface PauseAggregate {
  count: number;
  muted: boolean;
  reason: string;
  timer: ReturnType<typeof setTimeout>;
}

const BADGE = {
  off: { text: 'OFF', color: '#6b7280' },
  allow: { text: 'A', color: '#15803d' },
  pause: { text: 'P', color: '#b45309' },
  mute: { text: 'M', color: '#0369a1' },
  pauseAndMute: { text: 'P+M', color: '#6d28d9' },
} as const;

export default defineBackground({
  type: 'module',
  main() {
    const pauseAggregates = new Map<number, PauseAggregate>();

    const initialize = async (): Promise<void> => {
      await ensureStorageDefaults();
      try {
        const localWithAccessLevel = browser.storage.local as typeof browser.storage.local & {
          setAccessLevel?: (options: { accessLevel: 'TRUSTED_CONTEXTS' }) => Promise<void>;
        };
        await localWithAccessLevel.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' });
      } catch {
        // Firefox and older Chromium builds may not expose this privacy hardening API.
      }
      await refreshActiveBadges();
    };

    const updateBadge = async (tabId: number): Promise<void> => {
      const actionApi = browser.action;

      try {
        const tab = await browser.tabs.get(tabId);
        const url = tab.url ?? '';
        const policy = await resolvePolicy(url, tabId);
        let badge: { text: string; color: string } = BADGE.pause;
        let title = 'PayAttention: pause media when this tab is hidden';

        if (!policy.enabled) {
          badge = BADGE.off;
          title = 'PayAttention is disabled';
        } else if (policy.allowed) {
          badge = BADGE.allow;
          title = `PayAttention: allowed (${policy.reason})`;
        } else if (policy.shouldPause && policy.shouldMute) {
          badge = BADGE.pauseAndMute;
          title = 'PayAttention: pause media and mute fallback audio';
        } else if (policy.shouldMute) {
          badge = BADGE.mute;
          title = 'PayAttention: mute this tab when hidden';
        }

        await actionApi.setBadgeText({ tabId, text: badge.text });
        await actionApi.setBadgeBackgroundColor({ tabId, color: badge.color });
        await actionApi.setTitle({ tabId, title });
      } catch {
        // Tab may have closed or may be an internal browser page.
      }
    };

    const refreshActiveBadges = async (): Promise<void> => {
      try {
        const tabs = await browser.tabs.query({ active: true });
        await Promise.all(
          tabs
            .filter((tab): tab is Browser.tabs.Tab & { id: number } => typeof tab.id === 'number')
            .map((tab) => updateBadge(tab.id)),
        );
      } catch {
        // Best-effort UI update.
      }
    };

    const muteTab = async (tabId: number): Promise<boolean> => {
      if (await isMutedByExtension(tabId)) return true;
      try {
        const tab = await browser.tabs.get(tabId);
        if (tab.mutedInfo?.muted) return false;
        await browser.tabs.update(tabId, { muted: true });
        await setMutedByExtension(tabId, true);
        return true;
      } catch {
        return false;
      }
    };

    const unmuteTab = async (tabId: number): Promise<boolean> => {
      if (!(await isMutedByExtension(tabId))) return false;
      try {
        const tab = await browser.tabs.get(tabId);
        const mutedInfo = tab.mutedInfo;
        const wasMutedByThisExtension =
          mutedInfo?.muted === true &&
          (mutedInfo.extensionId
            ? mutedInfo.extensionId === browser.runtime.id
            : mutedInfo.reason === 'extension');
        if (wasMutedByThisExtension) {
          await browser.tabs.update(tabId, { muted: false });
        }
      } catch {
        // The tab may have closed.
      } finally {
        await setMutedByExtension(tabId, false);
      }
      return true;
    };

    const restoreAllMutedTabs = async (): Promise<void> => {
      const map = await getMutedByExtensionMap();
      await Promise.all(
        Object.keys(map)
          .map(Number)
          .filter(Number.isFinite)
          .map((tabId) => unmuteTab(tabId)),
      );
    };

    const reconcileTab = async (tabId: number): Promise<void> => {
      try {
        const tab = await browser.tabs.get(tabId);
        const policy = await resolvePolicy(tab.url ?? '', tabId);
        if (!policy.enabled || !policy.shouldMute || policy.allowed) {
          await unmuteTab(tabId);
        }
        await updateBadge(tabId);
      } catch {
        // Tab may have closed.
      }
    };

    const reconcileAllTabs = async (): Promise<void> => {
      const settings = await getSettings();
      if (!settings.enabled) await restoreAllMutedTabs();
      const activeTabs = await browser.tabs.query({ active: true });
      await Promise.all(
        activeTabs
          .filter((tab): tab is Browser.tabs.Tab & { id: number } => typeof tab.id === 'number')
          .map((tab) => reconcileTab(tab.id)),
      );
    };

    const queuePauseAggregate = (
      tabId: number,
      patch: { count?: number; muted?: boolean; reason?: string },
    ): void => {
      const previous = pauseAggregates.get(tabId);
      if (previous) clearTimeout(previous.timer);

      const aggregate: PauseAggregate = {
        count: Math.max(0, (previous?.count ?? 0) + (patch.count ?? 0)),
        muted: Boolean(previous?.muted || patch.muted),
        reason: patch.reason ?? previous?.reason ?? 'The tab became hidden.',
        timer: setTimeout(() => {
          void flushPauseAggregate(tabId);
        }, 180),
      };
      pauseAggregates.set(tabId, aggregate);
    };

    const flushPauseAggregate = async (tabId: number): Promise<void> => {
      const aggregate = pauseAggregates.get(tabId);
      if (!aggregate) return;
      pauseAggregates.delete(tabId);
      if (aggregate.count === 0 && !aggregate.muted) return;

      try {
        const tab = await browser.tabs.get(tabId);
        const settings = await getSettings();
        const hostname = hostnameFromUrl(tab.url ?? '') || 'unknown';
        const activity: ActivityEntry = {
          id: makeId('activity'),
          timestamp: Date.now(),
          hostname,
          action: aggregate.count > 0 ? 'paused' : 'muted',
          mediaCount: aggregate.count,
          muted: aggregate.muted,
          reason: aggregate.reason,
        };
        await appendActivity(activity);

        if (settings.showToast) {
          const payload: ToastPayload = {
            mediaCount: aggregate.count,
            muted: aggregate.muted,
            reason: aggregate.reason,
            autoResume: settings.autoResume,
            showUndo: settings.toastShowUndo,
            showReason: settings.toastShowReason,
            durationMs: settings.toastDurationMs,
          };
          await browser.tabs.sendMessage(
            tabId,
            { type: 'SHOW_TOAST', payload } satisfies RuntimeMessage,
            { frameId: 0 },
          );
        }
      } catch {
        // Restricted pages and closed tabs cannot receive content-script messages.
      }
    };

    const getPopupState = async (tabId: number): Promise<PopupState> => {
      const [tab, settings, temporaryAllowances, rules, tabAllowedUntilClose] = await Promise.all([
        browser.tabs.get(tabId),
        getSettings(),
        getTemporarySiteAllowances(),
        getRules(),
        isTabAllowedUntilClose(tabId),
      ]);
      const url = tab.url ?? '';
      const hostname = hostnameFromUrl(url);
      const policy = await resolvePolicy(url, tabId);
      const exactRule = rules
        .filter(
          (rule) =>
            rule.matchType === 'subdomain' &&
            normalizeHostname(rule.pattern) === normalizeHostname(hostname),
        )
        .at(-1);
      const currentSiteRule = exactRule ?? selectMatchingRule(rules, url);

      return {
        tabId,
        url,
        hostname,
        title: tab.title ?? hostname,
        supportedPage: isSupportedWebUrl(url),
        policy,
        settings,
        tabAllowedUntilClose,
        hasTemporarySiteAllowance: temporaryAllowances.some(
          (allowance) => normalizeHostname(allowance.hostname) === normalizeHostname(hostname),
        ),
        currentSiteRule,
      };
    };

    const addTemporarySiteAllowance = async (
      tabId: number,
      hostname: string,
      minutes: number,
    ): Promise<void> => {
      const normalized = normalizeHostname(hostname);
      if (!normalized) throw new Error('A valid website is required.');
      const boundedMinutes = Math.min(43_200, Math.max(1, Math.round(minutes)));
      const current = await getTemporarySiteAllowances();
      const next = current.filter(
        (allowance) => normalizeHostname(allowance.hostname) !== normalized,
      );
      next.push({
        id: makeId('temp'),
        hostname: normalized,
        createdAt: Date.now(),
        expiresAt: Date.now() + boundedMinutes * 60_000,
      });
      await setTemporarySiteAllowances(next);
      await reconcileTab(tabId);
    };

    const setCurrentSiteBehavior = async (
      tabId: number,
      hostname: string,
      behavior: SiteBehavior | 'default',
    ): Promise<void> => {
      const normalized = normalizeHostname(hostname);
      if (!normalized) throw new Error('A valid website is required.');
      const current = await getRules();
      const withoutExactHost = current.filter(
        (rule) =>
          !(
            rule.matchType === 'subdomain' &&
            normalizeHostname(rule.pattern) === normalized
          ),
      );
      if (behavior !== 'default') {
        withoutExactHost.push({
          id: makeId('rule'),
          matchType: 'subdomain',
          pattern: normalized,
          behavior,
          createdAt: Date.now(),
        });
      }
      await setRules(withoutExactHost);
      await reconcileTab(tabId);
    };

    const addPermanentSiteAllowance = async (
      tabId: number,
      hostname: string,
    ): Promise<void> => {
      const normalized = normalizeHostname(hostname);
      if (!normalized) throw new Error('A valid website is required.');
      const rules = await getRules();
      const next = rules.filter(
        (rule) =>
          !(
            rule.matchType === 'subdomain' &&
            normalizeHostname(rule.pattern) === normalized
          ),
      );
      const rule: SiteRule = {
        id: makeId('rule'),
        matchType: 'subdomain',
        pattern: normalized,
        behavior: 'allow',
        createdAt: Date.now(),
      };
      next.push(rule);
      await setRules(next);
      await reconcileTab(tabId);
    };

    const resumeTabMedia = async (tabId: number): Promise<void> => {
      await unmuteTab(tabId);
      try {
        await browser.tabs.sendMessage(tabId, { type: 'RESUME_MEDIA' } satisfies RuntimeMessage);
      } catch {
        // No content script on restricted pages.
      }
      try {
        const tab = await browser.tabs.get(tabId);
        await appendActivity({
          id: makeId('activity'),
          timestamp: Date.now(),
          hostname: hostnameFromUrl(tab.url ?? '') || 'unknown',
          action: 'resumed',
          mediaCount: 0,
          muted: false,
          reason: 'Resumed from the PayAttention notification.',
        });
      } catch {
        // Tab may have closed.
      }
    };

    const handleMessage = async (
      message: RuntimeMessage,
      sender: Browser.runtime.MessageSender,
    ): Promise<unknown> => {
      switch (message.type) {
        case 'GET_POLICY':
          return resolvePolicy(message.url, sender.tab?.id);

        case 'DOCUMENT_VISIBILITY': {
          const tabId = sender.tab?.id;
          if (typeof tabId !== 'number') return { ok: false };
          const policy = await resolvePolicy(message.url || sender.tab?.url || '', tabId);
          let muted = false;
          if (message.hidden && policy.shouldMute && !policy.allowed) {
            muted = await muteTab(tabId);
            queuePauseAggregate(tabId, {
              muted,
              reason: 'You switched away from this tab.',
            });
          } else if (!message.hidden) {
            await unmuteTab(tabId);
          }
          await updateBadge(tabId);
          return { ok: true, policy, muted };
        }

        case 'FRAME_PAUSED': {
          const tabId = sender.tab?.id;
          if (typeof tabId !== 'number') return { ok: false };
          queuePauseAggregate(tabId, {
            count: message.count,
            reason: 'You switched away from this tab.',
          });
          return { ok: true };
        }

        case 'GET_POPUP_STATE':
          return getPopupState(message.tabId);

        case 'SET_ENABLED': {
          await saveSettings({ enabled: message.enabled });
          if (!message.enabled) await restoreAllMutedTabs();
          await reconcileAllTabs();
          return { ok: true };
        }

        case 'ADD_TEMP_SITE_ALLOWANCE':
          await addTemporarySiteAllowance(message.tabId, message.hostname, message.minutes);
          return { ok: true };

        case 'TOGGLE_TAB_ALLOWANCE': {
          const current = await isTabAllowedUntilClose(message.tabId);
          await setTabAllowedUntilClose(message.tabId, !current);
          await reconcileTab(message.tabId);
          return { ok: true, allowed: !current };
        }

        case 'ADD_PERMANENT_SITE_ALLOWANCE':
          await addPermanentSiteAllowance(message.tabId, message.hostname);
          return { ok: true };

        case 'SET_CURRENT_SITE_BEHAVIOR':
          await setCurrentSiteBehavior(
            message.tabId,
            message.hostname,
            message.behavior,
          );
          return { ok: true };

        case 'RESUME_TAB_MEDIA': {
          const tabId = message.tabId ?? sender.tab?.id;
          if (typeof tabId !== 'number') return { ok: false };
          await resumeTabMedia(tabId);
          return { ok: true };
        }

        case 'SETTINGS_CHANGED':
          await reconcileAllTabs();
          return { ok: true };

        case 'OPEN_SHORTCUTS': {
          const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
          await browser.tabs.create({
            url: isFirefox ? 'about:addons' : 'chrome://extensions/shortcuts',
          });
          return { ok: true };
        }

        case 'SHOW_TOAST':
        case 'RESUME_MEDIA':
          return { ok: false };
      }
    };

    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      void handleMessage(message as RuntimeMessage, sender)
        .then((response) => sendResponse(response))
        .catch((error: unknown) => {
          const messageText = error instanceof Error ? error.message : 'Unexpected error';
          sendResponse({ ok: false, error: messageText });
        });
      return true;
    });

    browser.runtime.onInstalled.addListener(() => {
      void initialize();
    });

    browser.runtime.onStartup.addListener(() => {
      void initialize();
    });

    browser.tabs.onActivated.addListener(({ tabId }) => {
      void updateBadge(tabId);
    });

    browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.url || changeInfo.status === 'complete') {
        void updateBadge(tabId);
      }
    });

    browser.tabs.onRemoved.addListener((tabId) => {
      const aggregate = pauseAggregates.get(tabId);
      if (aggregate) clearTimeout(aggregate.timer);
      pauseAggregates.delete(tabId);
      void removeTabSessionState(tabId);
    });

    browser.storage.onChanged.addListener((_changes, areaName) => {
      if (areaName === 'local') void reconcileAllTabs();
    });

    browser.commands.onCommand.addListener((command) => {
      void (async () => {
        if (command === 'toggle-payattention') {
          const settings = await getSettings();
          await saveSettings({ enabled: !settings.enabled });
          if (settings.enabled) await restoreAllMutedTabs();
          await reconcileAllTabs();
          return;
        }

        if (command === 'toggle-current-tab-exception') {
          const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
          if (typeof tab?.id !== 'number') return;
          const current = await isTabAllowedUntilClose(tab.id);
          await setTabAllowedUntilClose(tab.id, !current);
          await reconcileTab(tab.id);
        }
      })();
    });

    void initialize().catch(async () => {
      await browser.storage.local.set({ settings: DEFAULT_SETTINGS });
    });
  },
});
