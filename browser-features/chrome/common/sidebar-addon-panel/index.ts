/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * SidebarAddonPanel Module
 *
 * This module manages the panel content (browsers) for the sidebar.
 * It depends on the sidebar module to register icons in the dock bar.
 *
 * Architecture:
 * - sidebar module: Renders dock bar, exposes icon registration API
 * - sidebar-addon-panel module: Manages panel browsers, registers icons via sidebar EventDispatcher
 *
 * The separation allows:
 * - sidebar to be independent and reusable for other dock-like UIs
 * - sidebar-addon-panel to focus on panel management
 * - Other modules to also register icons in the dock if needed
 */

import { component } from "#features-chrome/utils/base";
import type { EventDispatcherDependencies } from "../event-dispatcher-interfaces.ts";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import { onCleanup } from "solid-js";
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

@component({
  moduleName: "sidebar-addon-panel",
  softDependencies: ["sidebar"],
  hot: import.meta.hot,
})
export default class SidebarAddonPanel {
  // Type-safe EventDispatcher access - Either handles both available and missing modules
  protected events!: EventDispatcherDependencies<["sidebar"]>;
  protected logger!: ConsoleInstance;

  private ctx: CPanelSidebar | null = null;
  private panelSidebarElem: PanelSidebarElem | null = null;
  private sidebarContextMenuElem: SidebarContextMenuElem | null = null;

  init(): void {
    // Run data migration first
    migratePanelSidebarData();

    // Initialize UI components
    this.ctx = new CPanelSidebar();
    WebsitePanelWindowChild.getInstance();
    this.panelSidebarElem = new PanelSidebarElem(this.ctx);
    this.sidebarContextMenuElem = new SidebarContextMenuElem(this.ctx);
    PanelSidebarAddModal.getInstance();
    PanelSidebarFloating.getInstance();

    // Register sidebar icons based on panels
    this.registerPanelIcons();

    // Set up cleanup
    onCleanup(() => {
      this.cleanup();
    });
  }

  /**
   * Cleanup method for hotswapping support.
   * Removes all UI components and clears all state.
   */
  cleanup(): void {
    this.logger?.debug("Cleaning up sidebar-addon-panel module");
    
    // Clear references to UI components
    this.ctx = null;
    this.panelSidebarElem = null;
    this.sidebarContextMenuElem = null;
    
    // Remove DOM elements created by this module
    document?.getElementById("panel-sidebar-box")?.remove();
    document?.getElementById("sidebar-context-menu")?.remove();
    document?.getElementById("panel-sidebar-add-modal")?.remove();
    document?.getElementById("panel-sidebar-floating")?.remove();
  }

  // Register icons for each panel in the dock bar
  private async registerPanelIcons(): Promise<void> {
    // This is a placeholder for the real implementation
    // In the real implementation, this would:
    // 1. Get the list of panels from panelSidebarData
    // 2. Register an icon for each panel
    // 3. Handle panel click to show/hide the panel

    // For now, keep the example implementation as a reference
    this.registerExampleSidebarIcons();
  }

  // Event methods that can be called by sidebar via registered callbacks
  private onPanelDataUpdate(data: any): void {
    // Handle panel data updates from sidebar core
    console.debug("SidebarAddonPanel: Received panel data update", data);
    // Update UI components with new data directly
    if (this.ctx) {
      // Update UI directly - no custom events needed
      // The actual UI update logic would go here
    }
  }

  private onPanelSelectionChange(panelId: string): void {
    // Handle panel selection changes from sidebar core
    console.debug("SidebarAddonPanel: Panel selection changed to", panelId);
    // Update UI directly - no custom events needed
    if (this.ctx) {
      // The actual UI update logic would go here
    }
  }

  // Example method that demonstrates registering sidebar icons
  // Note: Function references work here because the EventDispatcher system in this codebase
  // is not a traditional serialized RPC - it's a typed event dispatching system
  // where all modules run in the same JavaScript context. The callbacks are
  // direct function references, not serialized over a boundary.
  private async registerExampleSidebarIcons(): Promise<void> {
    // Register notes icon with callback
    const notesResult = await this.events.sidebar.registerSidebarIcon({
      name: "notes",
      i18nName: "sidebar.notes.title",
      iconUrl: iconNotes,
      callback: () => this.onNotesIconActivated(), // Direct callback
    });

    pipe(
      notesResult,
      E.fold(
        (error) => console.warn("Failed to register notes icon:", error),
        () => console.debug("Notes icon registered successfully"),
      ),
    );

    // Register bookmarks icon with callback
    const bookmarksResult = await this.events.sidebar.registerSidebarIcon({
      name: "bookmarks",
      i18nName: "sidebar.bookmarks.title",
      iconUrl: "chrome://browser/skin/bookmark.svg",
      callback: () => this.onBookmarksIconActivated(), // Direct callback
    });

    pipe(
      bookmarksResult,
      E.fold(
        (error) => console.warn("Failed to register bookmarks icon:", error),
        () => console.debug("Bookmarks icon registered successfully"),
      ),
    );

    // Register callbacks for data updates and selection changes
    const dataCallbackResult = await this.events.sidebar
      .registerDataUpdateCallback((data: any) => this.onPanelDataUpdate(data));

    const selectionCallbackResult = await this.events.sidebar
      .registerSelectionChangeCallback(
        (panelId: string) => this.onPanelSelectionChange(panelId),
      );

    console.debug("SidebarAddonPanel: Callbacks registered with sidebar");
  }

  // Example callback methods that would be triggered by sidebar icon activation
  private onNotesIconActivated(): void {
    console.debug("SidebarAddonPanel: Notes icon was activated");
    // Handle notes panel activation - this would be called via EventDispatcher from sidebar module
  }

  private onBookmarksIconActivated(): void {
    console.debug("SidebarAddonPanel: Bookmarks icon was activated");
    // Handle bookmarks panel activation - this would be called via EventDispatcher from sidebar module
  }

  // Example method to demonstrate icon click handling
  public async handleIconClick(iconName: string): Promise<void> {
    console.debug(`SidebarAddonPanel: Handling click for icon: ${iconName}`);
    const result = await this.events.sidebar.onClicked(iconName);

    // Handle the Either result
    pipe(
      result,
      E.fold(
        (error) => console.error("Failed to handle icon click:", error),
        () => console.debug("Icon click handled successfully"),
      ),
    );
  }
}

// Register this module in the global registry for automatic type inference
declare global {
  interface FeatureModuleRegistry {
    SidebarAddonPanel: typeof SidebarAddonPanel;
  }
}

/* Re-export UI components for backward compatibility */
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

/* Styles (now sourced from our own styles directory) */
export { default as style } from "./ui/styles/style.css?inline";
