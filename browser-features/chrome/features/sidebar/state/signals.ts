// SPDX-License-Identifier: MPL-2.0
// Reactive state signals for sidebar

import { signal, effect, type Signal } from "@preact/signals";
import type { Panels, Config } from "../types/mod.ts";
import {
  parsePanels,
  serializePanels,
  parseConfig,
  serializeConfig,
} from "../ops/mod.ts";
import { PREF_NAMES, DEFAULT_ENABLED } from "../data/mod.ts";

declare const Services: {
  prefs: {
    getStringPref(name: string, default_?: string): string;
    setStringPref(name: string, value: string): void;
    getBoolPref(name: string, default_?: boolean): boolean;
    setBoolPref(name: string, value: boolean): void;
    addObserver(name: string, observer: () => void): void;
    removeObserver(name: string, observer: () => void): void;
  };
};

declare global {
  interface Window {
    gFloorpPanelSidebarCurrentPanel: string | null;
  }
}

// ============================================================================
// Signal Factories
// ============================================================================

// Track disposers for HMR
const disposers: (() => void)[] = [];
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    disposers.forEach((d) => d());
  });
}

/**
 * Create a JSON-backed preference signal
 */
function createJsonPrefSignal<T>(
  prefName: string,
  readTransform: (raw: string) => T,
  writeTransform: (value: T) => string,
): Signal<T> {
  const readFromPref = () => {
    try {
      const raw = Services.prefs.getStringPref(
        prefName,
        writeTransform(null as unknown as T),
      );
      return readTransform(raw);
    } catch (e) {
      console.error(`Failed to read pref ${prefName}:`, e);
      return readTransform(writeTransform(null as unknown as T));
    }
  };

  const sig = signal<T>(readFromPref());

  const observer = () => {
    try {
      sig.value = readFromPref();
    } catch (e) {
      console.error(`Pref observer error for ${prefName}:`, e);
    }
  };

  Services.prefs.addObserver(prefName, observer);
  const cleanupObserver = () =>
    Services.prefs.removeObserver(prefName, observer);
  disposers.push(cleanupObserver);

  const cleanupEffect = effect(() => {
    try {
      const str = writeTransform(sig.value);
      Services.prefs.setStringPref(prefName, str);
    } catch (e) {
      console.error(`Failed to write pref ${prefName}:`, e);
    }
  });
  disposers.push(cleanupEffect);

  return sig;
}

/**
 * Create a boolean preference signal
 */
function createBoolPrefSignal(
  prefName: string,
  defaultValue: boolean,
): Signal<boolean> {
  const read = () => Services.prefs.getBoolPref(prefName, defaultValue);

  const sig = signal<boolean>(read());

  const observer = () => {
    sig.value = read();
  };
  Services.prefs.addObserver(prefName, observer);
  disposers.push(() => Services.prefs.removeObserver(prefName, observer));

  const cleanupEffect = effect(() => {
    try {
      Services.prefs.setBoolPref(prefName, sig.value);
    } catch (e) {
      console.error(`Failed to write bool pref ${prefName}:`, e);
    }
  });
  disposers.push(cleanupEffect);

  return sig;
}

/**
 * Wrap a signal with getter/setter functions (SolidJS-style API)
 */
function wrapSignal<T>(
  sig: Signal<T>,
): [() => T, (v: T | ((prev: T) => T)) => void] {
  return [
    () => sig.value,
    (v: T | ((prev: T) => T)) => {
      if (typeof v === "function") {
        sig.value = (v as (prev: T) => T)(sig.value);
      } else {
        sig.value = v;
      }
    },
  ];
}

// ============================================================================
// Exported Signals
// ============================================================================

// Panels data signal
const _panelsSignal = createJsonPrefSignal<Panels>(
  PREF_NAMES.data,
  parsePanels,
  serializePanels,
);
const [_getPanels, _setPanels] = wrapSignal(_panelsSignal);
export const panels = _getPanels;
export const setPanels = _setPanels;
export const panelsSignal = _panelsSignal;

// Selected panel ID signal
const _selectedPanelIdSignal = signal<string | null>(null);
effect(() => {
  window.gFloorpPanelSidebarCurrentPanel = _selectedPanelIdSignal.value;
});
const [_getSelectedPanelId, _setSelectedPanelId] = wrapSignal(
  _selectedPanelIdSignal,
);
export const selectedPanelId = _getSelectedPanelId;
export const setSelectedPanelId = _setSelectedPanelId;
export const selectedPanelIdSignal = _selectedPanelIdSignal;

// Config signal
const _configSignal = createJsonPrefSignal<Config>(
  PREF_NAMES.config,
  parseConfig,
  serializeConfig,
);
const [_getConfig, _setConfig] = wrapSignal(_configSignal);
export const config = _getConfig;
export const setConfig = _setConfig;
export const configSignal = _configSignal;

// Floating state signals
const _isFloatingSignal = signal(false);
const [_getIsFloating, _setIsFloating] = wrapSignal(_isFloatingSignal);
export const isFloating = _getIsFloating;
export const setIsFloating = _setIsFloating;

const _isFloatingDraggingSignal = signal(false);
const [_getIsFloatingDragging, _setIsFloatingDragging] = wrapSignal(
  _isFloatingDraggingSignal,
);
export const isFloatingDragging = _getIsFloatingDragging;
export const setIsFloatingDragging = _setIsFloatingDragging;

// Enabled preference signal
const _enabledSignal = createBoolPrefSignal(
  PREF_NAMES.enabled,
  DEFAULT_ENABLED,
);
const [_getEnabled, _setEnabled] = wrapSignal(_enabledSignal);
export const enabled = _getEnabled;
export const setEnabled = _setEnabled;
