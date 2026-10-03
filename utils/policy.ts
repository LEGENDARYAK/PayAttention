import {
  getRules,
  getNotificationRules,
  getSettings,
  getTemporarySiteAllowances,
  isTabAllowedUntilClose,
} from './storage';
import type { ResolvedPolicy, SiteBehavior, SiteNotificationRule, SiteRule } from './types';
import { hostnameFromUrl, normalizeHostname, safeUrl } from './url';

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

export function ruleMatches(rule: SiteRule, url: string): boolean {
  const parsed = safeUrl(url);
  if (!parsed) return false;
  const hostname = normalizeHostname(parsed.hostname);
  const pattern = rule.pattern.trim();

  if (rule.matchType === 'url-pattern') {
    try {
      return globToRegExp(pattern).test(url);
    } catch {
      return false;
    }
  }

  const normalizedPattern = normalizeHostname(pattern);
  if (!normalizedPattern || !hostname) return false;
  if (rule.matchType === 'subdomain') return hostname === normalizedPattern;
  return hostname === normalizedPattern || hostname.endsWith(`.${normalizedPattern}`);
}

function ruleSpecificity(rule: SiteRule): number {
  if (rule.matchType === 'url-pattern') return 3000 + rule.pattern.length;
  if (rule.matchType === 'subdomain') return 2000 + rule.pattern.length;
  return 1000 + rule.pattern.length;
}

export function selectMatchingRule(rules: SiteRule[], url: string): SiteRule | undefined {
  return rules
    .map((rule, index) => ({ rule, index, score: ruleSpecificity(rule) }))
    .filter(({ rule }) => ruleMatches(rule, url))
    .sort((a, b) => b.score - a.score || b.index - a.index)[0]?.rule;
}

function selectMatchingNotificationRule(rules: SiteNotificationRule[], url: string): SiteNotificationRule | undefined {
  return rules
    .map((rule, index) => ({ rule, index, score: ruleSpecificity({ ...rule, behavior: 'pause' }) }))
    .filter(({ rule }) => ruleMatches({ ...rule, behavior: 'pause' }, url))
    .sort((a, b) => b.score - a.score || b.index - a.index)[0]?.rule;
}

function buildPolicy(
  behavior: SiteBehavior,
  source: ResolvedPolicy['source'],
  reason: string,
  settings: Awaited<ReturnType<typeof getSettings>>,
  matchedRuleId?: string,
): ResolvedPolicy {
  return {
    enabled: settings.enabled,
    allowed: behavior === 'allow',
    behavior,
    shouldPause: behavior === 'pause' || behavior === 'pause-and-mute',
    shouldMute: behavior === 'mute' || behavior === 'pause-and-mute',
    source,
    reason,
    matchedRuleId,
    autoResume: settings.autoResume,
    showToast: settings.showToast,
    toastShowUndo: settings.toastShowUndo,
    toastShowReason: settings.toastShowReason,
    toastDurationMs: settings.toastDurationMs,
  };
}

export async function resolvePolicy(url: string, tabId?: number): Promise<ResolvedPolicy> {
  const [baseSettings, notificationRules] = await Promise.all([getSettings(), getNotificationRules()]);
  const notificationRule = selectMatchingNotificationRule(notificationRules, url);
  const settings = notificationRule
    ? { ...baseSettings, showToast: notificationRule.showToast, toastShowUndo: notificationRule.showResume }
    : baseSettings;
  if (!settings.enabled) {
    return buildPolicy('allow', 'disabled', 'PayAttention is disabled.', settings);
  }

  if (typeof tabId === 'number' && (await isTabAllowedUntilClose(tabId))) {
    return buildPolicy(
      'allow',
      'tab-exception',
      'This tab is allowed until it closes.',
      settings,
    );
  }

  const hostname = hostnameFromUrl(url);
  const temporaryAllowances = await getTemporarySiteAllowances();
  if (
    hostname &&
    temporaryAllowances.some((allowance) => normalizeHostname(allowance.hostname) === hostname)
  ) {
    return buildPolicy(
      'allow',
      'temporary-site-exception',
      'This site has an active temporary exception.',
      settings,
    );
  }

  const matchingRule = selectMatchingRule(await getRules(), url);
  if (matchingRule) {
    return buildPolicy(
      matchingRule.behavior,
      'site-rule',
      `Matched a ${matchingRule.matchType.replace('-', ' ')} rule.`,
      settings,
      matchingRule.id,
    );
  }

  const defaultBehavior: SiteBehavior = settings.muteFallbackEnabled
    ? 'pause-and-mute'
    : 'pause';
  return buildPolicy(
    defaultBehavior,
    'default',
    settings.muteFallbackEnabled
      ? 'Default behavior: pause media and mute fallback audio.'
      : 'Default behavior: pause media when the tab becomes hidden.',
    settings,
  );
}
