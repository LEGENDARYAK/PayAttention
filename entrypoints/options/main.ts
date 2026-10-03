import { browser } from 'wxt/browser';
import { DEFAULT_SETTINGS } from '../../utils/defaults';
import type { RuntimeMessage } from '../../utils/messages';
import {
  clearActivityLog,
  getActivityLog,
  getRules,
  getSettings,
  getTemporarySiteAllowances,
  replaceSettings,
  saveSettings,
  setRules,
  setTemporarySiteAllowances,
} from '../../utils/storage';
import type {
  ExportPayload,
  RuleMatchType,
  Settings,
  SiteBehavior,
  SiteRule,
} from '../../utils/types';
import { makeId, normalizeHostname } from '../../utils/url';
import './style.css';

const element = <T extends Element>(selector: string): T => {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing settings element: ${selector}`);
  return found;
};

const enabled = element<HTMLInputElement>('#enabled');
const autoResume = element<HTMLInputElement>('#autoResume');
const muteFallbackEnabled = element<HTMLInputElement>('#muteFallbackEnabled');
const showToast = element<HTMLInputElement>('#showToast');
const toastShowUndo = element<HTMLInputElement>('#toastShowUndo');
const toastShowReason = element<HTMLInputElement>('#toastShowReason');
const toastDurationSeconds = element<HTMLInputElement>('#toastDurationSeconds');
const activityLogEnabled = element<HTMLInputElement>('#activityLogEnabled');
const maxActivityEntries = element<HTMLInputElement>('#maxActivityEntries');
const shortcutButton = element<HTMLButtonElement>('#shortcutButton');
const ruleForm = element<HTMLFormElement>('#ruleForm');
const ruleMatchType = element<HTMLSelectElement>('#ruleMatchType');
const rulePattern = element<HTMLInputElement>('#rulePattern');
const ruleBehavior = element<HTMLSelectElement>('#ruleBehavior');
const ruleFeedback = element<HTMLElement>('#ruleFeedback');
const rulesBody = element<HTMLTableSectionElement>('#rulesBody');
const rulesEmpty = element<HTMLElement>('#rulesEmpty');
const temporaryList = element<HTMLElement>('#temporaryList');
const temporaryEmpty = element<HTMLElement>('#temporaryEmpty');
const activityList = element<HTMLElement>('#activityList');
const activityEmpty = element<HTMLElement>('#activityEmpty');
const clearActivityButton = element<HTMLButtonElement>('#clearActivityButton');
const exportButton = element<HTMLButtonElement>('#exportButton');
const importInput = element<HTMLInputElement>('#importInput');
const resetButton = element<HTMLButtonElement>('#resetButton');
const dataFeedback = element<HTMLElement>('#dataFeedback');

let currentSettings: Settings = { ...DEFAULT_SETTINGS };
let currentRules: SiteRule[] = [];

async function notifyChanged(): Promise<void> {
  try {
    await browser.runtime.sendMessage({ type: 'SETTINGS_CHANGED' } satisfies RuntimeMessage);
  } catch {
    // The service worker will read the latest values when it next wakes.
  }
}

function setFeedback(target: HTMLElement, message: string, error = false): void {
  target.textContent = message;
  target.classList.toggle('error', error);
  window.setTimeout(() => {
    if (target.textContent === message) target.textContent = '';
  }, 3000);
}

function renderSettings(): void {
  enabled.checked = currentSettings.enabled;
  autoResume.checked = currentSettings.autoResume;
  muteFallbackEnabled.checked = currentSettings.muteFallbackEnabled;
  showToast.checked = currentSettings.showToast;
  toastShowUndo.checked = currentSettings.toastShowUndo;
  toastShowReason.checked = currentSettings.toastShowReason;
  toastDurationSeconds.value = String(Math.round(currentSettings.toastDurationMs / 1000));
  activityLogEnabled.checked = currentSettings.activityLogEnabled;
  maxActivityEntries.value = String(currentSettings.maxActivityEntries);
}

function behaviorText(behavior: SiteBehavior): string {
  return {
    allow: 'Allow',
    pause: 'Pause media',
    mute: 'Mute tab',
    'pause-and-mute': 'Pause + mute',
  }[behavior];
}

function matchTypeText(matchType: RuleMatchType): string {
  return {
    domain: 'Whole domain',
    subdomain: 'Exact hostname',
    'url-pattern': 'URL pattern',
  }[matchType];
}

function renderRules(): void {
  rulesBody.replaceChildren();
  rulesEmpty.hidden = currentRules.length > 0;

  for (const rule of currentRules) {
    const row = document.createElement('tr');

    const patternCell = document.createElement('td');
    const patternCode = document.createElement('code');
    patternCode.textContent = rule.pattern;
    patternCell.append(patternCode);

    const typeCell = document.createElement('td');
    typeCell.textContent = matchTypeText(rule.matchType);

    const behaviorCell = document.createElement('td');
    const behaviorSelect = document.createElement('select');
    for (const behavior of ['allow', 'pause', 'mute', 'pause-and-mute'] as SiteBehavior[]) {
      const option = document.createElement('option');
      option.value = behavior;
      option.textContent = behaviorText(behavior);
      option.selected = rule.behavior === behavior;
      behaviorSelect.append(option);
    }
    behaviorSelect.addEventListener('change', () => {
      void (async () => {
        currentRules = currentRules.map((candidate) =>
          candidate.id === rule.id
            ? { ...candidate, behavior: behaviorSelect.value as SiteBehavior }
            : candidate,
        );
        await setRules(currentRules);
        await notifyChanged();
        setFeedback(ruleFeedback, 'Rule updated.');
      })();
    });
    behaviorCell.append(behaviorSelect);

    const actionCell = document.createElement('td');
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'icon-button';
    deleteButton.textContent = 'Remove';
    deleteButton.addEventListener('click', () => {
      void (async () => {
        currentRules = currentRules.filter((candidate) => candidate.id !== rule.id);
        await setRules(currentRules);
        renderRules();
        await notifyChanged();
        setFeedback(ruleFeedback, 'Rule removed.');
      })();
    });
    actionCell.append(deleteButton);

    row.append(patternCell, typeCell, behaviorCell, actionCell);
    rulesBody.append(row);
  }
}

async function renderTemporaryAllowances(): Promise<void> {
  const allowances = await getTemporarySiteAllowances();
  temporaryList.replaceChildren();
  temporaryEmpty.hidden = allowances.length > 0;

  for (const allowance of allowances.sort((a, b) => a.expiresAt - b.expiresAt)) {
    const row = document.createElement('div');
    row.className = 'list-row';
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = allowance.hostname;
    const detail = document.createElement('span');
    detail.textContent = `Expires ${new Date(allowance.expiresAt).toLocaleString()}`;
    copy.append(title, detail);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'secondary';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      void (async () => {
        const current = await getTemporarySiteAllowances();
        await setTemporarySiteAllowances(
          current.filter((candidate) => candidate.id !== allowance.id),
        );
        await renderTemporaryAllowances();
        await notifyChanged();
      })();
    });
    row.append(copy, remove);
    temporaryList.append(row);
  }
}

async function renderActivity(): Promise<void> {
  const entries = await getActivityLog();
  activityList.replaceChildren();
  activityEmpty.hidden = entries.length > 0;

  for (const entry of entries) {
    const row = document.createElement('div');
    row.className = 'list-row activity-row';
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    const action = entry.action.charAt(0).toUpperCase() + entry.action.slice(1);
    title.textContent = `${action}: ${entry.hostname}`;
    const detail = document.createElement('span');
    const mediaDetail = entry.mediaCount > 0 ? ` · ${entry.mediaCount} media` : '';
    const mutedDetail = entry.muted ? ' · tab muted' : '';
    detail.textContent = `${new Date(entry.timestamp).toLocaleString()}${mediaDetail}${mutedDetail}`;
    copy.append(title, detail);
    row.append(copy);
    activityList.append(row);
  }
}

async function updateSetting(patch: Partial<Settings>): Promise<void> {
  currentSettings = await saveSettings(patch);
  renderSettings();
  await notifyChanged();
  if ('activityLogEnabled' in patch || 'maxActivityEntries' in patch) await renderActivity();
}

function normalizeRulePattern(matchType: RuleMatchType, pattern: string): string {
  const trimmed = pattern.trim();
  if (matchType === 'url-pattern') return trimmed;
  return normalizeHostname(trimmed.replace(/^https?:\/\//i, '').split('/')[0] ?? '');
}

function isValidImportedSettings(value: unknown): value is Settings {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Settings>;
  return (
    typeof candidate.enabled === 'boolean' &&
    typeof candidate.autoResume === 'boolean' &&
    typeof candidate.muteFallbackEnabled === 'boolean' &&
    typeof candidate.showToast === 'boolean' &&
    typeof candidate.toastShowUndo === 'boolean' &&
    typeof candidate.toastShowReason === 'boolean' &&
    typeof candidate.toastDurationMs === 'number' &&
    typeof candidate.activityLogEnabled === 'boolean' &&
    typeof candidate.maxActivityEntries === 'number'
  );
}

function isValidImportedRule(value: unknown): value is SiteRule {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SiteRule>;
  return (
    typeof candidate.id === 'string' &&
    ['domain', 'subdomain', 'url-pattern'].includes(candidate.matchType ?? '') &&
    typeof candidate.pattern === 'string' &&
    ['allow', 'pause', 'mute', 'pause-and-mute'].includes(candidate.behavior ?? '') &&
    typeof candidate.createdAt === 'number'
  );
}

async function load(): Promise<void> {
  [currentSettings, currentRules] = await Promise.all([getSettings(), getRules()]);
  renderSettings();
  renderRules();
  await Promise.all([renderTemporaryAllowances(), renderActivity()]);
}

enabled.addEventListener('change', () => void updateSetting({ enabled: enabled.checked }));
autoResume.addEventListener('change', () => void updateSetting({ autoResume: autoResume.checked }));
muteFallbackEnabled.addEventListener('change', () =>
  void updateSetting({ muteFallbackEnabled: muteFallbackEnabled.checked }),
);
showToast.addEventListener('change', () => void updateSetting({ showToast: showToast.checked }));
toastShowUndo.addEventListener('change', () =>
  void updateSetting({ toastShowUndo: toastShowUndo.checked }),
);
toastShowReason.addEventListener('change', () =>
  void updateSetting({ toastShowReason: toastShowReason.checked }),
);
toastDurationSeconds.addEventListener('change', () => {
  const seconds = Math.min(15, Math.max(2, Number(toastDurationSeconds.value) || 5));
  void updateSetting({ toastDurationMs: seconds * 1000 });
});
activityLogEnabled.addEventListener('change', () =>
  void updateSetting({ activityLogEnabled: activityLogEnabled.checked }),
);
maxActivityEntries.addEventListener('change', () => {
  const entries = Math.min(500, Math.max(10, Number(maxActivityEntries.value) || 100));
  void updateSetting({ maxActivityEntries: entries });
});

shortcutButton.addEventListener('click', () => {
  void browser.runtime.sendMessage({ type: 'OPEN_SHORTCUTS' } satisfies RuntimeMessage);
});

ruleForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void (async () => {
    const matchType = ruleMatchType.value as RuleMatchType;
    const pattern = normalizeRulePattern(matchType, rulePattern.value);
    if (!pattern) {
      setFeedback(ruleFeedback, 'Enter a valid rule pattern.', true);
      return;
    }
    if (matchType === 'url-pattern' && !/^https?:\/\//i.test(pattern)) {
      setFeedback(ruleFeedback, 'URL patterns should begin with http:// or https://.', true);
      return;
    }

    currentRules.push({
      id: makeId('rule'),
      matchType,
      pattern,
      behavior: ruleBehavior.value as SiteBehavior,
      createdAt: Date.now(),
    });
    await setRules(currentRules);
    rulePattern.value = '';
    renderRules();
    await notifyChanged();
    setFeedback(ruleFeedback, 'Rule added.');
  })();
});

clearActivityButton.addEventListener('click', () => {
  void (async () => {
    await clearActivityLog();
    await renderActivity();
  })();
});

exportButton.addEventListener('click', () => {
  void (async () => {
    const payload: ExportPayload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      settings: await getSettings(),
      rules: await getRules(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `payattention-settings-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setFeedback(dataFeedback, 'Settings exported.');
  })();
});

