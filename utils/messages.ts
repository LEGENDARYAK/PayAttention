import type { SiteBehavior, ToastPayload } from './types';

export type RuntimeMessage =
  | { type: 'GET_POLICY'; url: string }
  | { type: 'DOCUMENT_VISIBILITY'; hidden: boolean; url: string; transitionId: number }
  | { type: 'FRAME_PAUSED'; count: number; url: string }
  | { type: 'GET_POPUP_STATE'; tabId: number }
  | { type: 'SET_ENABLED'; enabled: boolean }
  | { type: 'ADD_TEMP_SITE_ALLOWANCE'; tabId: number; hostname: string; minutes: number }
  | { type: 'REMOVE_TEMP_SITE_ALLOWANCE'; tabId: number; hostname: string }
  | { type: 'TOGGLE_TAB_ALLOWANCE'; tabId: number }
  | { type: 'ADD_PERMANENT_SITE_ALLOWANCE'; tabId: number; hostname: string }
  | {
      type: 'SET_CURRENT_SITE_BEHAVIOR';
      tabId: number;
      hostname: string;
      behavior: SiteBehavior | 'default';
    }
  | { type: 'RESUME_TAB_MEDIA'; tabId?: number }
  | { type: 'SETTINGS_CHANGED' }
  | { type: 'OPEN_SHORTCUTS' }
  | { type: 'SHOW_TOAST'; payload: ToastPayload }
  | { type: 'RESUME_MEDIA' };
