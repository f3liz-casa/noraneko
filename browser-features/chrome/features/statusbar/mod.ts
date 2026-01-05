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

import { registerModule, type ModuleContext } from "@lib/core";
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

// ============================================================================
// Module Definition
// ============================================================================

export default registerModule(
  {
    name: "statusbar",
    state: () => ({
      cleanupFunctions: [] as Array<() => void>,
    }),
    init(ctx) {
      ctx.log.debug("Initializing statusbar...");

      // Setup state sync with preferences
      ctx.state.cleanupFunctions.push(syncWithPreferences());

      // Setup global API
      setupGlobalAPI();

      // Render UI
      ctx.state.cleanupFunctions.push(renderStatusBar());
      ctx.state.cleanupFunctions.push(renderContextMenuItem());

      // Initialize CustomizableUI
      initializeCustomizableUI();

      // Setup status panel observer
      ctx.state.cleanupFunctions.push(setupStatusPanel());
    },

    cleanup(ctx) {
      ctx.log.debug("Cleaning up statusbar...");

      // Run all cleanup functions
      for (const cleanup of ctx.state.cleanupFunctions) {
        cleanup();
      }
      // ctx.state.cleanupFunctions = []; // not needed, instance is discarded

      // Cleanup CustomizableUI
      cleanupCustomizableUI();
    },
  },
  import.meta,
);

// ============================================================================
// Re-exports
// ============================================================================

export { showStatusBar, toggleStatusBar, setStatusBar } from "./state/mod.ts";
export { StatusBar, ContextMenuItem } from "./ui/mod.ts";
export * from "./data/mod.ts";
