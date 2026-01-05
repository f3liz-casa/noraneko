// SPDX-License-Identifier: MPL-2.0

/**
 * Context Menu Module
 *
 * Hooks up event listeners to content area and tab context menus.
 */

import { registerModule } from "@lib/core";
import {
  getContentAreaContextMenu,
  getTabContextMenu,
  onPopupShowing,
} from "#features-chrome/lib/ui/mod.ts";

export default registerModule(
  {
    name: "context-menu",
    state: () => ({
      cleanup: null as (() => void) | null,
    }),
    init(ctx) {
      ctx.log.debug("Initializing context-menu...");

      const contentAreaMenu = getContentAreaContextMenu();
      const tabMenu = getTabContextMenu();

      const onContentPopup = () => onPopupShowing("contentArea");
      const onTabPopup = () => onPopupShowing("tab");

      contentAreaMenu?.addEventListener("popupshowing", onContentPopup);
      tabMenu?.addEventListener("popupshowing", onTabPopup);

      // Store cleanup
      ctx.state.cleanup = () => {
        contentAreaMenu?.removeEventListener("popupshowing", onContentPopup);
        tabMenu?.removeEventListener("popupshowing", onTabPopup);
      };
    },

    cleanup(ctx) {
      ctx.state.cleanup?.();
    },
  },
  import.meta,
);
