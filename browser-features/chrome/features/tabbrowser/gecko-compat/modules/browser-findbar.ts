// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js L816~L905
// Section: Find Bar — "how does the find bar work?"

import type { TabbrowserCompat } from "../TabbrowserCompat.ts";

declare const document: any;
declare const requestAnimationFrame: (cb: () => void) => void;

/** @augments TabbrowserCompat */
declare module "../TabbrowserCompat.ts" {
  interface TabbrowserCompat {
    // Methods provided by this module
    getCachedFindBar(tab?: any): any;
    isFindBarInitialized(tab?: any): boolean;
    _createFindBar(tab: MozTabbrowserTab, focused?: boolean): Promise<any>;
    getFindBar(tab?: any): Promise<any>;
  }
}

export const methods: Partial<TabbrowserCompat> & ThisType<TabbrowserCompat> = {
  /**
   * Returns the find bar for `tab`, creating it lazily if it has not been initialised yet.
   *
   * Multiple concurrent calls are coalesced into a single creation promise.
   */
  async getFindBar(tab: MozTabbrowserTab = this.selectedTab): Promise<any> {
    const cached = this.getCachedFindBar(tab);
    if (cached) return cached;

    // Lazy creation — avoid re-entrancy via cached promise
    if (!(tab as any)._pendingFindBar) {
      (tab as any)._pendingFindBar = this._createFindBar(tab);
    }
    return (tab as any)._pendingFindBar;
  },

  async _createFindBar(tab: MozTabbrowserTab): Promise<any> {
    try {
      const findBar = this._xulEl("findbar") as any;
      const browser = this.getBrowserForTab(tab);
      if (!browser) return null;

      (browser as any).parentNode?.insertAdjacentElement?.("afterend", findBar);

      await new Promise(r => requestAnimationFrame(r));
      delete (tab as any)._pendingFindBar;

      if ((this.window as any).closed || (tab as any).closing) return null;

      findBar.browser = browser;
      if (findBar._findField) findBar._findField.value = this._lastFindValue;

      (tab as any)._findBar = findBar;

      const event = document.createEvent("Events");
      event.initEvent("TabFindInitialized", true, false);
      (tab as any).dispatchEvent?.(event);

      return findBar;
    } catch (_) {
      delete (tab as any)._pendingFindBar;
      return null;
    }
  },

  /**
   * Return the `<findbar>` element already attached to `tab`'s panel, or
   * `null` if it has not been created yet (non-blocking).
   */
  getCachedFindBar(tab: MozTabbrowserTab): any {
    const panel = tab?.linkedBrowser ? this.getPanel(tab.linkedBrowser) : null;
    return panel?.querySelector?.("findbar") ?? null;
  },

  /**
   * Returns `true` if the find bar for `tab` has already been created.
   */
  isFindBarInitialized(tab: MozTabbrowserTab): boolean {
    return !!this.getCachedFindBar(tab);
  },
};
