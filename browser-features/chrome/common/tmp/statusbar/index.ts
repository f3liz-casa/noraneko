// SPDX-License-Identifier: MPL-2.0

import { render } from "@nora/solid-xul";
import { ContextMenu } from "./context-menu";
import { StatusBarElem } from "./statusbar";
import { StatusBarManager } from "./statusbar-manager";
import { defineModule, type ModuleContext } from "#features-chrome/utils/base";

// ============================================================================
// Module State
// ============================================================================

let manager: StatusBarManager | null = null;

export { manager };

// ============================================================================
// Internal Functions
// ============================================================================

const onPopupShowing = (event: Event): void => {
  const target = event.target as Element;
  if (target.id === "toolbar-context-menu") {
    render(
      ContextMenu,
      document.getElementById("viewToolbarsMenuSeparator")!.parentElement,
      {
        marker: document.getElementById("viewToolbarsMenuSeparator")!,
        hotCtx: import.meta.hot,
      },
    );
  }
};

// ============================================================================
// Module Definition
// ============================================================================

export default defineModule({
  name: "statusbar",
  hot: import.meta.hot,
}, {
  init(ctx) {
    ctx.log.debug("Initializing statusbar...");
    
    manager = new StatusBarManager();
    render(StatusBarElem, document.body, {
      marker: document?.getElementById("customization-container"),
    });
    
    const mainPopupSet = document.getElementById("mainPopupSet");
    mainPopupSet?.addEventListener("popupshowing", onPopupShowing);

    manager.init();
  },

  cleanup(ctx) {
    ctx.log.debug("Cleaning up statusbar...");
    
    const mainPopupSet = document.getElementById("mainPopupSet");
    mainPopupSet?.removeEventListener("popupshowing", onPopupShowing);
    
    manager = null;
  },
});
