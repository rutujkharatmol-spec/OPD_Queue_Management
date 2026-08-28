// src/lib/uiSettings.ts

export interface UiVisibilitySettings {
  showQueueSidebar: boolean;
  showRoomStagedQueue: boolean;
  showDoctorNames: boolean;
  showAutoCallToggle: boolean;
  showQuickActions: boolean;
  showDeptSwitcher: boolean;
}

const UI_SETTINGS_KEY = 'opd_ui_visibility_settings_v3';

export const DEFAULT_UI_SETTINGS: UiVisibilitySettings = {
  showQueueSidebar: true,
  showRoomStagedQueue: false,
  showDoctorNames: false,
  showAutoCallToggle: false,
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
