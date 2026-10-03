import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import type { RuntimeMessage } from '../utils/messages';
import type { ResolvedPolicy, ToastPayload } from '../utils/types';

interface VisibilityResponse {
  ok: boolean;
  policy?: ResolvedPolicy;
  muted?: boolean;
}

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_start',
  matchAboutBlank: true,
  matchOriginAsFallback: true,
  main(ctx) {
    const pausedByExtension = new Set<HTMLMediaElement>();
    const isTopFrame = window === window.top;
    let pendingToast: ToastPayload | null = null;
    let toastHost: HTMLElement | null = null;
    let lastKnownHidden = document.hidden;
    let enforcing = false;

    const getPolicy = async (): Promise<ResolvedPolicy | null> => {
      try {
        return (await browser.runtime.sendMessage({
          type: 'GET_POLICY',
          url: location.href,
        } satisfies RuntimeMessage)) as ResolvedPolicy;
      } catch {
        return null;
      }
    };

    const collectMedia = (): HTMLMediaElement[] => {
      const media = new Set<HTMLMediaElement>();
      const roots: Array<Document | ShadowRoot> = [document];
      const visited = new Set<Document | ShadowRoot>();

      while (roots.length > 0) {
        const root = roots.pop();
        if (!root || visited.has(root)) continue;
        visited.add(root);
        root.querySelectorAll<HTMLMediaElement>('audio, video').forEach((element) => media.add(element));
        root.querySelectorAll<HTMLElement>('*').forEach((element) => {
          if (element.shadowRoot) roots.push(element.shadowRoot);
        });
      }

      return [...media];
    };

    const cleanTrackedMedia = (): void => {
      for (const media of pausedByExtension) {
        if (!media.isConnected || media.ended) pausedByExtension.delete(media);
      }
    };

    const pauseMediaElement = (media: HTMLMediaElement): boolean => {
      if (media.paused || media.ended || media.readyState === 0) return false;
      pausedByExtension.add(media);
      try {
        media.pause();
        return true;
      } catch {
        pausedByExtension.delete(media);
        return false;
      }
    };

    const pauseAllMedia = (): number => {
      cleanTrackedMedia();
      enforcing = true;
      let count = 0;
      try {
        for (const media of collectMedia()) {
          if (pauseMediaElement(media)) count += 1;
        }
      } finally {
        enforcing = false;
      }
      return count;
    };

    const resumeTrackedMedia = async (): Promise<number> => {
      cleanTrackedMedia();
      let resumed = 0;
      for (const media of [...pausedByExtension]) {
        if (!media.paused || media.ended || !media.isConnected) {
          pausedByExtension.delete(media);
          continue;
        }
        try {
          await media.play();
          pausedByExtension.delete(media);
          resumed += 1;
        } catch {
          // Keep it tracked so a later explicit user action can retry.
        }
      }
      return resumed;
    };

    const notifyFramePaused = async (count: number): Promise<void> => {
      if (count <= 0) return;
      try {
        await browser.runtime.sendMessage({
          type: 'FRAME_PAUSED',
          count,
          url: location.href,
        } satisfies RuntimeMessage);
      } catch {
        // Service worker may be restarting; media is still paused locally.
      }
    };

    const notifyVisibility = async (hidden: boolean): Promise<VisibilityResponse | null> => {
      if (!isTopFrame) return null;
      try {
        return (await browser.runtime.sendMessage({
          type: 'DOCUMENT_VISIBILITY',
          hidden,
          url: location.href,
        } satisfies RuntimeMessage)) as VisibilityResponse;
      } catch {
        return null;
      }
    };

    const enforceHiddenState = async (): Promise<void> => {
      const policy = await getPolicy();
      if (!policy) return;

      if (policy.enabled && !policy.allowed && policy.shouldPause) {
        const count = pauseAllMedia();
        await notifyFramePaused(count);
      }
      await notifyVisibility(true);
    };

    const handleVisibleState = async (): Promise<void> => {
      await notifyVisibility(false);
      const policy = await getPolicy();
      if (policy?.autoResume) await resumeTrackedMedia();

      if (isTopFrame && pendingToast) {
        const payload = pendingToast;
        pendingToast = null;
        window.setTimeout(() => showToast(payload), 80);
      }
    };

    const handleVisibilityChange = (): void => {
      const hidden = document.hidden;
      if (hidden === lastKnownHidden) return;
      lastKnownHidden = hidden;
      if (hidden) void enforceHiddenState();
      else void handleVisibleState();
    };

    const removeToast = (): void => {
      toastHost?.remove();
      toastHost = null;
    };

    const buildToastText = (payload: ToastPayload): string => {
      if (payload.mediaCount > 0 && payload.muted) {
        return `Paused ${payload.mediaCount} media ${payload.mediaCount === 1 ? 'item' : 'items'} and muted fallback audio.`;
      }
      if (payload.mediaCount > 0) {
        return `Paused ${payload.mediaCount} media ${payload.mediaCount === 1 ? 'item' : 'items'}.`;
      }
      return 'Muted this tab’s audio.';
    };

    const showToast = (payload: ToastPayload): void => {
      if (!isTopFrame) return;
      if (document.hidden) {
        pendingToast = payload;
        return;
      }

      removeToast();
      const host = document.createElement('div');
      host.id = 'payattention-toast-host';
      host.style.position = 'fixed';
      host.style.top = '18px';
      host.style.right = '18px';
      host.style.zIndex = '2147483647';
      host.style.all = 'initial';
      const shadow = host.attachShadow({ mode: 'closed' });

      const wrapper = document.createElement('div');
      wrapper.setAttribute('role', 'status');
      wrapper.setAttribute('aria-live', 'polite');
      wrapper.innerHTML = `
        <style>
          :host { all: initial; }
          .toast {
            width: min(360px, calc(100vw - 36px));
            box-sizing: border-box;
            border: 1px solid rgba(255,255,255,.16);
            border-radius: 14px;
            background: rgba(15, 23, 42, .96);
            color: #f8fafc;
            box-shadow: 0 18px 50px rgba(2, 6, 23, .32);
            font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            padding: 14px 14px 12px;
            animation: pa-enter 160ms ease-out;
          }
          @keyframes pa-enter {
            from { opacity: 0; transform: translateY(-8px) scale(.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          .top { display: flex; align-items: start; gap: 10px; }
          .mark {
            display: grid;
            place-items: center;
            flex: 0 0 30px;
            width: 30px;
            height: 30px;
            border-radius: 9px;
            background: #f59e0b;
            color: #111827;
            font-weight: 900;
            letter-spacing: -1px;
          }
          .copy { flex: 1; min-width: 0; }
          .title { margin: 0; font-size: 13px; line-height: 1.35; font-weight: 750; }
          .reason { margin: 4px 0 0; color: #cbd5e1; font-size: 12px; line-height: 1.4; }
          .close {
            appearance: none;
            border: 0;
            background: transparent;
            color: #94a3b8;
            cursor: pointer;
            font-size: 18px;
            line-height: 1;
            padding: 0 2px;
          }
          .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 11px; }
          .resume {
            appearance: none;
            border: 0;
            border-radius: 9px;
            background: #f8fafc;
            color: #0f172a;
            cursor: pointer;
            font-size: 12px;
            font-weight: 750;
            padding: 8px 11px;
          }
          .resume:hover { background: #e2e8f0; }
        </style>
        <div class="toast">
          <div class="top">
            <div class="mark">PA</div>
            <div class="copy">
              <p class="title"></p>
              <p class="reason"></p>
            </div>
            <button class="close" type="button" aria-label="Dismiss">×</button>
          </div>
          <div class="actions"></div>
        </div>
      `;

      const title = wrapper.querySelector<HTMLElement>('.title');
      const reason = wrapper.querySelector<HTMLElement>('.reason');
      const close = wrapper.querySelector<HTMLButtonElement>('.close');
      const actions = wrapper.querySelector<HTMLElement>('.actions');
      if (!title || !reason || !close || !actions) return;

      title.textContent = buildToastText(payload);
      reason.textContent = payload.autoResume
        ? 'PayAttention resumed tracked media when you returned.'
        : payload.showReason
          ? `Reason: ${payload.reason}`
          : '';
      reason.hidden = !reason.textContent;
      close.addEventListener('click', removeToast);

      if (payload.showUndo && !payload.autoResume) {
        const resumeButton = document.createElement('button');
        resumeButton.className = 'resume';
        resumeButton.type = 'button';
        resumeButton.textContent = 'Resume';
        resumeButton.addEventListener('click', () => {
          void browser.runtime.sendMessage({ type: 'RESUME_TAB_MEDIA' } satisfies RuntimeMessage);
          removeToast();
        });
        actions.append(resumeButton);
      } else {
        actions.remove();
      }

      shadow.append(wrapper);
      (document.documentElement ?? document.body)?.append(host);
      toastHost = host;
      window.setTimeout(removeToast, Math.max(2000, payload.durationMs));
    };

    document.addEventListener('visibilitychange', handleVisibilityChange, true);
    window.addEventListener(
      'pagehide',
      () => {
        if (!document.hidden) void enforceHiddenState();
      },
      true,
    );

    document.addEventListener(
      'play',
      (event) => {
        const media = event.target;
        if (!(media instanceof HTMLMediaElement)) return;
        if (!document.hidden) {
          if (!enforcing) pausedByExtension.delete(media);
          return;
        }

        void getPolicy().then(async (policy) => {
          if (!policy?.enabled || policy.allowed || !policy.shouldPause) return;
          const didPause = pauseMediaElement(media);
          if (didPause) await notifyFramePaused(1);
        });
      },
      true,
    );

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const runtimeMessage = message as RuntimeMessage;
      if (runtimeMessage.type === 'SHOW_TOAST') {
        if (isTopFrame) showToast(runtimeMessage.payload);
        sendResponse({ ok: true });
        return false;
      }

      if (runtimeMessage.type === 'RESUME_MEDIA') {
        void resumeTrackedMedia().then((count) => sendResponse({ ok: true, count }));
        return true;
      }

      return false;
    });

    ctx.onInvalidated(() => {
      document.removeEventListener('visibilitychange', handleVisibilityChange, true);
      removeToast();
    });

    if (document.hidden) void enforceHiddenState();
  },
});
