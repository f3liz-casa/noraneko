// SPDX-License-Identifier: MPL-2.0

/**
 * Panel Navigator I/O - Navigation coordination between WebsitePanel and legacy sidebar
 *
 * This module provides a unified interface for panel navigation that works with both
 * the new WebsitePanel architecture and the legacy gPanelSidebar.
 */

import type { BrowserElement } from "../types/mod.ts";
import * as panelWindow from "./panel-window.ts";

// ============================================================================
// Navigator State
// ============================================================================

// Reference to legacy panel sidebar (if used)
let gPanelSidebar: any = null;

/**
 * Set the global panel sidebar reference (for legacy support)
 */
export function setGlobalPanelSidebar(sidebar: any): void {
  gPanelSidebar = sidebar;
}

// ============================================================================
// Unified Navigation Commands
// ============================================================================

/**
 * Call a navigation function, preferring WebsitePanel, falling back to legacy
 */
function call<T = void>(
  sideBarId: string,
  websiteFn?: (id: string) => T,
  sidebarFn?: (id: string) => T,
): T | undefined {
  // Try WebsitePanel first
  if (websiteFn) {
    try {
      return websiteFn(sideBarId);
    } catch (e) {
      console.warn("WebsitePanel handler failed, falling back:", e);
    }
  }

  // Fall back to legacy sidebar
  if (gPanelSidebar && sidebarFn) {
    try {
      return sidebarFn(sideBarId);
    } catch (e) {
      console.error("Sidebar handler failed:", e);
    }
  }

  return undefined;
}

/**
 * Navigate back in panel history
 */
export function back(sideBarId: string): void {
  call(
    sideBarId,
    (id) => panelWindow.goBackPanel(id),
    (id) => (gPanelSidebar?.getBrowserElement(id) as BrowserElement)?.goBack(),
  );
}

/**
 * Navigate forward in panel history
 */
export function forward(sideBarId: string): void {
  call(
    sideBarId,
    (id) => panelWindow.goForwardPanel(id),
    (id) =>
      (gPanelSidebar?.getBrowserElement(id) as BrowserElement)?.goForward(),
  );
}

/**
 * Reload panel content
 */
export function reload(sideBarId: string): void {
  call(
    sideBarId,
    (id) => panelWindow.reloadPanel(id),
    (id) => (gPanelSidebar?.getBrowserElement(id) as BrowserElement)?.reload(),
  );
}

/**
 * Navigate to panel's home page
 */
export function goIndexPage(sideBarId: string): void {
  call(
    sideBarId,
    (id) => panelWindow.goIndexPagePanel(id),
    (id) => {
      const browser = gPanelSidebar?.getBrowserElement(id) as
        | BrowserElement
        | undefined;
      if (browser) {
        browser.src = "";
        browser.src = gPanelSidebar?.getPanelData(id)?.url ?? "";
      }
    },
  );
}

/**
 * Toggle mute on panel
 */
export function toggleMute(sideBarId: string): void {
  call(
    sideBarId,
    (id) => panelWindow.toggleMutePanel(id),
    (id) =>
      (gPanelSidebar?.getBrowserElement(id) as BrowserElement)?.toggleMute(),
  );
}

/**
 * Zoom in on panel
 */
export function zoomIn(sideBarId: string): void {
  try {
    panelWindow.zoomInPanel(sideBarId);
  } catch (e) {
    console.error("zoomIn failed:", e);
  }
}

/**
 * Zoom out on panel
 */
export function zoomOut(sideBarId: string): void {
  try {
    panelWindow.zoomOutPanel(sideBarId);
  } catch (e) {
    console.error("zoomOut failed:", e);
  }
}

/**
 * Reset zoom on panel
 */
export function zoomReset(sideBarId: string): void {
  try {
    panelWindow.resetZoomLevelPanel(sideBarId);
  } catch (e) {
    console.error("zoomReset failed:", e);
  }
}
