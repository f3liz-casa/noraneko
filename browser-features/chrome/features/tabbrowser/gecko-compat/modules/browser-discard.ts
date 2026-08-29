// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js L1000~L1053, L2714~L2896
// Section: Browser Discard & Notifications — "how are tabs discarded and memory freed?"

import type { TabbrowserCompat } from "../TabbrowserCompat.ts";

// browser.js declares this with `class`, so it lives in the global lexical
// scope, not on window: reach it by name.
declare const TabDialogBox: any;

/** @augments TabbrowserCompat */
declare module "../TabbrowserCompat.ts" {
  interface TabbrowserCompat {
    discardBrowser(aTab: MozTabbrowserTab, aForceDiscard?: boolean): boolean;
    prepareDiscardBrowser(aTab: MozTabbrowserTab): Promise<void>;
    _createLazyBrowser(aTab: MozTabbrowserTab): void;
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
    if (!(browser as any)._notificationBox) {
      (browser as any)._notificationBox = new MozElements.NotificationBox((element: any) => {
        element.setAttribute("notificationside", "top");
        element.setAttribute("name", `tab-notification-box-${this._nextNotificationBoxId++}`);
        this.getTabNotificationDeck().append(element);
        if (browser === this.selectedBrowser) {
          this._updateVisibleNotificationBox(browser);
        }
      }, this._notificationEnableDelay);
    }
    return (browser as any)._notificationBox;
  },

  /** The deck that holds every tab's notification box; stamped out of its template on first use. */
  // upstream: getTabNotificationDeck@e4aa6cb463 FIREFOX_143_0_1_RELEASE
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
  // upstream: readNotificationBox@1695a544bc FIREFOX_143_0_1_RELEASE
  readNotificationBox(browser?: XULBrowserElement | null) {
    browser = browser || this.selectedBrowser;
    return (browser as any)._notificationBox || null;
  },

  // upstream: _updateVisibleNotificationBox@1505e553ae FIREFOX_143_0_1_RELEASE
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
   * Return the `<tabdialogbox>` for `browser`, lazily constructing it (mirrors the
   * native `TabDialogBox` global from browser.js — used for per-tab modal dialogs).
   */
  // upstream: getTabDialogBox@55ab21ebb3 FIREFOX_143_0_1_RELEASE
  getTabDialogBox(browser: XULBrowserElement): any {
    if (!browser) {
      throw new Error("aBrowser is required");
    }
    if (!(browser as any).tabDialogBox) {
      (browser as any).tabDialogBox = new TabDialogBox(browser);
    }
    return (browser as any).tabDialogBox;
  },

  // ==========================================================================
  // Browser Management & Discard (discardBrowser, etc.)
  // tabbrowser.js L2714~L2896
  // ==========================================================================

