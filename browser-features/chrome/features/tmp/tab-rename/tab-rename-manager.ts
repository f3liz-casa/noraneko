// SPDX-License-Identifier: MPL-2.0

import { createSignal } from "solid-js";

export interface TabRenameData {
  tabId: string;
  customName: string;
  originalTitle: string;
}

export class TabRenameManager {
  private static readonly PREF_KEY = "noraneko.tabRename.data";
  private _renamedTabs = createSignal<Map<string, TabRenameData>>(new Map());
  renamedTabs = this._renamedTabs[0];
  setRenamedTabs = this._renamedTabs[1];

  constructor() {
    this.loadFromPrefs();
  }

  private loadFromPrefs(): void {
    try {
      const data = Services.prefs.getStringPref(
        TabRenameManager.PREF_KEY,
        "{}",
      );
      const parsed = JSON.parse(data);
      const map = new Map<string, TabRenameData>();
      for (const [key, value] of Object.entries(parsed)) {
        map.set(key, value as TabRenameData);
      }
      this.setRenamedTabs(map);
    } catch (error) {
      console.error("[TabRenameManager] Failed to load renamed tabs:", error);
    }
  }

  private saveToPrefs(): void {
    try {
      const obj = Object.fromEntries(this.renamedTabs());
      const data = JSON.stringify(obj);
      Services.prefs.setStringPref(TabRenameManager.PREF_KEY, data);
    } catch (error) {
      console.error("[TabRenameManager] Failed to save renamed tabs:", error);
    }
  }

  getTabId(tab: XULElement): string {
    const linkedPanel = (tab as any).linkedPanel;
    if (!linkedPanel) {
      (tab as any).linkedPanel =
        `panel-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    }
    return (tab as any).linkedPanel;
  }

  setTabName(tab: XULElement, customName: string): void {
    const tabId = this.getTabId(tab);
    const originalTitle = tab.getAttribute("label") || "";

    this.setRenamedTabs((prev) => {
      const newMap = new Map(prev);
      if (customName.trim() === "") {
        newMap.delete(tabId);
      } else {
        newMap.set(tabId, { tabId, customName, originalTitle });
      }
      return newMap;
    });

    this.saveToPrefs();
    this.applyTabName(tab);
  }

  getTabName(tab: XULElement): string | undefined {
    const tabId = this.getTabId(tab);
    return this.renamedTabs().get(tabId)?.customName;
  }

  /**
   * Return the original title saved for this tab (the label at the time
   * the tab was first renamed). If there is no saved original title,
   * returns the current tab label or undefined.
   */
  getOriginalTitle(tab: XULElement): string | undefined {
    const tabId = this.getTabId(tab);
    return (
      this.renamedTabs().get(tabId)?.originalTitle ||
      tab.getAttribute("label") ||
      undefined
    );
  }

  applyTabName(tab: XULElement): void {
    const customName = this.getTabName(tab);
    if (customName) {
      // Set a data attribute so CSS can match presence, and expose the
      // value via a CSS variable. We JSON.stringify the value so it is
      // quoted and any internal quotes are escaped for use in `content`.
      tab.setAttribute("data-customlabel", "");
      try {
        const quoted = JSON.stringify(customName);
        (tab as unknown as HTMLElement).style.setProperty(
          "--customlabel",
          quoted,
        );
      } catch {
        // Fallback: set raw value (may break if contains quotes)
        (tab as unknown as HTMLElement).style.setProperty(
          "--customlabel",
          customName,
        );
      }
    } else {
      tab.removeAttribute("data-customlabel");
      (tab as unknown as HTMLElement).style.removeProperty("--customlabel");
    }
  }

  clearTabName(tab: XULElement): void {
    const tabId = this.getTabId(tab);
    this.setRenamedTabs((prev) => {
      const newMap = new Map(prev);
      newMap.delete(tabId);
      return newMap;
    });
    this.saveToPrefs();
    tab.removeAttribute("data-customlabel");
    (tab as unknown as HTMLElement).style.removeProperty("--customlabel");
  }

  applyAllTabNames(): void {
    const tabs = window.gBrowser.tabs;
    for (const tab of tabs) {
      this.applyTabName(tab);
    }
  }
}
