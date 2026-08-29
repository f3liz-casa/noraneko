// SPDX-License-Identifier: MPL-2.0
// Ported from tabbrowser.js L431~L815
// Section: Lifecycle · Tab Switcher · Progress Listeners

import type { TabbrowserCompat } from "../TabbrowserCompat.ts";

const { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

/** @augments TabbrowserCompat */
declare module "../TabbrowserCompat.ts" {
  interface TabbrowserCompat {
    tabLocalization: any;
    // Lifecycle
    init(): void;
    destroy(): void;
    // Tab Switcher
    _getSwitcher(): any;
    warmupTab(tab: MozTabbrowserTab): void;
    activateBrowserForPrintPreview(browser: XULBrowserElement): void;
    deactivatePrintPreviewBrowsers(): void;
    // Progress Listeners
    addProgressListener(listener: any): void;
    removeProgressListener(listener: any): void;
    addTabsProgressListener(listener: any): void;
    removeTabsProgressListener(listener: any): void;
    _callProgressListeners(browser: XULBrowserElement, method: string, args: any[], callGlobal?: boolean, callTabs?: boolean): boolean;
  }
}

export const methods = {

  // ==========================================================================
  // Lifecycle
  // tabbrowser.js L94~L359
  // ==========================================================================

  /**
   * Initialize the tabbrowser.
   *
   * Wires the initial tab's progress listener, registers XPCOM observers, and
   * attaches all browser and tab-group event listeners. No-op if already initialized.
   */
  // upstream: init@dae8e417b1 FIREFOX_143_0_1_RELEASE
  init() {
    if (this._initialized) return;

    this.tabLocalization = new (this.window as any).Localization(
      ["browser/tabbrowser.ftl", "browser/defaultBrowserNotification.ftl"],
      true,
    );

    // tabbrowser.js init(): the preferences it reads through lazy getters.
    for (const [name, pref, fallback] of [
      ["_shouldExposeContentTitle", "privacy.exposeContentTitleInWindow", true],
      ["_shouldExposeContentTitlePbm", "privacy.exposeContentTitleInWindow.pbm", true],
      ["_showTabCardPreview", "browser.tabs.hoverPreview.enabled", true],
      ["_allowTransparentBrowser", "browser.tabs.allow_transparent_browser", false],
      ["_tabGroupsEnabled", "browser.tabs.groups.enabled", false],
      ["showPidAndActiveness", "browser.tabs.tooltipsShowPidAndActiveness", false],
      ["_unloadTabInContextMenu", "browser.tabs.unloadTabInContextMenu", false],
      ["_notificationEnableDelay", "security.notification_enable_delay", 500],
    ] as const) {
      XPCOMUtils.defineLazyPreferenceGetter(this, name, pref, fallback);
    }

    // Wire up progress listener for the initial tab
    const initialTab = this.selectedTab;
    const initialBrowser = this.selectedBrowser as any;
    if (initialTab && initialBrowser) {
      this._tabForBrowser.set(initialBrowser, initialTab);
      (initialTab as any).permanentKey = initialBrowser.permanentKey;
      (initialTab as any)._tPos = 0;
      (initialTab as any)._fullyOpen = true;
      (initialTab as any).linkedBrowser = initialBrowser;

      initialBrowser.docShellIsActive = this.shouldActivateDocShell(initialBrowser);

      // Its TabProgressListener is taken over in initCompat, once this
      // instance is the window's gBrowser.
      this.appendStatusPanel(initialBrowser);
    }

    // Register observers
    try {
      Services.obs.addObserver(this, "contextual-identity-updated");
      Services.obs.addObserver(this, "intl:app-locales-changed");
    } catch (_) { /* */ }

    this._setupEventListeners();
    this._initialized = true;
  },

  /**
   * Tear down the tabbrowser and release all resources.
   *
   * Removes event listeners, unregisters open URIs, destroys per-tab progress
   * listeners, and shuts down the async tab switcher. Safe to call multiple times.
   */
  // upstream: destroy@2ad058f3b7 FIREFOX_143_0_1_RELEASE
  destroy() {
    try { this.tabContainer?.destroy?.(); } catch (_) { /* */ }

    // Remove observers
    try {
      Services.obs.removeObserver(this, "contextual-identity-updated");
      Services.obs.removeObserver(this, "intl:app-locales-changed");
    } catch (_) { /* */ }

    // Unregister open URIs and remove progress listeners for all tabs
    for (const tab of this.tabs) {
      try {
        const browser = (tab as any).linkedBrowser;
        if (browser?.registeredOpenURI) {
          const uci = browser.getAttribute?.("usercontextid") || 0;
          this.UrlbarProviderOpenTabs?.unregisterOpenTab?.(
            browser.registeredOpenURI.spec, uci,
            (tab as any).group?.id,
            PrivateBrowsingUtils?.isWindowPrivate?.(this.window),
          );
          delete browser.registeredOpenURI;
        }
        const filter = this._tabFilters.get(tab);
        if (filter) {
          browser?.webProgress?.removeProgressListener?.(filter);
          const listener = this._tabListeners.get(tab);
          if (listener) {
            filter.removeProgressListener(listener);
            listener.destroy?.();
          }
          this._tabFilters.delete(tab);
          this._tabListeners.delete(tab);
        }
      } catch (_) { /* */ }
    }

    // Remove event listeners
    const doc = this.window.document;
    try {
      doc.removeEventListener("keydown", this, { mozSystemGroup: true } as any);
      doc.removeEventListener("keypress", this, { mozSystemGroup: true } as any);
    } catch (_) { /* */ }
    try {
      this.window.removeEventListener("framefocusrequested", this);
      this.window.removeEventListener("visibilitychange", this);
      this.removeEventListener("DOMAudioPlaybackStarted", this);
      this.removeEventListener("DOMAudioPlaybackStopped", this);
      this.removeEventListener("DOMAudioPlaybackBlockStarted", this);
      this.removeEventListener("DOMAudioPlaybackBlockStopped", this);
      this.removeEventListener("GloballyAutoplayBlocked", this);
      this.removeEventListener("pagetitlechanged", this);
      this.window.removeEventListener("activate", this);
      this.window.removeEventListener("deactivate", this);
    } catch (_) { /* */ }
    try {
      // Remove tab group and split view event listeners
      this.tabContainer?.removeEventListener?.("TabGroupCollapse", this);
      this.tabContainer?.removeEventListener?.("TabGroupCreateByUser", this);
      this.tabContainer?.removeEventListener?.("TabGrouped", this);
      this.tabContainer?.removeEventListener?.("TabUngrouped", this);
      this.tabContainer?.removeEventListener?.("TabSplitViewActivate", this);
      this.tabContainer?.removeEventListener?.("TabSplitViewDeactivate", this);
      const tabpanels = doc.getElementById("tabbrowser-tabpanels");
      if (tabpanels && this._tabpanelsSelectHandler) {
        tabpanels.removeEventListener("select", this._tabpanelsSelectHandler);
        this._tabpanelsSelectHandler = null;
      }
    } catch (_) { /* */ }

    // Destroy switcher
    if (this._switcher) {
      try { this._switcher.destroy(); } catch (_) { /* */ }
      this._switcher = null;
    }

    this._initialized = false;
  },

  // ==========================================================================
  // Tab Switcher
  // tabbrowser.js L7356~L7362
  // ==========================================================================

  // upstream: _getSwitcher@554aa91a13 FIREFOX_143_0_1_RELEASE
  _getSwitcher() {
    if (!this._switcher) {
      this._switcher = new this.AsyncTabSwitcher(this);
    }
    return this._switcher;
  },

  /**
   * Pre-render a background tab so switching to it is instant.
   *
   * Delegates to `AsyncTabSwitcher` when multi-process browsing is active.
   * No-op in single-process mode.
   *
   * @param tab - The background tab to warm up.
   */
  // upstream: warmupTab@8dfb26ffd0 FIREFOX_143_0_1_RELEASE
  warmupTab(tab: MozTabbrowserTab) {
    if (typeof gMultiProcessBrowser !== "undefined" && gMultiProcessBrowser) {
      this._getSwitcher().warmupTab(tab);
    }
  },

  /** Keep `browser` rendering while it is in print preview, even in the background. */
  // upstream: activateBrowserForPrintPreview@ae73a225be FIREFOX_143_0_1_RELEASE
  activateBrowserForPrintPreview(browser: XULBrowserElement) {
    this._printPreviewBrowsers.add(browser);
    if (this._switcher) {
      this._switcher.activateBrowserForPrintPreview(browser);
    }
    (browser as any).docShellIsActive = true;
  },

  // upstream: deactivatePrintPreviewBrowsers@844d41d718 FIREFOX_143_0_1_RELEASE
  deactivatePrintPreviewBrowsers() {
    const browsers = this._printPreviewBrowsers;
    this._printPreviewBrowsers = new Set();
    for (const browser of browsers) {
      browser.docShellIsActive = this.shouldActivateDocShell(browser);
    }
  },

  // ==========================================================================
  // Progress Listeners
  // tabbrowser.js L6144~L6173, L1054~L1101
  // ==========================================================================

  /**
   * Register a global web progress listener for the selected browser.
   *
   * The listener fires only for navigation events on the selected browser.
   * Duplicate registrations are silently ignored.
   *
   * @param listener - Listener conforming to `nsIWebProgressListener`.
   */
  // upstream: addProgressListener@8631b2fd74 FIREFOX_143_0_1_RELEASE
  addProgressListener(listener: nsIWebProgressListener): void {
    if (arguments.length != 1) {
      console.error(
        "gBrowser.addProgressListener was " +
          "called with a second argument, " +
          "which is not supported. See bug " +
          "608628. Call stack: ",
        new Error().stack,
      );
    }

    this.mProgressListeners.push(listener);
  },

  /**
   * Unregister a global web progress listener.
   *
   * @param listener - The listener to remove.
   */
  // upstream: removeProgressListener@85b323f12a FIREFOX_143_0_1_RELEASE
  removeProgressListener(listener: nsIWebProgressListener): void {
    const i = this.mProgressListeners.indexOf(listener);
    if (i > -1) this.mProgressListeners.splice(i, 1);
  },

  /**
   * Register a per-tab progress listener that fires for every browser.
   *
   * Unlike `addProgressListener`, this listener receives events from all tabs,
   * not just the selected one. Duplicate registrations are silently ignored.
   *
   * @param listener - Listener conforming to `nsIWebProgressListener`.
   */
  // upstream: addTabsProgressListener@c364e37ea9 FIREFOX_143_0_1_RELEASE
  addTabsProgressListener(listener: nsIWebProgressListener): void {
    this.mTabsProgressListeners.push(listener);
  },

  /**
   * Unregister a per-tab progress listener.
   *
   * @param listener - The listener to remove.
   */
  // upstream: removeTabsProgressListener@c342b46910 FIREFOX_143_0_1_RELEASE
  removeTabsProgressListener(listener: nsIWebProgressListener): void {
    const i = this.mTabsProgressListeners.indexOf(listener);
    if (i > -1) this.mTabsProgressListeners.splice(i, 1);
  },

  // upstream: _callProgressListeners@a8d76a36e4 FIREFOX_143_0_1_RELEASE
  _callProgressListeners(
    browser: XULBrowserElement,
    method: string,
    args: any[],
    callGlobal = true,
    callTabs = true,
  ): boolean {
    let rv = true;
    browser = browser || this.selectedBrowser;

    const invoke = (listeners: any[], a: any[]) => {
      for (const p of listeners) {
        if (method in p) {
          try { if (!p[method].apply(p, a)) rv = false; }
          catch (e) { console.error(e); }  // don't inhibit other listeners
        }
      }
    };

    if (callGlobal && browser === this.selectedBrowser)
      invoke(this.mProgressListeners, args);
    if (callTabs)
      invoke(this.mTabsProgressListeners, [browser, ...args]);

    return rv;
  },
} satisfies Partial<TabbrowserCompat> & ThisType<TabbrowserCompat>;
