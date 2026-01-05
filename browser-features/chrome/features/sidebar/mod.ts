// SPDX-License-Identifier: MPL-2.0

/**
 * Sidebar Module - Data-Oriented Programming Style
 *
 * Provides an independent dock bar with icon registration API.
 * Other modules can register icons via EventDispatcher.
 *
 * Directory Structure:
 *   types/   - Type definitions and Valibot schemas
 *   data/    - Constants and default values
 *   ops/     - Pure operations on data
 *   io/      - Side-effectful operations (I/O)
 *   state/   - Reactive signals
 *   ui/      - UI components
 */

import { events } from "../events.ts";
import { registerModule, type ModuleContext } from "@lib/core";
import { signal, type Signal } from "@preact/signals";

import type { IconRegistration } from "./types/mod.ts";

import { setPanels, setConfig, setSelectedPanelId } from "./state/mod.ts";
import { renderDockBar, injectStyles, cleanup as cleanupUI } from "./ui/mod.ts";

// ============================================================================
// Module State
// ============================================================================

const state = {
  registeredIcons: new Map<string, IconRegistration>(),
  dataUpdateCallbacks: new Set<(data: unknown) => void>(),
  selectionChangeCallbacks: new Set<(panelId: string) => void>(),
  iconsSignal: null as Signal<IconRegistration[]> | null,
};

// ============================================================================
// Internal Functions
// ============================================================================

function render(ctx: ModuleContext): void {
  if (!document) {
    ctx.log.error("Document is not available, cannot render dock bar");
    return;
  }

  // Inject styles only once
  if (!document.getElementById("sidebar-dock-bar-styles")) {
    injectStyles();
  }

  // Render dock bar component
  const parentElem = document.getElementById("browser");
  const beforeElem =
    document.getElementById("panel-sidebar-box") ||
    document.getElementById("tabbrowser-tabbox");

  if (parentElem && beforeElem && state.iconsSignal) {
    renderDockBar(parentElem, beforeElem, state.iconsSignal, (iconName) =>
      handleIconClick(ctx, iconName),
    );
  } else {
    ctx.log.error(
      `Could not find parent or marker element. parentElem: ${!!parentElem}, beforeElem: ${!!beforeElem}`,
    );
  }
}

async function handleIconClick(
  ctx: ModuleContext,
  iconName: string,
): Promise<void> {
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
}

// ============================================================================
// Module Definition
// ============================================================================

export default registerModule(
  {
    name: "sidebar",
    init(ctx) {
      ctx.log.debug("Sidebar initializing...");

      // Implement event methods
      events.sidebar.implement({
        registerSidebarIcon(options: IconRegistration): void {
          state.registeredIcons.set(options.name, options);
          if (state.iconsSignal) {
            state.iconsSignal.value = Array.from(
              state.registeredIcons.values(),
            );
          }
          ctx.log.debug(`Registered icon ${options.name}`);
        },

        async onClicked(iconName: string): Promise<void> {
          return handleIconClick(ctx, iconName);
        },

        registerDataUpdateCallback(callback: (data: unknown) => void): void {
          state.dataUpdateCallbacks.add(callback);
          ctx.log.debug("Registered data update callback");
        },

        registerSelectionChangeCallback(
          callback: (panelId: string) => void,
        ): void {
          state.selectionChangeCallbacks.add(callback);
          ctx.log.debug("Registered selection change callback");
        },

        unregisterDataUpdateCallback(callback: (data: unknown) => void): void {
          state.dataUpdateCallbacks.delete(callback);
        },

        unregisterSelectionChangeCallback(
          callback: (panelId: string) => void,
        ): void {
          state.selectionChangeCallbacks.delete(callback);
        },

        notifyDataChanged(data: unknown): void {
          setPanels(data as Parameters<typeof setPanels>[0]);
          for (const callback of state.dataUpdateCallbacks) {
            try {
              callback(data);
            } catch (error) {
              ctx.log.error("Error in data update callback:", error);
            }
          }
        },

        notifyConfigChanged(config: unknown): void {
          setConfig(config as Parameters<typeof setConfig>[0]);
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

        getRegisteredIcons(): IconRegistration[] {
          return Array.from(state.registeredIcons.values());
        },
      });

      // Create signal for icons
      state.iconsSignal = signal<IconRegistration[]>([]);

      // Render the dock bar UI
      render(ctx);
    },

    cleanup(ctx) {
      ctx.log.debug("Cleaning up sidebar module");

      // Clear all registered data
      state.registeredIcons.clear();
      state.dataUpdateCallbacks.clear();
      state.selectionChangeCallbacks.clear();
      state.iconsSignal = null;

      // Remove DOM elements
      cleanupUI();
    },
  },
  import.meta,
);

// ============================================================================
// Re-exports for external consumers
// ============================================================================

// Types
export type {
  Panel,
  Panels,
  Config,
  IconRegistration,
  EventDispatcher,
  EventDispatcher as SidebarEvents,
} from "./types/mod.ts";

// Data
export {
  STATIC_PANELS,
  PREF_NAMES,
  DEFAULT_CONFIG,
  DEFAULT_PANELS,
} from "./data/mod.ts";

// Operations
export {
  parsePanels,
  parseConfig,
  serializePanels,
  serializeConfig,
} from "./ops/mod.ts";

// I/O
export {
  getFavicon,
  getExtensionPanels,
  extensionExists,
  getExtensionIcon,
} from "./io/mod.ts";

// State
export {
  panels,
  setPanels,
  config,
  setConfig,
  selectedPanelId,
  setSelectedPanelId,
} from "./state/mod.ts";
