// SPDX-License-Identifier: MPL-2.0

/**
 * Tab Rename UI
 *
 * Interactive input for renaming tabs.
 */

import { setTabName, getTabName, getOriginalTitle } from "../io/mod.ts";

// ============================================================================
// Tab Rename Input
// ============================================================================

/**
 * Shows an inline input for renaming a tab
 */
export function showTabRenameInput(tab: XULElement): void {
  if (!tab) {
    console.error("[tab-rename] No tab provided");
    return;
  }

  const tabLabel = tab.querySelector(".tab-label") as HTMLElement;
  if (!tabLabel) {
    console.error("[tab-rename] Tab label not found");
    return;
  }

  const currentCustomName = getTabName(tab);
  const placeholder = getOriginalTitle(tab) || tab.getAttribute("label") || "";

  // Create input element
  const input = document.createElement("input");
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
    setTabName(tab, newName);
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
