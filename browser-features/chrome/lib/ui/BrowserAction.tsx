// SPDX-License-Identifier: MPL-2.0
// Browser action (toolbar button) utilities

import { render } from "@nora/preact-xul";
import type { JSX } from "preact";

const { CustomizableUI } = ChromeUtils.importESModule(
  "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs",
);

// ============================================================================
// Types
// ============================================================================

type CustomizableUIArea = typeof CustomizableUI.AREA_NAVBAR;

interface ClickActionButtonOptions {
  widgetId: string;
  l10nId: string | null;
  onCommand: () => void;
  styleElement?: JSX.Element | null;
  area?: CustomizableUIArea;
  position?: number | null;
  onCreated?: ((node: XULElement) => void) | null;
}

interface MenuToolbarButtonOptions {
  widgetId: string;
  l10nId: string;
  targetViewId: string;
  popupElement: JSX.Element;
  onViewShowing?: ((event: Event) => void) | null;
  onCreated?: ((node: XULElement) => void) | null;
  area?: string;
  styleElement?: JSX.Element | null;
  position?: number | null;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Create a simple click action toolbar button
 */
export function createClickActionButton(
  options: ClickActionButtonOptions,
): void {
  const {
    widgetId,
    l10nId,
    onCommand,
    styleElement = null,
    area = CustomizableUI.AREA_NAVBAR,
    position = 0,
    onCreated = null,
  } = options;

  // Add style element for toolbar button icon
  if (styleElement) {
    render(styleElement, document?.head);
  }

  // Check if widget already exists
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
        onCommand?.();
      },
      onCreated: (node: XULElement) => {
        onCreated?.(node);
      },
    });
    CustomizableUI.addWidgetToArea(widgetId, area, position ?? 0);
  })();
}

/**
 * Create a menu-style toolbar button with a popup view
 */
export function createMenuToolbarButton(
  options: MenuToolbarButtonOptions,
): void {
  const {
    widgetId,
    l10nId,
    targetViewId,
    popupElement,
    onViewShowing = null,
    onCreated = null,
    area = CustomizableUI.AREA_NAVBAR,
    styleElement = null,
    position = 0,
  } = options;

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
    onCreated: (node: XULElement) => {
      onCreated?.(node);
    },
    onViewShowing: (event: Event) => {
      onViewShowing?.(event);
    },
  });
  CustomizableUI.addWidgetToArea(widgetId, area, position ?? 0);
}

/**
 * Remove a toolbar button
 */
export function removeToolbarButton(widgetId: string): void {
  try {
    CustomizableUI.destroyWidget(widgetId);
  } catch {
    // Widget might not exist
  }
}
