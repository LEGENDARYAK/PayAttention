import { browser } from 'wxt/browser';
import type { RuntimeMessage } from '../../utils/messages';
import type { PopupState, SiteBehavior } from '../../utils/types';
import './style.css';

const enabledToggle = document.querySelector<HTMLInputElement>('#enabledToggle');
const statusDot = document.querySelector<HTMLElement>('#statusDot');
const statusTitle = document.querySelector<HTMLElement>('#statusTitle');
const siteName = document.querySelector<HTMLElement>('#siteName');
const statusReason = document.querySelector<HTMLElement>('#statusReason');
const controls = document.querySelector<HTMLElement>('#controls');
const tabAllowanceButton = document.querySelector<HTMLButtonElement>('#tabAllowanceButton');
const temporaryDuration = document.querySelector<HTMLSelectElement>('#temporaryDuration');
const customMinutes = document.querySelector<HTMLInputElement>('#customMinutes');
const temporaryAllowanceButton = document.querySelector<HTMLButtonElement>(
  '#temporaryAllowanceButton',
);
const permanentAllowanceButton = document.querySelector<HTMLButtonElement>(
  '#permanentAllowanceButton',
);
const siteBehavior = document.querySelector<HTMLSelectElement>('#siteBehavior');
const saveBehaviorButton = document.querySelector<HTMLButtonElement>('#saveBehaviorButton');
const settingsButton = document.querySelector<HTMLButtonElement>('#settingsButton');
const feedback = document.querySelector<HTMLElement>('#feedback');

let state: PopupState | null = null;

function assertElements(): void {
  if (
    !enabledToggle ||
    !statusDot ||
    !statusTitle ||
    !siteName ||
    !statusReason ||
    !controls ||
    !tabAllowanceButton ||
    !temporaryDuration ||
    !customMinutes ||
    !temporaryAllowanceButton ||
    !permanentAllowanceButton ||
    !siteBehavior ||
    !saveBehaviorButton ||
    !settingsButton ||
    !feedback
  ) {
    throw new Error('PayAttention popup failed to initialize.');
  }
}

async function send<T>(message: RuntimeMessage): Promise<T> {
  const response = (await browser.runtime.sendMessage(message)) as T & {
    ok?: boolean;
    error?: string;
  };
  if (response && response.ok === false) throw new Error(response.error ?? 'Action failed.');
  return response;
}

function setFeedback(message: string, isError = false): void {
  if (!feedback) return;
  feedback.textContent = message;
  feedback.classList.toggle('error', isError);
  window.setTimeout(() => {
    if (feedback.textContent === message) feedback.textContent = '';
  }, 2600);
}

function behaviorLabel(behavior: SiteBehavior): string {
  switch (behavior) {
    case 'allow':
      return 'Allowed';
    case 'mute':
      return 'Mute when hidden';
    case 'pause-and-mute':
      return 'Pause + mute fallback';
    case 'pause':
      return 'Pause when hidden';
  }
}

function render(): void {
  if (!state) return;
  assertElements();

  enabledToggle!.checked = state.settings.enabled;
  siteName!.textContent = state.hostname || state.title || 'Browser page';
  statusReason!.textContent = state.policy.reason;
  controls!.hidden = !state.supportedPage;

  statusDot!.className = 'status-dot';
  if (!state.settings.enabled) {
    statusTitle!.textContent = 'Extension disabled';
    statusDot!.classList.add('off');
  } else if (!state.supportedPage) {
    statusTitle!.textContent = 'Unavailable on this page';
    statusDot!.classList.add('off');
  } else if (state.policy.allowed) {
    statusTitle!.textContent = 'This tab is allowed';
    statusDot!.classList.add('allowed');
  } else {
    statusTitle!.textContent = behaviorLabel(state.policy.behavior);
    statusDot!.classList.add('active');
  }

  tabAllowanceButton!.textContent = state.tabAllowedUntilClose
    ? 'Remove tab-close allowance'
    : 'Allow until tab closes';
  tabAllowanceButton!.classList.toggle('active-choice', state.tabAllowedUntilClose);

  temporaryAllowanceButton!.textContent = state.hasTemporarySiteAllowance
    ? 'Extend temporary allowance'
    : 'Temporarily allow site';

  siteBehavior!.value =
    state.currentSiteRule?.matchType === 'subdomain' &&
    state.currentSiteRule.pattern.toLowerCase() === state.hostname.toLowerCase()
      ? state.currentSiteRule.behavior
      : 'default';
}

async function loadState(): Promise<void> {
  assertElements();
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (typeof tab?.id !== 'number') throw new Error('No active tab was found.');
  state = await send<PopupState>({ type: 'GET_POPUP_STATE', tabId: tab.id });
  render();
}

async function runAction(action: () => Promise<void>, successMessage: string): Promise<void> {
  try {
    await action();
    await loadState();
    setFeedback(successMessage);
  } catch (error) {
    setFeedback(error instanceof Error ? error.message : 'Action failed.', true);
  }
}

assertElements();

enabledToggle!.addEventListener('change', () => {
  void runAction(
    async () => {
      await send({ type: 'SET_ENABLED', enabled: enabledToggle!.checked });
    },
    enabledToggle!.checked ? 'PayAttention enabled.' : 'PayAttention disabled.',
  );
});

temporaryDuration!.addEventListener('change', () => {
  customMinutes!.hidden = temporaryDuration!.value !== 'custom';
});

tabAllowanceButton!.addEventListener('click', () => {
  if (!state?.tabId) return;
  void runAction(
    async () => {
      await send({ type: 'TOGGLE_TAB_ALLOWANCE', tabId: state!.tabId! });
    },
    state.tabAllowedUntilClose ? 'Tab allowance removed.' : 'Tab allowed until it closes.',
  );
});

temporaryAllowanceButton!.addEventListener('click', () => {
  if (!state?.tabId || !state.hostname) return;
  const minutes =
    temporaryDuration!.value === 'custom'
      ? Number(customMinutes!.value)
      : Number(temporaryDuration!.value);
  if (!Number.isFinite(minutes) || minutes < 1) {
    setFeedback('Enter at least 1 minute.', true);
    return;
  }
  void runAction(
    async () => {
      await send({
        type: 'ADD_TEMP_SITE_ALLOWANCE',
        tabId: state!.tabId!,
        hostname: state!.hostname,
        minutes,
      });
    },
    `Allowed ${state.hostname} for ${Math.round(minutes)} minute${Math.round(minutes) === 1 ? '' : 's'}.`,
  );
});

permanentAllowanceButton!.addEventListener('click', () => {
  if (!state?.tabId || !state.hostname) return;
  void runAction(
    async () => {
      await send({
        type: 'ADD_PERMANENT_SITE_ALLOWANCE',
        tabId: state!.tabId!,
        hostname: state!.hostname,
      });
    },
    `Permanently allowed ${state.hostname}.`,
  );
});

saveBehaviorButton!.addEventListener('click', () => {
  if (!state?.tabId || !state.hostname) return;
  void runAction(
    async () => {
      await send({
        type: 'SET_CURRENT_SITE_BEHAVIOR',
        tabId: state!.tabId!,
        hostname: state!.hostname,
        behavior: siteBehavior!.value as SiteBehavior | 'default',
      });
    },
    'Site behavior saved.',
  );
});

settingsButton!.addEventListener('click', () => {
  void browser.runtime.openOptionsPage();
});

void loadState().catch((error) => {
  statusTitle!.textContent = 'Could not load PayAttention';
  statusReason!.textContent = error instanceof Error ? error.message : 'Unexpected error';
  statusDot!.classList.add('off');
});
