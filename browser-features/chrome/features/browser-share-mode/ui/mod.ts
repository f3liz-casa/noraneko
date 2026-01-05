// SPDX-License-Identifier: MPL-2.0

/**
 * UI Module
 *
 * Rendering utilities and component exports for share mode.
 */

import { render } from "preact";
import { ShareModeMenuItem } from "./components/ShareModeMenuItem.tsx";

// ============================================================================
// Component Exports
// ============================================================================

export { ShareModeMenuItem } from "./components/ShareModeMenuItem.tsx";

// ============================================================================
// Rendering
// ============================================================================

/**
 * Renders the share mode menu item into the Tools menu
 */
export function renderShareModeMenuItem(): () => void {
  const container = document.querySelector("#menu_ToolsPopup");
  const marker = document.querySelector("#menu_openFirefoxView");

  if (!container || !marker) {
    console.error(
      "[browser-share-mode] Could not find menu container or marker",
    );
    return () => {};
  }

  // Create a wrapper element to insert before the marker
  const wrapper = document.createElement("div");
  marker.before(wrapper);

  render(h(ShareModeMenuItem, {}), wrapper);

  // Return cleanup function
  return () => {
    if (wrapper.parentNode) {
      wrapper.remove();
    }
  };
}
