// SPDX-License-Identifier: MPL-2.0

/**
 * Sidebar Addon Panel Module - Data-Oriented Programming Style
 *
 * Manages panel content (browsers) for the sidebar.
 * Depends on sidebar module to register icons.
 *
 * Directory Structure:
 *   types/   - Type definitions
 *   data/    - Constants, defaults, and migration
 *   ops/     - Pure operations on data
 *   io/      - Side-effectful operations (I/O)
 *   state/   - Module state management
 *   ui/      - UI components
 */

import { defineModule, type ModuleContext } from "@lib/core";

// Internal imports
import {
  migratePanelSidebarData,
  ICON_NOTES,
  ICON_BOOKMARKS,
} from "./data/mod.ts";
import {
  state,
  resetState,
  setContext,
  setPanelSidebarElem,
  setSidebarContextMenuElem,
  setDataUpdateCallback,
  setSelectionChangeCallback,
  createDataUpdateHandler,
  createSelectionChangeHandler,
} from "./state/mod.ts";
import {
  CPanelSidebar,
  PanelSidebarElem,
  SidebarContextMenuElem,
  PanelSidebarAddModal,
  PanelSidebarFloating,
} from "./ui/mod.ts";
import { WebsitePanelWindowChild } from "./io/mod.ts";

// ============================================================================
// Internal Functions
// ============================================================================

function onNotesIconActivated(ctx: ModuleContext): void {
  ctx.log.debug("Notes icon was activated");
}

function onBookmarksIconActivated(ctx: ModuleContext): void {
  ctx.log.debug("Bookmarks icon was activated");
}

async function registerExampleSidebarIcons(ctx: ModuleContext): Promise<void> {
  // Register notes icon with callback
  ctx.events.sidebar.registerSidebarIcon({
    name: "notes",
    i18nName: "sidebar.notes.title",
    iconUrl: ICON_NOTES,
    callback: () => onNotesIconActivated(ctx),
  });
  ctx.log.debug("Notes icon registered");

  // Register bookmarks icon with callback
  ctx.events.sidebar.registerSidebarIcon({
    name: "bookmarks",
    i18nName: "sidebar.bookmarks.title",
    iconUrl: ICON_BOOKMARKS,
    callback: () => onBookmarksIconActivated(ctx),
  });
  ctx.log.debug("Bookmarks icon registered");

  // Register callbacks and store references for cleanup
  const dataUpdateCallback = createDataUpdateHandler(ctx);
  const selectionChangeCallback = createSelectionChangeHandler(ctx);

  setDataUpdateCallback(dataUpdateCallback);
  setSelectionChangeCallback(selectionChangeCallback);

  ctx.events.sidebar.registerDataUpdateCallback(dataUpdateCallback);
  ctx.events.sidebar.registerSelectionChangeCallback(selectionChangeCallback);

  ctx.log.debug("Callbacks registered with sidebar");
}

function cleanupDOMElements(): void {
  document?.getElementById("panel-sidebar-box")?.remove();
  document?.getElementById("sidebar-context-menu")?.remove();
  document?.getElementById("panel-sidebar-add-modal")?.remove();
  document?.getElementById("panel-sidebar-floating")?.remove();
}

// ============================================================================
// Module Definition
// ============================================================================

export default defineModule(
  {
    name: "sidebar-addon-panel",
    softDependencies: ["sidebar"],
    hot: import.meta.hot,
  },
  {
    init(ctx) {
      ctx.log.debug("Initializing sidebar-addon-panel...");

      // Run data migration first
      migratePanelSidebarData();

      // Initialize UI components
      const panelSidebar = new CPanelSidebar();
      setContext(panelSidebar);

      WebsitePanelWindowChild.getInstance();

      const panelSidebarElem = new PanelSidebarElem(panelSidebar);
      setPanelSidebarElem(panelSidebarElem);

      const sidebarContextMenuElem = new SidebarContextMenuElem(panelSidebar);
      setSidebarContextMenuElem(sidebarContextMenuElem);

      PanelSidebarAddModal.getInstance();
      PanelSidebarFloating.getInstance();

      // Register sidebar icons
      registerExampleSidebarIcons(ctx);
    },

    async cleanup(ctx) {
      ctx.log.debug("Cleaning up sidebar-addon-panel module");

      // Unregister callbacks to prevent memory leaks
      if (state.dataUpdateCallback) {
        ctx.events.sidebar.unregisterDataUpdateCallback(
          state.dataUpdateCallback,
        );
      }
      if (state.selectionChangeCallback) {
        ctx.events.sidebar.unregisterSelectionChangeCallback(
          state.selectionChangeCallback,
        );
      }

      // Reset state
      resetState();

      // Remove DOM elements created by this module
      cleanupDOMElements();
    },
  },
);

// ============================================================================
// Re-exports for external consumers
// ============================================================================

// Types
export type * from "./types/mod.ts";

// Data
export {
  migratePanelSidebarData,
  ICON_NOTES,
  ICON_BOOKMARKS,
} from "./data/mod.ts";

// Operations
export * from "./ops/mod.ts";

// I/O
export {
  // Panel window operations
  toggleMutePanel,
  reloadPanel,
  goForwardPanel,
  goBackPanel,
  goIndexPagePanel,
  zoomInPanel,
  zoomOutPanel,
  resetZoomLevelPanel,
  // Panel child operations
  WebsitePanelWindowChild,
  // Navigator
  back,
  forward,
  reload,
  goIndexPage,
  toggleMute,
  zoomIn,
  zoomOut,
  zoomReset,
} from "./io/mod.ts";

// State
export {
  state,
  resetState,
  type DataUpdateCallback,
  type SelectionChangeCallback,
} from "./state/mod.ts";

// UI components
export {
  CPanelSidebar,
  PanelSidebarElem,
  PanelSidebarElem as Sidebar,
  SidebarContextMenuElem,
  PanelSidebarAddModal,
  PanelSidebarFloating,
  BrowserBox,
  FloatingSplitter,
  SidebarHeader,
  PanelSidebarButton,
  PanelSidebarButton as SidebarPanelButton,
  SidebarSelectbox,
  SidebarSplitter,
  style,
} from "./ui/mod.ts";
