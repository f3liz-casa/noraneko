// SPDX-License-Identifier: MPL-2.0

/**
 * Tab Rename I/O
 *
 * Side-effectful operations for persistence and DOM manipulation.
 */

import { PREF_TAB_RENAME_DATA } from "../data/mod.ts";
import {
  renamedTabs,
  setRenamedTabs,
  updateRenamedTabs,
} from "../state/mod.ts";
import {
  getTabId,
  setTabNameInMap,
  getTabNameFromMap,
  getOriginalTitleFromMap,
  clearTabNameInMap,
  serializeTabRenameMap,
  deserializeTabRenameMap,
} from "../ops/mod.ts";

// ============================================================================
// Persistence
// ============================================================================

/**
 * Loads renamed tabs from preferences
 */
export function loadFromPreferences(): void {
  try {
    const data = Services.prefs.getStringPref(PREF_TAB_RENAME_DATA, "{}");
    const map = deserializeTabRenameMap(data);
    setRenamedTabs(map);
  } catch (error) {
    console.error("[tab-rename] Failed to load from preferences:", error);
  }
}

/**
 * Saves renamed tabs to preferences
 */
export function saveToPreferences(): void {
  try {
    const data = serializeTabRenameMap(renamedTabs.value);
    Services.prefs.setStringPref(PREF_TAB_RENAME_DATA, data);
  } catch (error) {
    console.error("[tab-rename] Failed to save to preferences:", error);
  }
}

// ============================================================================
// Tab Operations
// ============================================================================

/**
 * Sets a custom name for a tab
 */
export function setTabName(tab: XULElement, customName: string): void {
  const tabId = getTabId(tab);
  const originalTitle = tab.getAttribute("label") || "";

  updateRenamedTabs((prev) =>
    setTabNameInMap(prev, tabId, customName, originalTitle),
  );
  saveToPreferences();
  applyTabName(tab);
}

/**
 * Gets the custom name for a tab
 */
export function getTabName(tab: XULElement): string | undefined {
  const tabId = getTabId(tab);
  return getTabNameFromMap(renamedTabs.value, tabId);
}

/**
 * Gets the original title for a tab
 */
export function getOriginalTitle(tab: XULElement): string | undefined {
  const tabId = getTabId(tab);
  return (
    getOriginalTitleFromMap(renamedTabs.value, tabId) ||
    tab.getAttribute("label") ||
    undefined
  );
}

/**
 * Clears a custom name for a tab
 */
export function clearTabName(tab: XULElement): void {
  const tabId = getTabId(tab);
  updateRenamedTabs((prev) => clearTabNameInMap(prev, tabId));
  saveToPreferences();
  removeTabNameFromDOM(tab);
}

// ============================================================================
// DOM Operations
// ============================================================================

/**
 * Applies the custom name to the tab DOM
 */
export function applyTabName(tab: XULElement): void {
  const customName = getTabName(tab);

  if (customName) {
    tab.setAttribute("data-customlabel", "");
    try {
      const quoted = JSON.stringify(customName);
      (tab as unknown as HTMLElement).style.setProperty(
        "--customlabel",
        quoted,
      );
    } catch {
      (tab as unknown as HTMLElement).style.setProperty(
        "--customlabel",
        customName,
      );
    }
  } else {
    removeTabNameFromDOM(tab);
  }
}

/**
 * Removes custom name attributes from the tab DOM
 */
export function removeTabNameFromDOM(tab: XULElement): void {
  tab.removeAttribute("data-customlabel");
  (tab as unknown as HTMLElement).style.removeProperty("--customlabel");
}

/**
 * Applies custom names to all tabs
 */
export function applyAllTabNames(): void {
  const tabs = window.gBrowser.tabs;
  for (const tab of tabs) {
    applyTabName(tab);
  }
}
