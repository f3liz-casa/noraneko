// SPDX-License-Identifier: MPL-2.0

// NOTICE: Do not add toolbar buttons code here. Create new folder or file for new toolbar buttons.

import { render } from "@nora/preact-xul";
import type { JSX } from "preact";

const { CustomizableUI } = ChromeUtils.importESModule(
  "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs",
);

export namespace BrowserActionUtils {
  export function createToolbarClickActionButton(
    widgetId: string,
    l10nId: string | null,
    onCommandFunc: () => void,
    styleElement: JSX.Element | null = null,
    area: TCustomizableUIArea = CustomizableUI.AREA_NAVBAR,
    position: number | null = 0,
    onCreatedFunc: null | ((aNode: XULElement) => void) = null,
  ) {
    // Add style Element for toolbar button icon.
    // This render is runnning every open browser window.
    if (styleElement) {
      // Use appendix container to avoid messing with head?
      // Or just render to head.
      // Preact 'render' appends to container.
      // But if we call render multiple times on same container with different vnodes, checks conflict.
      // Since this function is called once per widget, maybe okay.
      // But multiple widgets call this on document.head.
      // We should use a portal or wrapper.
      // Using a wrapper in head is invalid HTML but Firefox might tolerate it or we use Portal.
      // Let's use a dummy container that is not attached, but portal into head?
      // No, just appendChild logic with manual creation if it was static.
      // But it is JSX.

      // Let's try rendering into a specific container for styles if one exists, or create one?
      // <div id="nora-styles" style="display:none">...</div> in body?
      // Styles work in body too.
      // Let's assume document.head usage is intended.
      // I'll just create a container div (invalid in head) but maybe ok?
      // Or just use `render` on `head`.
      render(styleElement, document?.head);
    }

    // Create toolbar button. If widget already exists, return.
    // custom type is temporary widget type. It will be changed to button type.
    const widget = CustomizableUI.getWidget(widgetId);
    if (widget && widget.type !== "custom") {
      return;
    }
    (async () => {
      CustomizableUI.createWidget({
        id: widgetId,
        type: "button",
        tooltiptext: l10nId ? await document.l10n?.formatValue(l10nId) : null,
        label: l10nId ? await document.l10n?.formatValue(l10nId) : null,
        removable: true,
        onCommand: () => {
          onCommandFunc?.();
        },
        onCreated: (aNode: XULElement) => {
          onCreatedFunc?.(aNode);
        },
      });
      CustomizableUI.addWidgetToArea(widgetId, area, position ?? 0);
    })();
  }

  export function createMenuToolbarButton(
    widgetId: string,
    l10nId: string,
    targetViewId: string,
    popupElement: JSX.Element,
    onViewShowingFunc?: ((event: Event) => void) | null,
    onCreatedFunc?: ((aNode: XULElement) => void) | null,
    area: string = CustomizableUI.AREA_NAVBAR,
    styleElement: JSX.Element | null = null,
    position: number | null = 0,
  ) {
    if (styleElement) {
      render(styleElement, document?.head);
    }

    if (popupElement) {
      render(popupElement, document?.getElementById("mainPopupSet")!);
    }

    const widget = CustomizableUI.getWidget(widgetId);
    if (widget && widget.type !== "custom") {
      return;
    }

    CustomizableUI.createWidget({
      id: widgetId,
      type: "view",
      viewId: targetViewId,
      tooltiptext: document?.l10n?.formatValue(l10nId) ?? "",
      label: document?.l10n?.formatValue(l10nId) ?? "",
      removable: true,
      onCreated: (aNode: XULElement) => {
        onCreatedFunc?.(aNode);
      },
      onViewShowing: (event: Event) => {
        onViewShowingFunc?.(event);
      },
    });
    CustomizableUI.addWidgetToArea(widgetId, area, position ?? 0);
  }
}
