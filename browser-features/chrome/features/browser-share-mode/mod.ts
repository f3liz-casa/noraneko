// SPDX-License-Identifier: MPL-2.0

/**
 * Browser Share Mode Module
 *
 * A simple feature that provides a "Share Mode" toggle in the Tools menu.
 * When enabled, it hides various UI elements and displays a share mode indicator.
 *
 * Directory Structure:
 *   state/  - Reactive signals for share mode toggle
 *   ui/     - UI components and rendering
 */

import { defineModule, type ModuleContext } from "@lib/core";
import { renderShareModeMenuItem } from "./ui/mod.ts";

// ============================================================================
// Module State
// ============================================================================

let cleanup: (() => void) | null = null;

// ============================================================================
// Module Definition
// ============================================================================

export default defineModule(
  {
    name: "browser-share-mode",
    hot: import.meta.hot,
  },
  {
    init(ctx) {
      ctx.log.debug("Initializing browser-share-mode...");
      cleanup = renderShareModeMenuItem();
    },

    cleanup(ctx) {
      ctx.log.debug("Cleaning up browser-share-mode...");
      cleanup?.();
      cleanup = null;
    },
  },
);

// ============================================================================
// Re-exports
// ============================================================================

export {
  shareModeEnabled,
  toggleShareMode,
  setShareMode,
} from "./state/mod.ts";
export { ShareModeMenuItem } from "./ui/mod.ts";
