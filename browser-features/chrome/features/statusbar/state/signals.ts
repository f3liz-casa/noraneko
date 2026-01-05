// SPDX-License-Identifier: MPL-2.0

/**
 * Statusbar State
 *
 * Reactive state for statusbar visibility.
 */

import { signal, effect } from "@preact/signals";
import {
  PREF_STATUSBAR_ENABLE,
  DEFAULT_STATUSBAR_ENABLED,
} from "../data/mod.ts";

// ============================================================================
// Signals
// ============================================================================

export const showStatusBar = signal<boolean>(
  Services.prefs.getBoolPref(PREF_STATUSBAR_ENABLE, DEFAULT_STATUSBAR_ENABLED),
);

// ============================================================================
// Preference Sync
// ============================================================================

/**
 * Synchronizes the signal with preferences (bidirectional)
 */
export function syncWithPreferences(): () => void {
  // Sync signal -> pref
  const stopEffect = effect(() => {
    Services.prefs.setBoolPref(PREF_STATUSBAR_ENABLE, showStatusBar.value);
  });

  // Sync pref -> signal
  const prefObserver = () => {
    showStatusBar.value = Services.prefs.getBoolPref(PREF_STATUSBAR_ENABLE);
  };

  Services.prefs.addObserver(PREF_STATUSBAR_ENABLE, prefObserver);

  // Return cleanup function
  return () => {
    stopEffect();
    Services.prefs.removeObserver(PREF_STATUSBAR_ENABLE, prefObserver);
  };
}

// ============================================================================
// Actions
// ============================================================================

export function toggleStatusBar(): void {
  showStatusBar.value = !showStatusBar.value;
}

export function setStatusBar(enabled: boolean): void {
  showStatusBar.value = enabled;
}
