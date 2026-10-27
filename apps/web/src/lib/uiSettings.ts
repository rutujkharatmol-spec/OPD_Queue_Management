// src/lib/uiSettings.ts
import { useEffect, useState } from 'react';

export interface UiVisibilitySettings {
  /** Simple UI: hides advanced controls everywhere and keeps only the everyday actions. */
  simpleMode: boolean;
  showQueueSidebar: boolean;
  showRoomStagedQueue: boolean;
  showDoctorNames: boolean;
  showAutoCallToggle: boolean;
  showQuickActions: boolean;
  showDeptSwitcher: boolean;
}

const UI_SETTINGS_KEY = 'opd_ui_visibility_settings_v3';

export const DEFAULT_UI_SETTINGS: UiVisibilitySettings = {
  simpleMode: true,
  showQueueSidebar: true,
  showRoomStagedQueue: false,
  showDoctorNames: false,
  showAutoCallToggle: true,
  showQuickActions: false,
  showDeptSwitcher: true,
};

/**
 * Gets the current UI visibility settings from localStorage.
 */
export function getUiVisibilitySettings(): UiVisibilitySettings {
  if (typeof window === 'undefined') return DEFAULT_UI_SETTINGS;
  try {
    const raw = localStorage.getItem(UI_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_UI_SETTINGS,
        ...parsed,
      };
    }
  } catch {
    // fallback
  }
  return DEFAULT_UI_SETTINGS;
}

/**
 * Updates a specific UI visibility toggle or replaces all settings.
 */
export function setUiVisibilitySettings(settings: Partial<UiVisibilitySettings>): UiVisibilitySettings {
  if (typeof window === 'undefined') return DEFAULT_UI_SETTINGS;
  try {
    const current = getUiVisibilitySettings();
    const updated: UiVisibilitySettings = {
      ...current,
      ...settings,
    };
    localStorage.setItem(UI_SETTINGS_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('opd-ui-visibility-updated', { detail: updated }));
    return updated;
  } catch {
    return DEFAULT_UI_SETTINGS;
  }
}

/**
 * React hook: true while Simple UI is on. Stays in sync with the navbar toggle
 * (same tab) and with other open tabs.
 */
export function useSimpleMode(): boolean {
  const [simple, setSimple] = useState(DEFAULT_UI_SETTINGS.simpleMode);
  useEffect(() => {
    const sync = () => setSimple(getUiVisibilitySettings().simpleMode);
    sync();
    window.addEventListener('opd-ui-visibility-updated', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('opd-ui-visibility-updated', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return simple;
}

/**
 * Resets all UI visibility settings back to default.
 */
export function resetUiVisibilitySettings(): UiVisibilitySettings {
  if (typeof window === 'undefined') return DEFAULT_UI_SETTINGS;
  try {
    localStorage.removeItem(UI_SETTINGS_KEY);
    window.dispatchEvent(new CustomEvent('opd-ui-visibility-updated', { detail: DEFAULT_UI_SETTINGS }));
    return DEFAULT_UI_SETTINGS;
  } catch {
    return DEFAULT_UI_SETTINGS;
  }
}