importInput.addEventListener('change', () => {
  void (async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Partial<ExportPayload>;
      if (
        parsed.schemaVersion !== 1 ||
        !isValidImportedSettings(parsed.settings) ||
        !Array.isArray(parsed.rules) ||
        !parsed.rules.every(isValidImportedRule)
      ) {
        throw new Error('This is not a valid PayAttention export.');
      }
      await Promise.all([replaceSettings(parsed.settings), setRules(parsed.rules)]);
      await load();
      await notifyChanged();
      setFeedback(dataFeedback, 'Settings and rules imported.');
    } catch (error) {
      setFeedback(
        dataFeedback,
        error instanceof Error ? error.message : 'Import failed.',
        true,
      );
    } finally {
      importInput.value = '';
    }
  })();
});

resetButton.addEventListener('click', () => {
  const confirmed = window.confirm(
    'Reset all PayAttention settings and permanent site rules? Temporary exceptions and activity history will remain.',
  );
  if (!confirmed) return;
  void (async () => {
    await Promise.all([replaceSettings(DEFAULT_SETTINGS), setRules([])]);
    await load();
    await notifyChanged();
    setFeedback(dataFeedback, 'Settings and permanent rules reset.');
  })();
});

void load().catch((error) => {
  setFeedback(
    dataFeedback,
    error instanceof Error ? error.message : 'Could not load settings.',
    true,
  );
});
