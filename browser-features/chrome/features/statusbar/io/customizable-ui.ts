// SPDX-License-Identifier: MPL-2.0

/**
 * Statusbar I/O
 *
 * Side-effectful operations for statusbar management.
 */

import { effect } from "@preact/signals";
import {
  STATUSBAR_AREA_ID,
  STATUSBAR_AREA_CONFIG,
  DEFAULT_STATUSBAR_WIDGETS,
} from "../data/mod.ts";
import { showStatusBar } from "../state/mod.ts";

// ============================================================================
// CustomizableUI Management
// ============================================================================

/**
 * Initializes the statusbar area in CustomizableUI
 */
export function initializeCustomizableUI(): void {
  const { CustomizableUI } = window;

  CustomizableUI.registerArea(STATUSBAR_AREA_ID, {
    type: CustomizableUI.TYPE_TOOLBAR,
    defaultPlacements: STATUSBAR_AREA_CONFIG.defaultPlacements,
  });

  const toolbar = document.getElementById(STATUSBAR_AREA_ID);
  if (toolbar) {
    CustomizableUI.registerToolbarNode(toolbar);
  }

  // Add default widgets
  for (const widget of DEFAULT_STATUSBAR_WIDGETS) {
    CustomizableUI.addWidgetToArea(
      widget.id,
      STATUSBAR_AREA_ID,
      widget.position,
    );
  }

  // Move toolbar to bottom of window
  const appcontent = document.querySelector("#appcontent");
  if (appcontent && toolbar) {
    appcontent.appendChild(toolbar);
  }
}

/**
 * Cleanup CustomizableUI registration
 */
export function cleanupCustomizableUI(): void {
  window.CustomizableUI.unregisterArea(STATUSBAR_AREA_ID, true);
}

// ============================================================================
// Status Panel Management
// ============================================================================

/**
 * Sets up the status panel observer that moves the status label
 * Returns cleanup function
 */
export function setupStatusPanel(): () => void {
  let observer: MutationObserver | null = null;

  const cleanup = effect(() => {
    const statuspanelLabel = document.querySelector("#statuspanel-label");
    const statuspanel = document.querySelector<XULElement>("#statuspanel");
    const statusText = document.querySelector<XULElement>("#status-text");

    if (!statuspanelLabel || !statuspanel || !statusText) {
      return;
    }

    // Disconnect previous observer
    observer?.disconnect();

    if (showStatusBar.value) {
      // Move label to statusbar and observe changes
      statusText.appendChild(statuspanelLabel);

      observer = new MutationObserver(() => {
        if (statuspanel.getAttribute("inactive") === "true") {
          statusText.setAttribute("hidden", "true");
        } else {
          statusText.removeAttribute("hidden");
        }
      });

      observer.observe(statuspanel, { attributes: true });
    } else {
      // Move label back to original position
      statuspanel.appendChild(statuspanelLabel);
    }
  });

  return () => {
    cleanup();
    observer?.disconnect();
  };
}

// ============================================================================
// Global API
// ============================================================================

/**
 * Exposes statusbar API to window.gFloorp
 */
export function setupGlobalAPI(): void {
  if (!window.gFloorp) {
    window.gFloorp = {} as any;
  }

  window.gFloorp.statusBar = {
    setShow: (enabled: boolean) => {
      showStatusBar.value = enabled;
    },
  };
}
