// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js L4163~L4632
// Section: Tab Deduplication — "how are duplicate tabs detected and removed?"

import type { TabbrowserCompat } from "../TabbrowserCompat.ts";

/** @augments TabbrowserCompat */
declare module "../TabbrowserCompat.ts" {
  interface TabbrowserCompat {
    getDuplicateTabsToClose(tab: MozTabbrowserTab): any[];
    getAllDuplicateTabsToClose(): any[];
    removeDuplicateTabs(tab: MozTabbrowserTab, options?: any): void;
    removeAllDuplicateTabs(): void;
    _removeDuplicateTabs(anchorElement: any, tabs: MozTabbrowserTab[], aCloseTabs: number, options?: any): void;
  }
}

export const methods: Partial<TabbrowserCompat> & ThisType<TabbrowserCompat> = {
  /**
   * Returns all unpinned tabs that share the same URL as `tab`, excluding
   * `tab` itself.
   */
  getDuplicateTabsToClose(tab: MozTabbrowserTab): any[] {
    const uri = (tab as any).linkedBrowser?.currentURI;
    if (!uri) return [];
    
    return this.tabs.filter((t: any) => {
      if (t === tab || t.pinned) return false;
      try {
        return t.linkedBrowser?.currentURI?.equals?.(uri);
      } catch (_) {
        return false;
      }
    });
  },

  /**
   * Returns all unpinned duplicate tabs across the window, keeping only the
   * first-encountered tab for each URL.
   */
  getAllDuplicateTabsToClose(): any[] {
    const seenURIs = new Set();
    const duplicates: any[] = [];

    for (const tab of this.tabs) {
      if ((tab as any).pinned) continue;
      try {
        const uri = (tab as any).linkedBrowser?.currentURI;
        if (!uri) continue;
        const uriSpec = uri.spec;
        if (seenURIs.has(uriSpec)) {
          duplicates.push(tab);
        } else {
          seenURIs.add(uriSpec);
        }
      } catch (_) { /* */ }
    }

    return duplicates;
  },

  /**
   * Closes all unpinned duplicate tabs that share the same URL as `tab`.
   */
  removeDuplicateTabs(tab: MozTabbrowserTab, options?: any) {
    const duplicates = this.getDuplicateTabsToClose(tab);
    if (duplicates.length) {
      this.removeTabs(duplicates, options);
    }
  },

  /**
   * Closes all duplicate tabs across the window, keeping one tab per URL.
   */
  removeAllDuplicateTabs() {
    const duplicates = this.getAllDuplicateTabsToClose();
    if (duplicates.length) {
      this.removeTabs(duplicates);
    }
  },

  _removeDuplicateTabs(anchorElement: any, tabs: MozTabbrowserTab[], aCloseTabs: number, options?: any) {
    if (!this.warnAboutClosingTabs(tabs.length, aCloseTabs)) {
      return;
    }
    this.removeTabs(tabs, options);
  },
};
