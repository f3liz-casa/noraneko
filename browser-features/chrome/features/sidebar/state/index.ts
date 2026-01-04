/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { signal, effect, type Signal } from "@preact/signals";

declare const Services: any;
declare global {
  interface ImportMeta {
    hot: any;
  }
  interface Window {
    gFloorpPanelSidebarCurrentPanel: string | null;
  }
}

import { defaultEnabled } from "../model/defaults.ts";
import { PanelSidebarStaticNames } from "../model/names.ts";
import { type Panels, type PanelSidebarConfig } from "../model/types.ts";
import {
  parsePanelSidebarData,
  serializePanelSidebarData,
  parsePanelSidebarConfig,
  serializePanelSidebarConfig,
} from "../logic/codec.ts";

/**
 * Helpers to create pref-backed signals.
 * Keep implementation explicit and small so behavior is predictable.
 */

// Track disposers for HMR
const disposers: (() => void)[] = [];
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    disposers.forEach((d) => d());
  });
}

/* Generic JSON-pref signal that stores/reads a string pref and keeps it in sync. */
function createJsonPrefSignal<T>(
  prefName: string,
  readTransform: (raw: string) => T,
  writeTransform: (value: T) => string,
): Signal<T> {
  const readFromPref = () => {
    try {
      // Logic relies on writeTransform handling a null/dummy T to produce a default string string
      // if pref doesn't exist.
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

/* Boolean pref signal helper */
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

/* PanelSidebar data */
function createPanelSidebarData(): Signal<Panels> {
  return createJsonPrefSignal<Panels>(
    PanelSidebarStaticNames.panelSidebarDataPrefName,
    parsePanelSidebarData,
    serializePanelSidebarData,
  );
}

/* PanelSidebar config */
function createPanelSidebarConfig(): Signal<PanelSidebarConfig> {
  return createJsonPrefSignal<PanelSidebarConfig>(
    PanelSidebarStaticNames.panelSidebarConfigPrefName,
    parsePanelSidebarConfig,
    serializePanelSidebarConfig,
  );
}

// Exports
// We export the signal itself (as accessor-like) and a setter function to match previous API usage roughly
// Previous API: export const [panelSidebarData, setPanelSidebarData] = ...
// We can export: export const panelSidebarData = sig; export const setPanelSidebarData = (v) => sig.value = v;
// But wait, the previous one exported the accessor function as `panelSidebarData`.
// `panelSidebarData()` to get value.
// `Signal` is an object. `panelSidebarData.value`.
// If I want to minimize refactor elsewhere, I should export a getter function?
// "createSignal" returns [Accessor, Setter].
// Accessor is `() => T`.
// I can wrap the signal.

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

const _panelSidebarData = createPanelSidebarData();
const [_d, _sd] = wrapSignal(_panelSidebarData);
export const panelSidebarData = _d;
export const setPanelSidebarData = _sd;

const _selectedPanelId = signal<string | null>(null);
effect(() => {
  window.gFloorpPanelSidebarCurrentPanel = _selectedPanelId.value;
});
const [_sp, _ssp] = wrapSignal(_selectedPanelId);
export const selectedPanelId = _sp;
export const setSelectedPanelId = _ssp;

const _panelSidebarConfig = createPanelSidebarConfig();
const [_c, _sc] = wrapSignal(_panelSidebarConfig);
export const panelSidebarConfig = _c;
export const setPanelSidebarConfig = _sc;

const _isFloating = signal(false);
const [_f, _sf] = wrapSignal(_isFloating);
export const isFloating = _f;
export const setIsFloating = _sf;

const _isFloatingDragging = signal(false);
const [_fd, _sfd] = wrapSignal(_isFloatingDragging);
export const isFloatingDragging = _fd;
export const setIsFloatingDragging = _sfd;

/* Enable Pref */
function createIsPanelSidebarEnabledSignal(): Signal<boolean> {
  return createBoolPrefSignal(
    PanelSidebarStaticNames.panelSidebarEnabledPrefName,
    defaultEnabled,
  );
}

const _isPanelSidebarEnabled = createIsPanelSidebarEnabledSignal();
const [_e, _se] = wrapSignal(_isPanelSidebarEnabled);
export const isPanelSidebarEnabled = _e;
export const setIsPanelSidebarEnabled = _se;
