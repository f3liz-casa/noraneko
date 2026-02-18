// SPDX-License-Identifier: MPL-2.0
// Backward compatibility - re-exports from new lib/ui location

export {
  addContentAreaMenuItem,
  addTabContextMenuItem,
  addPopupSet,
  onPopupShowing,
  getContentAreaContextMenu,
  getTabContextMenu,
  MenuItem,
} from "../lib/ui/mod.ts";

// Legacy namespace export for backward compatibility
export const ContextMenuUtils = {
  addContextBox: (
    id: string,
    l10n: string,
    renderElementId: string,
    runFunction: () => void,
    checkID: string,
    checkedFunction: () => void,
  ) => {
    const { addContentAreaMenuItem } = require("../lib/ui/mod.ts");
    addContentAreaMenuItem(
      id,
      l10n,
      renderElementId,
      runFunction,
      checkID,
      checkedFunction,
    );
  },

  addContextBoxTab: (
    id: string,
    l10n: string,
    renderElementId: string,
    runFunction: (ev?: Event) => void,
  ) => {
    const { addTabContextMenuItem } = require("../lib/ui/mod.ts");
    addTabContextMenuItem(id, l10n, renderElementId, runFunction);
  },

  contentAreaContextMenu: () => {
    const { getContentAreaContextMenu } = require("../lib/ui/mod.ts");
    return getContentAreaContextMenu();
  },

  tabContextMenu: () => {
    const { getTabContextMenu } = require("../lib/ui/mod.ts");
    return getTabContextMenu();
  },

  addToolbarContentMenuPopupSet: (JSXElem: () => unknown) => {
    const { addPopupSet } = require("../lib/ui/mod.ts");
    addPopupSet(JSXElem);
  },

  onPopupShowing: (type: "contentArea" | "tab") => {
    const { onPopupShowing } = require("../lib/ui/mod.ts");
    onPopupShowing(type);
  },
};
