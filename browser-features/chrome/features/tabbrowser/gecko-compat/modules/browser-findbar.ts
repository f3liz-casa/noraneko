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

export const methods = {
  /**
   * Returns the find bar for `tab`, creating it lazily if it has not been initialised yet.
   *
   * Multiple concurrent calls are coalesced into a single creation promise.
   */
  // upstream: getFindBar@e5801fe33e FIREFOX_143_0_1_RELEASE
  async getFindBar(tab?: MozTabbrowserTab): Promise<any> {
    tab ??= this.selectedTab;
    const cached = this.getCachedFindBar(tab);
    if (cached) {
      return cached;
    }

    // Avoid re-entrancy by caching the promise we're about to return.
    if (!(tab as any)._pendingFindBar) {
      (tab as any)._pendingFindBar = this._createFindBar(tab as MozTabbrowserTab);
    }
    return (tab as any)._pendingFindBar;
  },

  /**
   * Create a findbar instance.
   * Returns the created findbar, or null if the window or tab is closed/closing.
   */
  // upstream: _createFindBar@bcd548d915 FIREFOX_143_0_1_RELEASE
  async _createFindBar(tab: MozTabbrowserTab): Promise<any> {
    const findBar = this._xulEl("findbar") as any;
    const browser = this.getBrowserForTab(tab) as any;

    browser.parentNode.insertAdjacentElement("afterend", findBar);

    await new Promise<void>(r => requestAnimationFrame(() => r()));
    delete (tab as any)._pendingFindBar;
    if ((this.window as any).closed || (tab as any).closing) {
      return null;
    }

    findBar.browser = browser;
    findBar._findField.value = this._lastFindValue;

    (tab as any)._findBar = findBar;

    const event = document.createEvent("Events");
    event.initEvent("TabFindInitialized", true, false);
    (tab as any).dispatchEvent(event);

    return findBar;
  },

  /**
   * Get the already constructed findbar.
   */
  // upstream: getCachedFindBar@47372badd2 FIREFOX_143_0_1_RELEASE
  getCachedFindBar(tab?: MozTabbrowserTab): any {
    tab ??= this.selectedTab;
    return (tab as any)._findBar;
  },

  // upstream: isFindBarInitialized@81df3d7322 FIREFOX_143_0_1_RELEASE
  isFindBarInitialized(tab?: MozTabbrowserTab): boolean {
    return ((tab || this.selectedTab) as any)._findBar != undefined;
  },
} satisfies Partial<TabbrowserCompat> & ThisType<TabbrowserCompat>;
