// SPDX-License-Identifier: MPL-2.0

/**
 * Statusbar Module
 *
 * Provides a customizable statusbar at the bottom of the browser window.
 * The statusbar can display various widgets and the status panel text.
 *
 * Directory Structure:
 *   data/   - Constants and defaults
 *   state/  - Reactive signals with pref sync
 *   io/     - CustomizableUI and DOM operations
 *   ui/     - UI components and rendering
 */

import { defineModule, type ModuleContext } from "@lib/core";
import { syncWithPreferences } from "./state/mod.ts";
import {
  initializeCustomizableUI,
  cleanupCustomizableUI,
  setupStatusPanel,
  setupGlobalAPI,
} from "./io/mod.ts";
import { renderStatusBar, renderContextMenuItem } from "./ui/mod.ts";

// ============================================================================
// Module State
// ============================================================================

const cleanupFunctions: Array<() => void> = [];

// ============================================================================
// Module Definition
// ============================================================================

export default defineModule(
  {
    name: "statusbar",
    hot: import.meta.hot,
  },
  {
    init(ctx) {
      ctx.log.debug("Initializing statusbar...");

      // Setup state sync with preferences
      cleanupFunctions.push(syncWithPreferences());

      // Setup global API
      setupGlobalAPI();

      // Render UI
      cleanupFunctions.push(renderStatusBar());
      cleanupFunctions.push(renderContextMenuItem());

      // Initialize CustomizableUI
      initializeCustomizableUI();

      // Setup status panel observer
      cleanupFunctions.push(setupStatusPanel());
    },

    cleanup(ctx) {
      ctx.log.debug("Cleaning up statusbar...");

      // Run all cleanup functions
      for (const cleanup of cleanupFunctions) {
        cleanup();
      }
      cleanupFunctions.length = 0;

      // Cleanup CustomizableUI
      cleanupCustomizableUI();
    },
  },
);

// ============================================================================
// Re-exports
// ============================================================================

export { showStatusBar, toggleStatusBar, setStatusBar } from "./state/mod.ts";
export { StatusBar, ContextMenuItem } from "./ui/mod.ts";
export * from "./data/mod.ts";
