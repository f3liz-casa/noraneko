// SPDX-License-Identifier: MPL-2.0

/**
 * Tab Rename Module
 *
 * Allows users to set custom names for tabs that persist across sessions.
 * Custom names are displayed in place of the page title.
 *
 * Directory Structure:
 *   types/  - Type definitions
 *   data/   - Constants
 *   ops/    - Pure operations on tab data
 *   io/     - Persistence and DOM operations
 *   state/  - Reactive state
 *   ui/     - UI for renaming tabs
 */

import { defineModule, type ModuleContext } from "@lib/core";
import {
  loadFromPreferences,
  applyTabName,
  applyAllTabNames,
} from "./io/mod.ts";
import { showTabRenameInput } from "./ui/mod.ts";
import tabRenameStyle from "./ui/styles/tab-rename.css?inline";

// ============================================================================
// Module State
// ============================================================================

let styleElement: HTMLStyleElement | null = null;

// ============================================================================
// Event Handlers
// ============================================================================

function handleTabOpen(event: Event): void {
  const tab = event.target as XULElement;
  applyTabName(tab);
}

function handleTabClose(_event: Event): void {
  // Note: We keep the data in storage in case the tab is restored
  // To clean up on close, call: clearTabName(event.target as XULElement)
}

// ============================================================================
// Module Definition
// ============================================================================

export default defineModule(
  {
    name: "tab-rename",
    hot: import.meta.hot,
  },
  {
    init(ctx) {
      ctx.log.debug("Initializing tab-rename...");

      // Load saved tab names from preferences
      loadFromPreferences();

      // Inject CSS
      styleElement = document.createElement("style");
      styleElement.className = "nora-tab-rename-styles";
      styleElement.textContent = tabRenameStyle;
      document.head.appendChild(styleElement);

      // Expose the showTabRenameInput function globally
      if (!window.gNoraShowTabRenameInput) {
        window.gNoraShowTabRenameInput = showTabRenameInput;
      }

      // Listen for tab events
      window.gBrowser.tabContainer.addEventListener("TabOpen", handleTabOpen);
      window.gBrowser.tabContainer.addEventListener("TabClose", handleTabClose);

      // Apply names to existing tabs
      applyAllTabNames();
    },

    cleanup(ctx) {
      ctx.log.debug("Cleaning up tab-rename...");

      // Remove event listeners
      window.gBrowser.tabContainer.removeEventListener(
        "TabOpen",
        handleTabOpen,
      );
      window.gBrowser.tabContainer.removeEventListener(
        "TabClose",
        handleTabClose,
      );

      // Remove injected CSS
      styleElement?.remove();
      styleElement = null;

      // Remove global function
      if (window.gNoraShowTabRenameInput) {
        delete window.gNoraShowTabRenameInput;
      }
    },
  },
);

// ============================================================================
// Re-exports
// ============================================================================

export type { TabRenameData, TabRenameMap } from "./types/mod.ts";
export { renamedTabs } from "./state/mod.ts";
export {
  setTabName,
  getTabName,
  getOriginalTitle,
  clearTabName,
  applyTabName,
  applyAllTabNames,
} from "./io/mod.ts";
export { showTabRenameInput } from "./ui/mod.ts";
