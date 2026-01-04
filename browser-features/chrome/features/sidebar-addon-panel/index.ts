/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * SidebarAddonPanel Module - Data-Oriented Programming Style
 *
 * Manages panel content (browsers) for the sidebar.
 * Depends on sidebar module to register icons.
 */

import { defineModule, type ModuleContext } from "#features-chrome/utils/base.ts";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import {
  CPanelSidebar,
  PanelSidebarAddModal,
  PanelSidebarElem,
  PanelSidebarFloating,
  SidebarContextMenuElem,
} from "./ui";
import { WebsitePanelWindowChild } from "./panel/website-panel-window-child";
import { migratePanelSidebarData } from "./data/migration.ts";
import iconNotes from "./icons/notes.svg?url";

// ============================================================================
// Module State - Data
// ============================================================================

const state = {
  ctx: null as CPanelSidebar | null,
  panelSidebarElem: null as PanelSidebarElem | null,
  sidebarContextMenuElem: null as SidebarContextMenuElem | null,
  // Store bound callbacks for proper unregistration
  dataUpdateCallback: null as ((data: any) => void) | null,
  selectionChangeCallback: null as ((panelId: string) => void) | null,
};

// ============================================================================
// Internal Functions
// ============================================================================

const onPanelDataUpdate = (ctx: ModuleContext, data: any): void => {
  ctx.log.debug("Received panel data update", data);
  // Update UI directly
};

const onPanelSelectionChange = (ctx: ModuleContext, panelId: string): void => {
  ctx.log.debug("Panel selection changed to", panelId);
  // Update UI directly
};

const onNotesIconActivated = (ctx: ModuleContext): void => {
  ctx.log.debug("Notes icon was activated");
};

const onBookmarksIconActivated = (ctx: ModuleContext): void => {
  ctx.log.debug("Bookmarks icon was activated");
};

const registerExampleSidebarIcons = async (ctx: ModuleContext): Promise<void> => {
  // Register notes icon with callback
  const notesResult = await ctx.events.sidebar.registerSidebarIcon({
    name: "notes",
    i18nName: "sidebar.notes.title",
    iconUrl: iconNotes,
    callback: () => onNotesIconActivated(ctx),
  });

  pipe(
    notesResult,
    E.fold(
      (error) => ctx.log.warn("Failed to register notes icon:", error),
      () => ctx.log.debug("Notes icon registered successfully"),
    ),
  );

  // Register bookmarks icon with callback
  const bookmarksResult = await ctx.events.sidebar.registerSidebarIcon({
    name: "bookmarks",
    i18nName: "sidebar.bookmarks.title",
    iconUrl: "chrome://browser/skin/bookmark.svg",
    callback: () => onBookmarksIconActivated(ctx),
  });

  pipe(
    bookmarksResult,
    E.fold(
      (error) => ctx.log.warn("Failed to register bookmarks icon:", error),
      () => ctx.log.debug("Bookmarks icon registered successfully"),
    ),
  );

  // Register callbacks and store references for cleanup
  state.dataUpdateCallback = (data: any) => onPanelDataUpdate(ctx, data);
  state.selectionChangeCallback = (panelId: string) => onPanelSelectionChange(ctx, panelId);
  
  await ctx.events.sidebar.registerDataUpdateCallback(state.dataUpdateCallback);
  await ctx.events.sidebar.registerSelectionChangeCallback(state.selectionChangeCallback);

  ctx.log.debug("Callbacks registered with sidebar");
};

// ============================================================================
// Module Definition
// ============================================================================

export default defineModule({
  name: "sidebar-addon-panel",
  softDependencies: ["sidebar"],
  hot: import.meta.hot,
}, {
  init(ctx) {
    ctx.log.debug("Initializing sidebar-addon-panel...");
    
    // Run data migration first
    migratePanelSidebarData();

    // Initialize UI components
    state.ctx = new CPanelSidebar();
    WebsitePanelWindowChild.getInstance();
    state.panelSidebarElem = new PanelSidebarElem(state.ctx);
    state.sidebarContextMenuElem = new SidebarContextMenuElem(state.ctx);
    PanelSidebarAddModal.getInstance();
    PanelSidebarFloating.getInstance();

    // Register sidebar icons
    registerExampleSidebarIcons(ctx);
  },

  async cleanup(ctx) {
    ctx.log.debug("Cleaning up sidebar-addon-panel module");
    
    // Unregister callbacks to prevent memory leaks
    if (state.dataUpdateCallback) {
      await ctx.events.sidebar.unregisterDataUpdateCallback(state.dataUpdateCallback);
      state.dataUpdateCallback = null;
    }
    if (state.selectionChangeCallback) {
      await ctx.events.sidebar.unregisterSelectionChangeCallback(state.selectionChangeCallback);
      state.selectionChangeCallback = null;
    }
    
    // Clear references to UI components
    state.ctx = null;
    state.panelSidebarElem = null;
    state.sidebarContextMenuElem = null;
    
    // Remove DOM elements created by this module
    document?.getElementById("panel-sidebar-box")?.remove();
    document?.getElementById("sidebar-context-menu")?.remove();
    document?.getElementById("panel-sidebar-add-modal")?.remove();
    document?.getElementById("panel-sidebar-floating")?.remove();
  },
});

/* Re-export UI components */
export { CPanelSidebar } from "./ui/components/panel-sidebar.tsx";
export { SidebarContextMenuElem } from "./ui/components/sidebar-contextMenu.tsx";
export { PanelSidebarAddModal } from "./ui/components/panel-sidebar-modal.tsx";
export { PanelSidebarFloating } from "./ui/components/floating.tsx";
export { BrowserBox } from "./ui/components/browser-box.tsx";
export { FloatingSplitter } from "./ui/components/floating-splitter.tsx";
export { SidebarHeader } from "./ui/components/sidebar-header.tsx";
export { PanelSidebarButton } from "./ui/components/sidebar-panel-button.tsx";
export { SidebarSelectbox } from "./ui/components/sidebar-selectbox.tsx";
export { SidebarSplitter } from "./ui/components/sidebar-splitter.tsx";
export {
  PanelSidebarElem,
  PanelSidebarElem as Sidebar,
} from "./ui/components/sidebar.tsx";

/* Re-export panel APIs */
export * from "./panel";

/* Styles */
export { default as style } from "./ui/styles/style.css?inline";
