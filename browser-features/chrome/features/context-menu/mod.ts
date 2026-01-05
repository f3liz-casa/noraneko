// SPDX-License-Identifier: MPL-2.0

/**
 * Context Menu Module
 *
 * Hooks up event listeners to content area and tab context menus.
 */

import { defineModule } from "@lib/core";
import {
  getContentAreaContextMenu,
  getTabContextMenu,
  onPopupShowing,
} from "#features-chrome/lib/ui/mod.ts";

export default defineModule(
  {
    name: "context-menu",
    hot: import.meta.hot,
  },
  {
    init(ctx) {
      ctx.log.debug("Initializing context-menu...");

      const contentAreaMenu = getContentAreaContextMenu();
      const tabMenu = getTabContextMenu();

      const onContentPopup = () => onPopupShowing("contentArea");
      const onTabPopup = () => onPopupShowing("tab");

      contentAreaMenu?.addEventListener("popupshowing", onContentPopup);
      tabMenu?.addEventListener("popupshowing", onTabPopup);

      // Return cleanup directly
      return () => {
        contentAreaMenu?.removeEventListener("popupshowing", onContentPopup);
        tabMenu?.removeEventListener("popupshowing", onTabPopup);
      };
    },
  },
);
