/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Sidebar Module - Data-Oriented Programming Style
 *
 * Provides an independent dock bar with icon registration API.
 * Other modules can register icons via EventDispatcher.
 */

import {
  defineModule,
  type ModuleContext,
} from "#features-chrome/utils/base.ts";
import { signal, type Signal } from "@preact/signals";

import {
  setPanelSidebarConfig,
  setPanelSidebarData,
  setSelectedPanelId,
} from "./state/index.ts";

import { _renderDockbar, _renderStyle } from "./ui/Sidebar.tsx";

// ============================================================================
// Types
// ============================================================================

export interface SidebarIconRegistration {
  name: string;
  i18nName: string;
  iconUrl: string;
  callback: () => void | Promise<void>;
}

export interface SidebarEventDispatcher {
  notifyDataChanged(data: any): void;
  notifyConfigChanged(config: any): void;
  selectPanel(panelId: string): void;
  registerSidebarIcon(options: SidebarIconRegistration): void;
  onClicked(iconName: string): Promise<void>;
  registerDataUpdateCallback(callback: (data: any) => void): void;
  registerSelectionChangeCallback(callback: (panelId: string) => void): void;
  unregisterDataUpdateCallback(callback: (data: any) => void): void;
  unregisterSelectionChangeCallback(callback: (panelId: string) => void): void;
  getRegisteredIcons(): SidebarIconRegistration[];
}

// ============================================================================
// Module State - Data
// ============================================================================

const state = {
  registeredIcons: new Map<string, SidebarIconRegistration>(),
  dataUpdateCallbacks: new Set<(data: any) => void>(),
  selectionChangeCallbacks: new Set<(panelId: string) => void>(),
  getIcons: null as Signal<SidebarIconRegistration[]> | null,
  setIcons: null as ((icons: SidebarIconRegistration[]) => void) | null,
};

// ============================================================================
// Internal Functions
// ============================================================================

const renderDockBar = (ctx: ModuleContext): void => {
  if (!document) {
    ctx.log.error("Document is not available, cannot render dock bar");
    return;
  }

  // Inject styles only once
  if (!document.getElementById("sidebar-dock-bar-styles")) {
    _renderStyle();
  }

  // Render dock bar component
  const parentElem = document.getElementById("browser");
  const beforeElem =
    document.getElementById("panel-sidebar-box") ||
    document.getElementById("tabbrowser-tabbox");

  if (parentElem && beforeElem) {
    _renderDockbar(parentElem, beforeElem, state.getIcons!, (iconName) =>
      onClicked(ctx, iconName),
    );
  } else {
    ctx.log.error(
      `Could not find parent or marker element. parentElem: ${!!parentElem}, beforeElem: ${!!beforeElem}`,
    );
  }
};

const onClicked = async (
  ctx: ModuleContext,
  iconName: string,
): Promise<void> => {
  const iconRegistration = state.registeredIcons.get(iconName);
  if (iconRegistration?.callback) {
    try {
      await iconRegistration.callback();
      ctx.log.debug(`Icon ${iconName} callback executed`);
    } catch (error) {
      ctx.log.error(`Error executing callback for icon ${iconName}:`, error);
    }
  } else {
    ctx.log.warn(`No callback registered for icon ${iconName}`);
  }
};

// ============================================================================
// Event Methods - Exposed to other modules
// ============================================================================

const createEventMethods = (ctx: ModuleContext): SidebarEventDispatcher => ({
  registerSidebarIcon(options: SidebarIconRegistration): void {
    state.registeredIcons.set(options.name, options);
    state.setIcons?.(Array.from(state.registeredIcons.values()));
    ctx.log.debug(`Registered icon ${options.name}`);
  },

  async onClicked(iconName: string): Promise<void> {
    return onClicked(ctx, iconName);
  },

  registerDataUpdateCallback(callback: (data: any) => void): void {
    state.dataUpdateCallbacks.add(callback);
    ctx.log.debug("Registered data update callback");
  },

  registerSelectionChangeCallback(callback: (panelId: string) => void): void {
    state.selectionChangeCallbacks.add(callback);
    ctx.log.debug("Registered selection change callback");
  },

  unregisterDataUpdateCallback(callback: (data: any) => void): void {
    state.dataUpdateCallbacks.delete(callback);
  },

  unregisterSelectionChangeCallback(callback: (panelId: string) => void): void {
    state.selectionChangeCallbacks.delete(callback);
  },

  notifyDataChanged(data: any): void {
    setPanelSidebarData(data);
    for (const callback of state.dataUpdateCallbacks) {
      try {
        callback(data);
      } catch (error) {
        ctx.log.error("Error in data update callback:", error);
      }
    }
  },

  notifyConfigChanged(config: any): void {
    setPanelSidebarConfig(config);
  },

  selectPanel(panelId: string): void {
    setSelectedPanelId(panelId);
    for (const callback of state.selectionChangeCallbacks) {
      try {
        callback(panelId);
      } catch (error) {
        ctx.log.error("Error in selection change callback:", error);
      }
    }
  },

  getRegisteredIcons(): SidebarIconRegistration[] {
    return Array.from(state.registeredIcons.values());
  },
});

// ============================================================================
// Module Definition
// ============================================================================

export default defineModule(
  {
    name: "sidebar",
    hot: import.meta.hot,
  },
  {
    init(ctx) {
      ctx.log.debug("Sidebar initializing...");

      // Create signal for icons
      const icons = signal<SidebarIconRegistration[]>([]);
      state.getIcons = icons;
      state.setIcons = (val) => (icons.value = val);

      // Render the dock bar UI
      renderDockBar(ctx);
    },

    cleanup(ctx) {
      ctx.log.debug("Cleaning up sidebar module");

      // Clear all registered data
      state.registeredIcons.clear();
      state.dataUpdateCallbacks.clear();
      state.selectionChangeCallbacks.clear();
      state.getIcons = null;
      state.setIcons = null;

      // Remove DOM elements
      document?.getElementById("sidebar-dock-bar")?.remove();
      document?.getElementById("sidebar-dock-bar-styles")?.remove();
    },

    eventMethods(ctx) {
      return createEventMethods(ctx);
    },
  },
);

// ============================================================================
// Type Declarations
// ============================================================================

declare global {
  interface FeatureModuleEventMethods {
    sidebar: SidebarEventDispatcher;
  }
}
