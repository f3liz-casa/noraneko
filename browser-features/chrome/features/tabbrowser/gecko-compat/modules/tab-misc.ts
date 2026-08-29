// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js L4163~L4632, L7706~L7960
// Section: Misc Tab Utilities — remaining utility functions from the events/utility section

import type { TabbrowserCompat } from "../TabbrowserCompat.ts";
import { dispatch } from "../compat-helpers.ts";

/** @augments TabbrowserCompat */
declare module "../TabbrowserCompat.ts" {
  interface TabbrowserCompat {
    updateBrowserRemotenessByURL(browser: XULBrowserElement, url: string, options?: any): boolean;
    updateBrowserRemoteness?(browser: XULBrowserElement, options: any): boolean;
    // Class fields used by this module
    _lastRelatedTabMap: WeakMap<any, any>;
    // Methods
    clearRelatedTabs(): void;
  }
}

export const methods = {
  /**
   * Opens a new tab on middle-click of a new-tab button, unless the button
   * is disabled.
   */
  // upstream: handleNewTabMiddleClick@3684d91de0 FIREFOX_143_0_1_RELEASE
  handleNewTabMiddleClick(node: any, event: Event) {
    if (node?.getAttribute?.("disabled") === "true") {
      return;
    }

    if ((event as MouseEvent).button === 1) {
      (this.window as any).BrowserCommands?.openTab?.({ event });
      event.stopPropagation();
      event.preventDefault();
    }
  },

  /**
   * Resets the map that tracks opener relationships between tabs, clearing
   * all "last related tab" associations.
   */
  // upstream: clearRelatedTabs@b59671927f FIREFOX_143_0_1_RELEASE
  clearRelatedTabs() {
    this._lastRelatedTabMap = new WeakMap();
  },

  /**
   * Fires a `TabRefreshBlocked` event on the tab associated with `browser`
   * when a page refresh has been blocked.
   */
  // upstream: refreshBlocked@d30b4df956 FIREFOX_143_0_1_RELEASE
  refreshBlocked(actor: any, browser: XULBrowserElement, data: any) {
    // Handle blocked refreshes
    try {
      const tab = this.getTabForBrowser(browser);
      if (tab) {
        dispatch(tab, "TabRefreshBlocked", data);
      }
    } catch (_) { /* */ }
  },

  // upstream: _hasBeforeUnload@a5da1c67f3 FIREFOX_143_0_1_RELEASE
  _hasBeforeUnload(tab: MozTabbrowserTab): boolean {
    try {
      const browser = (tab as any).linkedBrowser;
      if (!browser) return false;
      return browser.permitUnload?.()?.permitUnload === false;
    } catch (_) {
      return false;
    }
  },

  // upstream: _getTriggeringPrincipalFromHistory@1eb1276cf5 FIREFOX_143_0_1_RELEASE
  _getTriggeringPrincipalFromHistory(browser: XULBrowserElement): any {
    try {
      const sh = browser?.sessionHistory;
      if (!sh) return null;
      const entry = sh.legacySHistory?.getEntryAtIndex?.(sh.index);
      return entry?.triggeringPrincipal ?? null;
    } catch (_) {
      return null;
    }
  },

  /**
   * Switches `browser` to the remote type required to load `url`, returning
   * `true` when the remoteness was changed.
   *
   * @returns `false` when the browser already has the correct remote type or on error.
   */
  // upstream: updateBrowserRemotenessByURL@8d7f7ea78f FIREFOX_143_0_1_RELEASE
  updateBrowserRemotenessByURL(browser: XULBrowserElement, url: string, options: any = {}): boolean {
    try {
      const currentRemoteType = browser.remoteType;
      const userContextId = browser.getAttribute?.("usercontextid") || 0;
      const oa = E10SUtils.predictOriginAttributes?.({ window: this.window, userContextId });
      const remoteType = E10SUtils.getRemoteTypeForURI?.(
        url,
        gMultiProcessBrowser,
        gFissionBrowser,
        options.remoteType ?? E10SUtils.DEFAULT_REMOTE_TYPE,
        null,
        oa
      );

      if (currentRemoteType === remoteType) {
        return false;
      }

      // updateBrowserRemoteness (tabbrowser.js process switching) is not ported yet.
      return this.updateBrowserRemoteness?.(browser, { remoteType, ...options }) ?? false;
    } catch (_) {
      return false;
    }
  },
} satisfies Partial<TabbrowserCompat> & ThisType<TabbrowserCompat>;