  /**
   * Turn `aTab.linkedBrowser` into a lazy browser: every member in
   * _browserBindingProperties becomes an accessor that answers from
   * SessionStore's lazy tab data, and the first one with no such answer
   * inserts the real browser (_insertBrowser) on the spot.
   */
  // upstream: _createLazyBrowser@878cf4049f FIREFOX_143_0_1_RELEASE
  _createLazyBrowser(aTab: MozTabbrowserTab) {
    const tab = aTab as any;
    const browser = tab.linkedBrowser;

    const names = this._browserBindingProperties;

    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      let getter: () => any;
      let setter: ((value: any) => any) | undefined;
      switch (name) {
        case "audioMuted":
          getter = () => tab.hasAttribute("muted");
          break;
        case "contentTitle":
          getter = () => SessionStore.getLazyTabValue(tab, "title");
          break;
        case "currentURI":
          getter = () => {
            // Avoid recreating the same nsIURI object over and over again...
            if (browser._cachedCurrentURI) {
              return browser._cachedCurrentURI;
            }
            const url = SessionStore.getLazyTabValue(tab, "url") || "about:blank";
            return (browser._cachedCurrentURI = Services.io.newURI(url));
          };
          break;
        case "didStartLoadSinceLastUserTyping":
          getter = () => () => false;
          break;
        case "fullZoom":
        case "textZoom":
          getter = () => 1;
          break;
        case "tabHasCustomZoom":
          getter = () => false;
          break;
        case "getTabBrowser":
          getter = () => () => this;
          break;
        case "isRemoteBrowser":
          getter = () => browser.getAttribute("remote") == "true";
          break;
        case "permitUnload":
          getter = () => () => ({ permitUnload: true });
          break;
        case "reload":
        case "reloadWithFlags":
          getter = () => (params: any) => {
            // Wait for load handler to be instantiated before
            // initializing the reload.
            tab.addEventListener(
              "SSTabRestoring",
              () => {
                browser[name](params);
              },
              { once: true },
            );
            this._insertBrowser(tab);
          };
          break;
        case "remoteType":
          getter = () => {
            const url = SessionStore.getLazyTabValue(tab, "url") || "about:blank";
            // Avoid recreating the same nsIURI object over and over again...
            let uri;
            if (browser._cachedCurrentURI) {
              uri = browser._cachedCurrentURI;
            } else {
              uri = browser._cachedCurrentURI = Services.io.newURI(url);
            }
            const oa = E10SUtils.predictOriginAttributes({
              browser,
              userContextId: tab.getAttribute("usercontextid"),
            });
            return E10SUtils.getRemoteTypeForURI(
              url,
              gMultiProcessBrowser,
              gFissionBrowser,
              undefined,
              uri,
              oa,
            );
          };
          break;
        case "userTypedValue":
        case "userTypedClear":
          getter = () => SessionStore.getLazyTabValue(tab, name);
          break;
        default:
          getter = () => {
            if (AppConstants.NIGHTLY_BUILD) {
              const message = `[bug 1345098] Lazy browser prematurely inserted via '${name}' property access:\n`;
              Services.console.logStringMessage(message + new Error().stack);
            }
            this._insertBrowser(tab);
            return browser[name];
          };
          setter = (value: any) => {
            if (AppConstants.NIGHTLY_BUILD) {
              const message = `[bug 1345098] Lazy browser prematurely inserted via '${name}' property access:\n`;
              Services.console.logStringMessage(message + new Error().stack);
            }
            this._insertBrowser(tab);
            return (browser[name] = value);
          };
      }
      Object.defineProperty(browser, name, {
        get: getter,
        set: setter,
        configurable: true,
        enumerable: true,
      });
    }
  },

  // upstream: _mayDiscardBrowser@f7b632b942 FIREFOX_143_0_1_RELEASE
  _mayDiscardBrowser(aTab: MozTabbrowserTab, aForceDiscard?: boolean): boolean {
    const browser = (aTab as any).linkedBrowser;
    const action = aForceDiscard ? "unload" : "dontUnload";

    if (
      !aTab ||
      aTab.selected ||
      aTab.closing ||
      this._windowIsClosing ||
      !browser.isConnected ||
      !browser.isRemoteBrowser ||
      !browser.permitUnload(action).permitUnload
    ) {
      return false;
    }

    // discarding a browser will dismiss any dialogs, so don't
    // allow this unless we're forcing it.
    if (
      !aForceDiscard &&
      this.getTabDialogBox(browser)._tabDialogManager._dialogs.length
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
    const browser = (aTab as any).linkedBrowser;

    // Don't prepare if already closing or not remote
    if (aTab.closing || this._windowIsClosing || !browser.isRemoteBrowser) {
      return;
    }

    // Flush the tab's state so session restore has the latest data.
    await this.TabStateFlusher.flush(browser);
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
    const browser = (aTab as any).linkedBrowser;

    if (!this._mayDiscardBrowser(aTab, aForceDiscard)) {
      return false;
    }

    // Reset sharing state.
    this.resetBrowserSharing(browser);
    webrtcUI.forgetStreamsFromBrowserContext(browser.browsingContext);

    // Abort any dialogs since the browser is about to be discarded.
    const tabDialogBox = this.getTabDialogBox(browser);
    tabDialogBox.abortAllDialogs();

    // Save browser parameters for restoration
    (aTab as any)._browserParams = {
      uriIsAboutBlank: browser.currentURI.spec == "about:blank",
      remoteType: browser.remoteType,
      usingPreloadedContent: false,
    };

    SessionStore.resetBrowserToLazyState(aTab);
    // Indicate that this tab was explicitly unloaded (i.e. not
    // from a session restore) in case we want to style that
    // differently.
    if (aForceDiscard) {
      (aTab as any).toggleAttribute("discarded", true);
    }

    // Remove the tab's filter and progress listener.
    const filter = this._tabFilters.get(aTab);
    const listener = this._tabListeners.get(aTab);
    browser.webProgress.removeProgressListener(filter);
    filter.removeProgressListener(listener);
    listener.destroy();

    this._tabListeners.delete(aTab);
    this._tabFilters.delete(aTab);

    // Reset the findbar and remove it if it is attached to the tab.
    if ((aTab as any)._findBar) {
      (aTab as any)._findBar.close(true);
      (aTab as any)._findBar.remove();
      delete (aTab as any)._findBar;
    }

    // Remove potentially stale attributes.
    const attributesToRemove = [
      "activemedia-blocked",
      "busy",
      "pendingicon",
      "progress",
      "soundplaying",
    ];
    const removedAttributes: string[] = [];
    for (const attr of attributesToRemove) {
      if ((aTab as any).hasAttribute(attr)) {
        removedAttributes.push(attr);
        (aTab as any).removeAttribute(attr);
      }
    }
    if (removedAttributes.length) {
      this._tabAttrModified(aTab, removedAttributes);
    }

    browser.destroy();
    this.getPanel(browser).remove();
    (aTab as any).removeAttribute("linkedpanel");

    this._createLazyBrowser(aTab);

    const evt = new CustomEvent("TabBrowserDiscarded", { bubbles: true });
    (aTab as any).dispatchEvent(evt);
    return true;
  },
} satisfies Partial<TabbrowserCompat> & ThisType<TabbrowserCompat>;
