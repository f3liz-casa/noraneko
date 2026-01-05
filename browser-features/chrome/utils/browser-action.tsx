// SPDX-License-Identifier: MPL-2.0
// Backward compatibility - re-exports from new lib/ui location

export {
  createClickActionButton,
  createMenuToolbarButton,
  removeToolbarButton,
} from "../lib/ui/mod.ts";

// Legacy namespace export for backward compatibility
export const BrowserActionUtils = {
  createToolbarClickActionButton: (
    widgetId: string,
    l10nId: string | null,
    onCommandFunc: () => void,
    styleElement?: unknown,
    area?: unknown,
    position?: number | null,
    onCreatedFunc?: ((aNode: XULElement) => void) | null,
  ) => {
    const { createClickActionButton } = require("../lib/ui/mod.ts");
    createClickActionButton({
      widgetId,
      l10nId,
      onCommand: onCommandFunc,
      styleElement: styleElement as any,
      area: area as any,
      position,
      onCreated: onCreatedFunc,
    });
  },

  createMenuToolbarButton: (
    widgetId: string,
    l10nId: string,
    targetViewId: string,
    popupElement: unknown,
    onViewShowingFunc?: ((event: Event) => void) | null,
    onCreatedFunc?: ((aNode: XULElement) => void) | null,
    area?: string,
    styleElement?: unknown,
    position?: number | null,
  ) => {
    const { createMenuToolbarButton } = require("../lib/ui/mod.ts");
    createMenuToolbarButton({
      widgetId,
      l10nId,
      targetViewId,
      popupElement: popupElement as any,
      onViewShowing: onViewShowingFunc,
      onCreated: onCreatedFunc,
      area,
      styleElement: styleElement as any,
      position,
    });
  },
};
