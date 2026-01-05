// SPDX-License-Identifier: MPL-2.0

/**
 * Panel Window I/O - Side-effectful operations on panel windows
 *
 * This module provides I/O operations for manipulating panel browser windows.
 * All functions here cause side effects (DOM manipulation, window access, etc).
 */

import { setPanels } from "../../sidebar/state/mod.ts";
import type { Panel, Panels } from "../../sidebar/types/mod.ts";
import type { XULBrowserElement } from "../types/mod.ts";

// ============================================================================
// Window Utilities
// ============================================================================

/**
 * Get the associated window for a webpanel by ID
 */
export function getWindowByWebpanelId(
  id: string,
  parentWindow: Window,
): Window {
  const webpanelBrowserId = `sidebar-panel-${id}`;
  const webpanelBrowser = parentWindow?.document?.getElementById(
    webpanelBrowserId,
  ) as XULBrowserElement | null;

  if (!webpanelBrowser) {
    throw new Error("Target panel window not found");
  }

  return webpanelBrowser.browsingContext.associatedWindow;
}

/**
 * Execute a side-effectful operation safely, logging errors
 */
function safeExecute<T = void>(fn: () => T, errorMsg: string): T | undefined {
  try {
    return fn();
  } catch (e) {
    console.error(errorMsg, e);
    return undefined;
  }
}

// ============================================================================
// Panel Audio Operations
// ============================================================================

/**
 * Toggle mute state for a panel
 */
export function toggleMutePanel(webpanelId: string): void {
  safeExecute(() => {
    const targetPanelWindow = getWindowByWebpanelId(webpanelId, window);
    const tab = (targetPanelWindow as any).gBrowser.selectedTab;
    tab.linkedBrowser.audioMuted = !tab.linkedBrowser.audioMuted;
  }, "Failed to toggle mute for webpanel");
}

// ============================================================================
// Panel Navigation Operations
// ============================================================================

/**
 * Reload a panel
 */
export function reloadPanel(webpanelId: string): void {
  safeExecute(() => {
    const targetPanelWindow = getWindowByWebpanelId(webpanelId, window);
    (targetPanelWindow as any).gBrowser.selectedTab.linkedBrowser.reload();
  }, "Failed to reload webpanel");
}

/**
 * Go forward in panel history
 */
export function goForwardPanel(webpanelId: string): void {
  safeExecute(() => {
    const targetPanelWindow = getWindowByWebpanelId(webpanelId, window);
    (targetPanelWindow as any).gBrowser.selectedTab.linkedBrowser.goForward();
  }, "Failed to go forward in webpanel");
}

/**
 * Go back in panel history
 */
export function goBackPanel(webpanelId: string): void {
  safeExecute(() => {
    const targetPanelWindow = getWindowByWebpanelId(webpanelId, window);
    (targetPanelWindow as any).gBrowser.selectedTab.linkedBrowser.goBack();
  }, "Failed to go back in webpanel");
}

/**
 * Navigate to the home/index page of a panel
 */
export function goIndexPagePanel(webpanelId: string): void {
  safeExecute(() => {
    const targetPanelWindow = getWindowByWebpanelId(webpanelId, window);
    const uri = (targetPanelWindow as any).bmsLoadedURI;
    (targetPanelWindow as any).gBrowser.loadURI(Services.io.newURI(uri), {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    });
  }, "Failed to go to index page in webpanel");
}

// ============================================================================
// Panel Zoom Operations
// ============================================================================

/**
 * Save zoom level to panel data
 */
function saveZoomLevel(webpanelId: string, zoomLevel: number): void {
  setPanels((prev: Panels) => {
    return prev.map((panel: Panel) =>
      panel.id === webpanelId ? { ...panel, zoomLevel } : panel,
    );
  });
}

/**
 * Zoom in on a panel
 */
export function zoomInPanel(webpanelId: string): void {
  safeExecute(() => {
    const targetPanelWindow = getWindowByWebpanelId(webpanelId, window);
    (targetPanelWindow as any).ZoomManager.enlarge();
    saveZoomLevel(webpanelId, (targetPanelWindow as any).ZoomManager.zoom);
  }, "Failed to zoom in webpanel");
}

/**
 * Zoom out on a panel
 */
export function zoomOutPanel(webpanelId: string): void {
  safeExecute(() => {
    const targetPanelWindow = getWindowByWebpanelId(webpanelId, window);
    (targetPanelWindow as any).ZoomManager.reduce();
    saveZoomLevel(webpanelId, (targetPanelWindow as any).ZoomManager.zoom);
  }, "Failed to zoom out webpanel");
}

/**
 * Reset zoom level on a panel
 */
export function resetZoomLevelPanel(webpanelId: string): void {
  safeExecute(() => {
    const targetPanelWindow = getWindowByWebpanelId(webpanelId, window);
    (targetPanelWindow as any).ZoomManager.zoom = 1;
    saveZoomLevel(webpanelId, 1);
  }, "Failed to reset zoom in webpanel");
}
