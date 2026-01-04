// SPDX-License-Identifier: MPL-2.0
// UI utilities module

// Context menu
export {
  addContentAreaMenuItem,
  addTabContextMenuItem,
  addPopupSet,
  onPopupShowing,
  getContentAreaContextMenu,
  getTabContextMenu,
  MenuItem,
} from "./ContextMenu.tsx";

// Browser action (toolbar buttons)
export {
  createClickActionButton,
  createMenuToolbarButton,
  removeToolbarButton,
} from "./BrowserAction.tsx";

// StyleSheet service
export {
  loadStyleSheet,
  isStyleSheetLoaded,
  unloadStyleSheet,
} from "./StyleSheet.ts";
