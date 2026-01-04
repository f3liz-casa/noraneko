// SPDX-License-Identifier: MPL-2.0

import {
  noraComponent,
  NoraComponentBase,
} from "#features-chrome/utils/base.ts";
import { TabRenameManager } from "./tab-rename-manager.ts";
import { onCleanup } from "solid-js";
import tabRenameStyle from "./tab-rename.css?inline";

export let tabRenameManager: TabRenameManager;

@noraComponent(import.meta.hot)
export default class TabRename extends NoraComponentBase {
  init() {
    this.logger.debug("init");
    tabRenameManager = new TabRenameManager();

    // Inject CSS
    const styleElement = document!.createElement("style");
    styleElement.className = "nora-tab-rename-styles";
    styleElement.textContent = tabRenameStyle;
    document!.head!.appendChild(styleElement);

    // Expose the showTabRenameInput function globally
    if (!window.gNoraShowTabRenameInput) {
      window.gNoraShowTabRenameInput = showTabRenameInput;
    }

    const handleTabOpen = (event: Event) => {
      const tab = event.target as XULElement;
      tabRenameManager.applyTabName(tab);
    };

    const handleTabClose = (_event: Event) => {
      // Note: We keep the data in storage in case the tab is restored
      // If we want to clean up on close, we can call:
      // tabRenameManager.clearTabName(event.target as XULElement);
    };

    window.gBrowser.tabContainer.addEventListener("TabOpen", handleTabOpen);
    window.gBrowser.tabContainer.addEventListener("TabClose", handleTabClose);

    // Apply names to existing tabs
    tabRenameManager.applyAllTabNames();

    onCleanup(() => {
      this.logger.debug("onCleanup");
      window.gBrowser.tabContainer.removeEventListener(
        "TabOpen",
        handleTabOpen,
      );
      window.gBrowser.tabContainer.removeEventListener(
        "TabClose",
        handleTabClose,
      );

      // Remove injected CSS
      styleElement.remove();
    });
  }

  static _metadata() {
    return {
      moduleName: "tab-rename",
      dependencies: [],
      softDependencies: [],
    };
  }
}

export function showTabRenameInput(tab: XULElement): void {
  if (!tab) {
    console.error("[TabRename] No tab provided");
    return;
  }

  const tabLabel = tab.querySelector(".tab-label") as HTMLElement;
  if (!tabLabel) {
    console.error("[TabRename] Tab label not found");
    return;
  }

  const currentCustomName = tabRenameManager.getTabName(tab);
  // Always use the original tab title as the placeholder. If we have a saved
  // original title (the label at the time the tab was first renamed), use
  // that. Otherwise fall back to the current tab label attribute.
  const placeholder =
    tabRenameManager.getOriginalTitle(tab) || tab.getAttribute("label") || "";

  // Create input element
  const input = document!.createElement("input");
  input.type = "text";
  input.className = "tab-rename-input";
  input.value = currentCustomName || "";
  input.placeholder = placeholder;
  input.style.cssText = `
    width: 100%;
    background: var(--toolbar-bgcolor);
    color: var(--toolbar-color);
    border: 1px solid var(--toolbar-field-border-color);
    border-radius: 4px;
    padding: 2px 4px;
    font: inherit;
    outline: none;
  `;

  // Hide label, show input
  (tabLabel.style as any).display = "none";
  const tabContent = tab.querySelector(".tab-content") as HTMLElement;
  if (tabContent) {
    tabContent.querySelector(".tab-label-container")?.before(input);
    input.focus();
    input.select();
  }

  const cleanup = () => {
    if (input.parentNode) {
      input.remove();
    }
    (tabLabel.style as any).display = "";
  };

  const save = () => {
    const newName = input.value.trim();
    tabRenameManager.setTabName(tab, newName);
    cleanup();
  };

  const cancel = () => {
    cleanup();
  };

  input.addEventListener("blur", save);
  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });
}
