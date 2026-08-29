// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js L1000~L1053, L2714~L2896
// Section: Browser Discard & Notifications — "how are tabs discarded and memory freed?"

import type { TabbrowserCompat } from "../TabbrowserCompat.ts";

/** @augments TabbrowserCompat */
declare module "../TabbrowserCompat.ts" {
  interface TabbrowserCompat {
    discardBrowser(aTab: MozTabbrowserTab, aForceDiscard?: boolean): boolean;
    prepareDiscardBrowser(aTab: MozTabbrowserTab): Promise<void>;
    /** Not ported yet: discarded browsers stay eager (see addTab in tab-crud). */
    _createLazyBrowser?(aTab: MozTabbrowserTab): void;
    // Methods provided by this module
    _mayDiscardBrowser(tab: MozTabbrowserTab, skipBeforeUnloadCheck?: boolean): boolean;
    getNotificationBox(browser?: any): any;
    getTabDialogBox(browser?: any): any;
    getTabNotificationDeck(): any;
    readNotificationBox(browser?: any): any;
    _updateVisibleNotificationBox(browser?: any): void;
    // Methods called by this module but defined elsewhere
    _hasBeforeUnload(tab: MozTabbrowserTab): boolean;
  }
}

export const methods = {
  // ==========================================================================
  // Notification & Dialog Boxes
  // tabbrowser.js L1000~L1053
  // ==========================================================================

  /**
   * Return (lazily creating if necessary) the `NotificationBox` for `browser`.
   * Defaults to `selectedBrowser` when not provided.
   */
  // upstream: getNotificationBox@d5df027ad5 FIREFOX_143_0_1_RELEASE
  getNotificationBox(browser?: XULBrowserElement | null): any {
    browser = browser || this.selectedBrowser;
    if (!browser) return null;
    if (!(browser as any)._notificationBox) {
      try {
        (browser as any)._notificationBox = new (MozElements.NotificationBox as any)((element: any) => {
          element.setAttribute("notificationside", "top");
          element.setAttribute("name", `tab-notification-box-${this._nextNotificationBoxId++}`);
          this.getTabNotificationDeck()?.append?.(element);
          if (browser === this.selectedBrowser) {
            this._updateVisibleNotificationBox(browser);
          }
        }, this._notificationEnableDelay);
      } catch (_) {
        // MozElements.NotificationBox may not be available; fall back
        const container = this.getBrowserContainer(browser);
        if (container) {
          const existing = container.querySelector?.("notificationbox");
          if (existing) { (browser as any)._notificationBox = existing; return existing; }
        }
        return null;
      }
    }
    return (browser as any)._notificationBox;
  },

  /** The deck that holds every tab's notification box; stamped out of its template on first use. */
  getTabNotificationDeck() {
    if (!this._tabNotificationDeck) {
      const doc = this.window.document;
      const template = doc.getElementById("tab-notification-deck-template") as any;
      template.replaceWith(template.content);
      this._tabNotificationDeck = doc.getElementById("tab-notification-deck");
    }
    return this._tabNotificationDeck;
  },

  /** The notification box `browser` already has, or null; never creates one. */
  readNotificationBox(browser?: XULBrowserElement | null) {
    browser = browser || this.selectedBrowser;
    return (browser as any)?._notificationBox || null;
  },

  _updateVisibleNotificationBox(browser?: XULBrowserElement | null) {
    if (!this._tabNotificationDeck) {
      // If the deck hasn't been created we don't need to create it here.
      return;
    }
    const notificationBox = this.readNotificationBox(browser);
    this.getTabNotificationDeck().selectedViewName = notificationBox
      ? notificationBox.stack.getAttribute("name")
      : "";
  },

  /**
   * Return the `<tabdialogbox>` element for `browser`'s container.
   * Used for per-tab modal dialogs (permissions, authentication, etc.).
   * Defaults to `selectedBrowser` when not provided.
   */
  // upstream: getTabDialogBox@55ab21ebb3 FIREFOX_143_0_1_RELEASE
  getTabDialogBox(browser?: XULBrowserElement | null): any {
    browser = browser || this.selectedBrowser;
    if (!browser) return null;
    const container = this.getBrowserContainer(browser);
    return container?.querySelector?.("tabdialogbox") ?? null;
  },

  // ==========================================================================
  // Browser Management & Discard (discardBrowser, etc.)
  // tabbrowser.js L2714~L2896
  // ==========================================================================

  // upstream: _mayDiscardBrowser@f7b632b942 FIREFOX_143_0_1_RELEASE
  _mayDiscardBrowser(aTab: MozTabbrowserTab, aForceDiscard?: boolean): boolean {
    const browser = aTab?.linkedBrowser;
    if (!browser) return false;

    const action = aForceDiscard ? "unload" : "dontUnload";

    if (
      !aTab ||
      aTab.selected ||
      aTab.closing ||
      this._windowIsClosing ||
      !browser.isConnected ||
      !browser.isRemoteBrowser ||
      !browser.permitUnload?.(action)?.permitUnload
    ) {
      return false;
    }

    // Don't discard if dialogs are open (unless forcing)
    if (
      !aForceDiscard &&
      this.getTabDialogBox(browser)?._tabDialogManager?._dialogs?.length
    ) {
      return false;
    }

    return true;
  },

  /**
   * Flushes the tab's session state to disk in preparation for discarding its browser.
   *
   * Must be awaited before calling `discardBrowser` to avoid losing session history.
   */
  // upstream: prepareDiscardBrowser@d4dc3f070b FIREFOX_143_0_1_RELEASE
  async prepareDiscardBrowser(aTab: MozTabbrowserTab): Promise<void> {
    const browser = aTab?.linkedBrowser;
    if (!browser) return;

    // Don't prepare if already closing or not remote
    if (aTab.closing || this._windowIsClosing || !browser.isRemoteBrowser) {
      return;
    }

    // Flush tab state to session store
    try {
      await this.TabStateFlusher?.flush?.(browser);
    } catch (e) {
      console.warn("Failed to flush tab state before discard", e);
    }
  },

  /**
   * Discards a tab's browser to free memory, replacing it with a lazy placeholder.
   *
   * The tab visually remains in the strip; the browser is recreated on next selection.
   * Returns `false` if the browser cannot be discarded (e.g., the tab is selected or
   * has open dialogs).
   *
   * @param aForceDiscard - Skip the beforeunload check and force-close any open dialogs.
   */
  // upstream: discardBrowser@7ea41b54de FIREFOX_143_0_1_RELEASE
  discardBrowser(aTab: MozTabbrowserTab, aForceDiscard?: boolean): boolean {
    const browser = aTab?.linkedBrowser;
    if (!browser) return false;

    if (!this._mayDiscardBrowser(aTab, aForceDiscard)) {
      return false;
    }

    // Reset sharing state
    if (aTab._sharingState) {
      this.resetBrowserSharing?.(browser);
    }
    try {
      webrtcUI?.forgetStreamsFromBrowserContext?.(browser.browsingContext);
    } catch (_) { /* */ }

    // Abort any open dialogs
    try {
      const tabDialogBox = this.getTabDialogBox(browser);
      tabDialogBox?.abortAllDialogs?.();
    } catch (_) { /* */ }

    // Save browser parameters for restoration
    aTab._browserParams = {
      uriIsAboutBlank: browser.currentURI?.spec === "about:blank",
      remoteType: browser.remoteType,
      usingPreloadedContent: false,
    };

    // Reset browser to lazy state in SessionStore
    try {
      SessionStore?.resetBrowserToLazyState?.(aTab);
    } catch (_) { /* */ }

    if (aForceDiscard) {
      aTab.toggleAttribute?.("discarded", true);
    }

    // Remove progress listeners
    const filter = this._tabFilters.get(aTab);
    const listener = this._tabListeners.get(aTab);
    if (filter && listener) {
      try {
        browser.webProgress?.removeProgressListener?.(filter);
        filter.removeProgressListener?.(listener);
        listener.destroy?.();
      } catch (_) { /* */ }
    }
    this._tabListeners.delete(aTab);
    this._tabFilters.delete(aTab);

    // Remove findbar if present
    if (aTab._findBar) {
      try {
        aTab._findBar.close?.(true);
        aTab._findBar.remove?.();
        delete aTab._findBar;
      } catch (_) { /* */ }
    }

    // Clean up potentially stale attributes
    const attributesToRemove = [
      "activemedia-blocked",
      "busy",
      "pendingicon",
      "progress",
      "soundplaying",
    ];
    const removedAttributes: string[] = [];
    for (const attr of attributesToRemove) {
      if (aTab.hasAttribute?.(attr)) {
        removedAttributes.push(attr);
        aTab.removeAttribute(attr);
      }
    }
    if (removedAttributes.length) {
      this._tabAttrModified?.(aTab, removedAttributes);
    }

    browser.destroy?.();
    this.getPanel(browser)?.remove?.();
    aTab.removeAttribute?.("linkedpanel");
    this._createLazyBrowser?.(aTab);
    aTab.dispatchEvent?.(new CustomEvent("TabBrowserDiscarded", { bubbles: true }));

    return true;
  },
} satisfies Partial<TabbrowserCompat> & ThisType<TabbrowserCompat>;
