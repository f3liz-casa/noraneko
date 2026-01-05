// SPDX-License-Identifier: MPL-2.0

/**
 * Undo Closed Tab Module
 * Adds a customizable toolbar button to undo the last closed tab.
 */

import { defineModule } from "@lib/core";
import { createClickActionButton } from "#features-chrome/lib/ui/mod.ts";
import { addI18nObserver, setLanguage } from "#i18n/config-browser-chrome.ts";
import i18next from "i18next";
import { StyleElement } from "./ui/style.tsx";

const { CustomizableUI } = ChromeUtils.importESModule(
  "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs",
);

const WIDGET_ID = "undo-closed-tab";

export default defineModule(
  {
    name: "undo-closed-tab",
    hot: import.meta.hot,
  },
  {
    init(ctx) {
      createClickActionButton({
        widgetId: WIDGET_ID,
        l10nId: null,
        onCommand: () => window.undoCloseTab(),
        styleElement: StyleElement(),
        area: CustomizableUI.AREA_NAVBAR,
        position: 2,
        onCreated: (node) => {
          // Create custom tooltip
          const tooltip = document.createXULElement("tooltip") as XULElement;
          tooltip.id = "undo-closed-tab-tooltip";
          tooltip.setAttribute("hasbeenopened", "false");
          document.getElementById("mainPopupSet")?.appendChild(tooltip);

          // Link node to tooltip
          node.tooltipText = "";
          node.tooltip = tooltip.id;
          (window as any).setLanguage = setLanguage;

          // Setup i18n
          addI18nObserver((lng) => {
            node.label = i18next.t("undo-closed-tab.label", { lng });
            tooltip.label = i18next.t("undo-closed-tab.tooltiptext", { lng });
          });
        },
      });
    },
  },
);
