// SPDX-License-Identifier: MPL-2.0

/**
 * Reverse Sidebar Position Module
 *
 * Provides a toolbar button to reverse the sidebar position.
 * Currently disabled/commented out in the original implementation.
 *
 * Directory Structure:
 *   ui/     - UI components and styles
 */

import { registerModule, type ModuleContext } from "@lib/core";

// ============================================================================
// Module Definition
// ============================================================================

export default registerModule(
  {
    name: "reverse-sidebar-position",
    init(ctx) {
      ctx.log.debug("Initializing reverse-sidebar-position...");
      // Feature is currently disabled
      // To enable, implement toolbar button creation using BrowserActionUtils
    },

    cleanup(ctx) {
      ctx.log.debug("Cleaning up reverse-sidebar-position...");
      // Cleanup logic when feature is implemented
    },
  },
  import.meta,
);
