// SPDX-License-Identifier: MPL-2.0

/**
 * UI Module
 *
 * Rendering utilities and component exports for statusbar.
 */

import { render, h } from "preact";
import { StatusBar } from "./components/StatusBar.tsx";
import { ContextMenuItem } from "./components/ContextMenuItem.tsx";

// ============================================================================
// Component Exports
// ============================================================================

export { StatusBar } from "./components/StatusBar.tsx";
export { ContextMenuItem } from "./components/ContextMenuItem.tsx";

// ============================================================================
// Rendering
// ============================================================================

/**
 * Renders the statusbar into the document body
 */
export function renderStatusBar(): () => void {
  const container = document.body;
  const marker = document.getElementById("customization-container");

  if (!container) {
    console.error("[statusbar] Document body not found");
    return () => {};
  }

  const wrapper = document.createElement("div");
  if (marker) {
    marker.before(wrapper);
  } else {
    container.appendChild(wrapper);
  }

  render(h(StatusBar, {}), wrapper);

  return () => {
    if (wrapper.parentNode) {
      wrapper.remove();
    }
  };
}

/**
 * Renders the context menu item
 */
export function renderContextMenuItem(): () => void {
  const onPopupShowing = (event: Event): void => {
    const target = event.target as Element;
    if (target.id === "toolbar-context-menu") {
      const parent = document.getElementById(
        "viewToolbarsMenuSeparator",
      )?.parentElement;
      const marker = document.getElementById("viewToolbarsMenuSeparator");

      if (parent && marker) {
        const wrapper = document.createElement("div");
        marker.before(wrapper);
        render(h(ContextMenuItem, {}), wrapper);
      }
    }
  };

  const mainPopupSet = document.getElementById("mainPopupSet");
  mainPopupSet?.addEventListener("popupshowing", onPopupShowing);

  return () => {
    mainPopupSet?.removeEventListener("popupshowing", onPopupShowing);
  };
}
